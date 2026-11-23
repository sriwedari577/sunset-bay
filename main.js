// Sunset Bay — boot and the one game loop. Wires the town, the player,
// traffic, police, combat, Mara's jobs and the HUD into title screen, free
// roam, jobs, busted and wasted, saving, and the deterministic ?shot=
// scenes the screenshots are taken from.
import * as THREE from 'three';
import { buildTown, TOWN } from './town.js';
import { makeRng, hashSeed, clamp } from './util.js';
import { Input } from './controls.js';
import { SoundBank } from './sound.js';
import { Player } from './player.js';
import { Vehicle, separateVehicles } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Wanted, Police } from './cops.js';
import { Combat } from './fight.js';
import { MissionManager } from './jobs.js';
import { HUD } from './hud.js';
import { loadSave, writeSave } from './save.js';
import { ECONOMY, WEAPONS, KEYS, PLAYER, POLICE } from './tuning.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const SHOT_MODE = !!shotName;
const seed = hashSeed(params.get('seed') || 'sunset-bay-1');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const scene = new THREE.Scene();
const rng = makeRng(seed);
const town = buildTown(scene, seed);
const sounds = new SoundBank();
const input = new Input(canvas, () => sounds.ensure());
const player = new Player(scene, town, input, sounds, camera);
const traffic = new Traffic(scene, town, rng);
const wanted = new Wanted();
const police = new Police(scene, town, rng, sounds);
const combat = new Combat(scene);
const hud = new HUD(Object.assign({}, town, { seaZ: TOWN.seaZ, beachZ: TOWN.beachZ }));

let cash = ECONOMY.startCash;
let mode = 'title'; // title | play | paused | jobs | busted | wasted
let wasInCar = false;
let ramCool = 0;
let saveTimer = 0;
let endKind = null;

const jobs = new MissionManager(scene, town, rng, sounds, {
  dialog: (who, text) => hud.setDialog(who, text),
  banner: (main, sub) => hud.showBanner(main, sub),
  toast: (text) => hud.showToast(text),
  reward: (n) => { cash += n; sounds.pickup(); saveGame(); },
  crime: (n) => wanted.addHeat(n),
});

function saveGame() {
  writeSave({
    cash,
    completed: jobs.completed,
    stashes: jobs.stashes.map((s, i) => (s.taken ? i : -1)).filter((i) => i >= 0),
    x: player.x, z: player.z, yaw: player.yaw,
    weapon: player.weapon, ammo: player.ammo,
  });
}

function restoreSave(saved) {
  cash = saved.cash ?? ECONOMY.startCash;
  jobs.completed = saved.completed || 0;
  for (const i of saved.stashes || []) {
    const s = jobs.stashes[i];
    if (s) { s.taken = true; scene.remove(s.mesh); }
  }
  if (typeof saved.x === 'number') player.spawn(saved.x, saved.z, saved.yaw || 0);
  if (saved.weapon) player.weapon = saved.weapon;
  if (typeof saved.ammo === 'number') player.ammo = saved.ammo;
}

const saved = loadSave();
// Screenshot staging must be deterministic: a returning player's save
// would otherwise leak into the staged scenes.
if (saved && !SHOT_MODE) restoreSave(saved);
player.spawn(player.x, player.z, player.yaw);

// ---- Screen flow ----
function startGame() {
  sounds.ensure();
  sounds.startMusic();
  hud.close();
  mode = 'play';
  input.lock();
}

function pauseGame() {
  if (mode !== 'play') return;
  mode = 'paused';
  input.unlock();
  hud.pauseScreen(
    () => startGame(),
    () => openJobs('paused'),
    () => { saveGame(); showTitle(); },
    () => { sounds.setMuted(!sounds.muted); pauseGameRefresh(); },
    sounds.muted,
  );
}

function pauseGameRefresh() {
  if (mode === 'paused') {
    hud.pauseScreen(
      () => startGame(),
      () => openJobs('paused'),
      () => { saveGame(); showTitle(); },
      () => { sounds.setMuted(!sounds.muted); pauseGameRefresh(); },
      sounds.muted,
    );
  }
}

function showTitle() {
  mode = 'title';
  input.unlock();
  hud.titleScreen(!!saved, () => startGame(), () => openJobs('title'),
    () => { sounds.setMuted(!sounds.muted); showTitle(); }, sounds.muted);
}

function openJobs(returnTo) {
  mode = 'jobs';
  input.unlock();
  hud.jobsScreen(jobs.listJobs(), (i) => {
    if (jobs.startMission(i)) {
      hud.showToast(`Job started: ${jobs.listJobs()[i].title}`);
      sounds.click();
      if (returnTo === 'play' || mode === 'jobs') { hud.close(); mode = 'play'; input.lock(); }
    } else {
      hud.showToast('Finish the current job first');
    }
  }, () => {
    if (returnTo === 'paused') pauseGameRefresh();
    else if (returnTo === 'title') showTitle();
    else { hud.close(); mode = 'play'; input.lock(); }
  });
}

function endRun(kind) {
  endKind = kind;
  const fine = kind === 'busted' ? ECONOMY.bustedFine : ECONOMY.wastedFine;
  cash = Math.max(0, cash - fine);
  if (player.inCar) player.exitCar();
  jobs.failActive(kind === 'busted' ? 'Busted by the police' : 'Wasted');
  wanted.clear();
  police.clearAll();
  sounds.engine(false, 0);
  sounds.sting(false);
  mode = kind;
  input.unlock();
  player.health = PLAYER.health;
  player.dead = false;
  hud.endScreen(kind, fine, () => {
    player.spawn(-180, 34, 0);
    saveGame();
    hud.close();
    mode = 'play';
    input.lock();
  });
}

input.onLockLost = () => {
  if (mode === 'play' && !SHOT_MODE) pauseGame();
};

// ---- Shot-mode helpers (used by shots.js) ----
// Nearest road centre line to a coordinate: staging places traffic and
// pedestrians on a real road so they read as street life, not props.
function nearestRoad(v) {
  let best = town.roadLines[0];
  for (const line of town.roadLines) if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  return best;
}
const shotApi = {
  teleportPlayer(x, z, yaw) { player.spawn(x, z, yaw); },
  setCamera(yaw, pitch, dist) {
    player.camYaw = yaw; player.camPitch = pitch; player.camDist = dist;
    player.updateCamera(0);
  },
  giveCar(x, z, yaw, paint) {
    const v = new Vehicle(scene, { paint, x, z, yaw });
    traffic.parked.push(v);
    player.enterCar(v);
    traffic.release(v);
    wasInCar = true;
  },
  setWantedHeat(n) { wanted.addHeat(n); },
  placePoliceNear(n) {
    for (let i = 0; i < n; i++) {
      const c = police.spawnCar({ playerX: player.x, playerZ: player.z });
      const a = Math.PI + (i - (n - 1) / 2) * 0.5;
      c.place(player.x + Math.sin(player.yaw + a) * 18, player.z + Math.cos(player.yaw + a) * 18, player.yaw);
      c.speed = 16;
    }
  },
  placePoliceAhead(n) {
    // Pursuit closing head-on: visible in the chase frame, converging
    // on the player while the settle frames run.
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const lx = fz, lz = -fx;
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * 7;
      const c = police.spawnCar({ playerX: player.x, playerZ: player.z });
      c.place(player.x + fx * 27 + lx * side, player.z + fz * 27 + lz * side, player.yaw + Math.PI);
      c.speed = 14;
    }
  },
  placeTrafficNear(n) {
    // Stage moving traffic on the road the shot camera looks down, so the
    // foot/drive frames show live traffic. Shot staging only: repositions
    // existing traffic cars onto their own road, never changes how traffic
    // drives. Call after setCamera: placement is relative to the camera view.
    const vx = Math.sin(player.camYaw), vz = Math.cos(player.camYaw);
    const alongZ = Math.abs(vz) >= Math.abs(vx);
    const line = nearestRoad(alongZ ? player.x : player.z);
    for (let i = 0; i < n && i < traffic.cars.length; i++) {
      const car = traffic.cars[i];
      const dir = i % 2 === 0 ? 1 : -1;
      const d = 14 + i * 9;
      if (alongZ) {
        car.route = { axis: 'z', line, dir };
        car.place(line + dir * 2.4, player.z + vz * d, dir > 0 ? 0 : Math.PI);
      } else {
        car.route = { axis: 'x', line, dir };
        car.place(player.x + vx * d, line + dir * 2.4, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      car.speed = car.cruise;
    }
  },
  placePedsNear(n) {
    // Stage pedestrians on the sidewalks in view of the shot camera. Shot
    // staging only: repositions existing peds and gives each a nearby
    // target to walk to, never changes ped AI. Call after setCamera.
    const vx = Math.sin(player.camYaw), vz = Math.cos(player.camYaw);
    const alongZ = Math.abs(vz) >= Math.abs(vx);
    const line = nearestRoad(alongZ ? player.x : player.z);
    for (let i = 0; i < n && i < traffic.peds.length; i++) {
      const ped = traffic.peds[i];
      const side = i % 2 === 0 ? 1 : -1;
      const d = 9 + Math.floor(i / 2) * 8;
      if (alongZ) {
        ped.x = line + side * 7.5;
        ped.z = player.z + vz * d;
        ped.tx = ped.x;
        ped.tz = ped.z + vz * 12;
        ped.yaw = vz > 0 ? 0 : Math.PI;
      } else {
        ped.x = player.x + vx * d;
        ped.z = line + side * 7.5;
        ped.tx = ped.x + vx * 12;
        ped.tz = ped.z;
        ped.yaw = vx > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      ped.wait = 0; ped.flee = 0; ped.downT = 0;
    }
  },
  startJob(i) { jobs.completed = i; jobs.startMission(i); },
  setObjective(text) { jobs.objective = text; },
  say(who, text) { jobs.say(who, text); },
};

// ---- Per-frame world update ----
function updateWorld(dt) {
  const allowInput = mode === 'play';
  const vehicles = traffic.stealables().concat(police.cars);
  player.update(dt, { vehicles, allowInput });

  // Stealing: first entry into a car that was not already ours.
  if (player.inCar && !wasInCar && player.car) {
    const car = player.car;
    if (car.stolen && !car.heatCounted) {
      car.heatCounted = true;
      wanted.addHeat(18);
      hud.showToast('Car stolen — the police will notice');
      sounds.crash();
    }
    traffic.release(car);
  }
  wasInCar = player.inCar;

  // Pedestrians hit by the player's car.
  if (player.inCar && Math.abs(player.car.speed) > 8) {
    for (const ped of traffic.peds) {
      if (ped.downT > 0) continue;
      const d = Math.hypot(ped.x - player.x, ped.z - player.z);
      if (d < 2.4) {
        ped.downT = 2.5;
        wanted.addHeat(12);
        sounds.crash();
        hud.showToast('Pedestrian hit!');
      }
    }
  }

  traffic.update(dt, {
    playerX: player.x, playerZ: player.z,
    playerSpeed: Math.abs(player.car ? player.car.speed : 0),
    playerInCar: player.inCar,
  });

  const pres = police.update(dt, {
    playerX: player.x, playerZ: player.z,
    playerVelX: player.velX, playerVelZ: player.velZ,
    playerInCar: player.inCar,
    playerSpeed: Math.abs(player.car ? player.car.speed : 0),
  }, wanted);
  wanted.update(dt, pres.seen);

  // Ramming damage from police cars.
  ramCool = Math.max(0, ramCool - dt);
  if (ramCool <= 0) {
    for (const c of police.cars) {
      if (c.touching && Math.abs(c.speed) > 5) {
        if (player.damage(POLICE.ramDamage)) {
          endRun('wasted');
          return;
        }
        sounds.crash();
        ramCool = 1;
        break;
      }
    }
  }

  // Combat input.
  if (allowInput) {
    if (input.hit(KEYS.weapon)) {
      player.weapon = player.weapon === 'fists' ? 'pistol' : 'fists';
      sounds.click();
    }
    if (input.hit(KEYS.reload) && player.weapon === 'pistol' && player.ammo < WEAPONS.pistolMag) {
      player.reloadT = WEAPONS.reloadTime;
      player.reloading = true;
      sounds.reload();
    }
    if (player.reloading && player.reloadT <= 0) {
      player.ammo = WEAPONS.pistolMag;
      player.reloading = false;
    }
    const clicked = input.takeClick() && input.locked;
    const wantPunch = input.hit(KEYS.punch) || (clicked && player.weapon === 'fists');
    if (wantPunch) {
      const hit = combat.punch(player, jobs.enemies, sounds);
      if (hit && hit.killed) wanted.addHeat(6);
    }
    const wantShot = clicked && player.weapon === 'pistol';
    if (wantShot) {
      const res = combat.shoot(player, jobs.enemies, camera, sounds);
      if (res && res !== 'miss' && res !== 'reload') wanted.addHeat(3);
    }
    if (input.hit(KEYS.phone)) openJobs('play');
    if (input.hit(KEYS.mute)) sounds.setMuted(!sounds.muted);
    if (input.hit(KEYS.pause) || input.hit(KEYS.escape)) pauseGame();
  }
  combat.update(dt);

  jobs.update(dt, {
    playerX: player.x, playerZ: player.z,
    inCar: player.inCar, stolenCar: !!(player.car && player.car.stolen),
    wantedLevel: wanted.level,
    onHitPlayer: (dmg) => {
      if (player.damage(dmg)) { endRun('wasted'); }
    },
  });

  separateVehicles(traffic.stealables().concat(police.cars));

  // Clouds drift east and wrap.
  for (const c of town.clouds) {
    c.position.x += dt * 1.5;
    if (c.position.x > 270) c.position.x = -270;
  }

  if (pres.busted) { endRun('busted'); return; }
  if (player.dead && mode === 'play') { endRun('wasted'); return; }

  // Context hint.
  let hint = '';
  if (!player.inCar) {
    const near = player.nearestVehicle(vehicles);
    if (near) hint = 'Press E to steal the car';
    else if (!jobs.active && Math.hypot(player.x - (-180), player.z - 36) < 14) hint = 'Press M for Mara\u2019s jobs';
    else if (player.weapon === 'pistol') hint = 'Click to shoot • R reload • Q fists';
    else hint = 'F punch • Q pistol • M jobs';
  } else {
    hint = 'E to leave the car • Space handbrake';
  }

  hud.update({
    stars: wanted.level,
    cash,
    health: player.health,
    speed: player.speedShown,
    weaponLabel: player.weapon === 'pistol'
      ? `PISTOL ${player.ammo}/${WEAPONS.pistolMag}${player.reloadT > 0 ? ' …' : ''}`
      : 'FISTS',
    aiming: player.weapon === 'pistol' && !player.inCar,
    hurt: player.hurtT,
    objective: jobs.objective + (jobs.active && jobs.active.def.steps[jobs.active.stepIndex].time
      ? ` — ${Math.ceil(jobs.active.timer)}s` : ''),
    hint,
    dialog: jobs.dialog,
    announce: jobs.dialog ? `${jobs.dialog.who}: ${jobs.dialog.text}` : '',
    marker: jobs.marker,
    enemies: jobs.enemies,
    police: police.cars.concat(police.officers),
    playerX: player.x, playerZ: player.z, playerYaw: player.yaw,
  });

  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; if (mode === 'play') saveGame(); }
  input.endFrame();
}

// ---- Boot ----
if (SHOT_MODE) {
  hud.close();
  mode = 'play';
  stageShot(shotName, shotApi);
  for (let i = 0; i < 40; i++) updateWorld(1 / 60);
  // Shot-mode inspection (only present behind ?shot=).
  window.__shotState = () => ({
    player: { x: player.x, z: player.z, yaw: player.yaw, camYaw: player.camYaw },
    police: police.cars.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), speed: Math.round(c.speed), yaw: +c.yaw.toFixed(2) })),
    traffic: traffic.cars.length,
    wanted: wanted.level,
  });
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    requestAnimationFrame(() => {
      renderer.render(scene, camera);
      window.__shotReady = true;
    });
  });
} else {
  showTitle();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (mode === 'play') updateWorld(dt);
    else input.endFrame();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// Test-only hook (?test=1): lets the headless playtest drive the game
// without a mouse. Not present in normal play.
if (params.get('test') === '1') {
  window.__test = {
    state: () => ({
      x: player.x, z: player.z, yaw: player.yaw,
      inCar: player.inCar, speed: player.speedShown,
      stars: wanted.level, heat: Math.round(wanted.heat),
      cash, mode, health: player.health,
      objective: jobs.objective, marker: jobs.marker,
      enemies: jobs.enemies.map((e) => ({ health: e.health, dead: e.dead, x: e.x, z: e.z })),
      police: police.cars.length + police.officers.length,
      policePos: police.cars.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), speed: Math.round(c.speed) })),
      parked: traffic.parked.map((v) => ({ x: v.x, z: v.z, stolen: v.stolen })),
      stashes: jobs.stashes.map((s) => ({ x: s.x, z: s.z, taken: s.taken })),
      ammo: player.ammo, weapon: player.weapon,
      completed: jobs.completed,
    }),
    start: () => { if (mode === 'title') startGame(); },
    teleport: (x, z, yaw) => player.spawn(x, z, yaw ?? player.yaw),
    startJob: (i) => { jobs.completed = i; return jobs.startMission(i); },
  };
}
