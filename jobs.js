// Sunset Bay — Mara's jobs: four story missions plus cash stashes hidden
// around town. A mission is a short list of steps; each step is a place to
// reach, a car to steal, heat to lose, or goons to beat. Mara talks the
// player through it, and the HUD reads the current step from here.
import * as THREE from 'three';
import { Enemy } from './fight.js';
import { TOWN } from './town.js';
import { MISSION_REWARDS, ECONOMY } from './tuning.js';
import { makeRng, fmtCash, clamp } from './util.js';

const MARA = { x: -180, z: 36 };

const MISSIONS = [
  {
    title: 'Errand for Mara',
    desc: 'Pick up the package under the pier and bring it back to the bar.',
    steps: [
      { kind: 'goto', x: 60, z: -232, r: 5, text: 'Collect the package under the pier', dialog: ['MARA', 'Rook. Package stashed under the pier, south end. Walk it back to me — and keep it casual.'] },
      { kind: 'goto', x: MARA.x, z: MARA.z, r: 6, text: 'Return to Mara\u2019s bar', dialog: ['MARA', 'That\u2019s the stuff. First job done, no heat. You\u2019ll do fine in this town.'] },
    ],
  },
  {
    title: 'Hot Wheels',
    desc: 'Steal a car, shake the police, and park up north.',
    steps: [
      { kind: 'steal', text: 'Steal a car', dialog: ['MARA', 'Kroll\u2019s boys are watching my door. Take a car that isn\u2019t yours and make some noise somewhere else.'] },
      { kind: 'heat', text: 'Get the police off your tail', dialog: ['MARA', 'You\u2019ve got stars now. Break line of sight and stay quiet until they give up.'] },
      { kind: 'goto', x: 120, z: 160, r: 8, text: 'Park up at the north crossroads', dialog: ['MARA', 'Clean. Park it up north and walk away. Kroll will never know you were mine.'] },
    ],
  },
  {
    title: 'The Drop',
    desc: 'Deliver the case to the east docks in 90 seconds. Kroll\u2019s crew is waiting.',
    steps: [
      { kind: 'goto', x: -40, z: -120, r: 8, text: 'Deliver the case to the east docks', time: 90, goons: 2, dialog: ['MARA', 'Ninety seconds, Rook. The case goes to the east docks — and Kroll sent company. Don\u2019t be late.'] },
    ],
  },
  {
    title: 'King of the Bay',
    desc: 'Take the crossroads from Kroll\u2019s crew, grab the briefcase, and bring it home.',
    steps: [
      { kind: 'defeat', count: 4, at: { x: 0, z: 0 }, text: 'Clear the crossroads of Kroll\u2019s crew', dialog: ['MARA', 'This is it. The crossroads, four of his best. Take them down and the Bay hears about it.'] },
      { kind: 'goto', x: 0, z: 0, r: 5, text: 'Grab the briefcase', dialog: ['VINCE KROLL', 'You think this town is yours, driver? Come and take it, then.'] },
      { kind: 'goto', x: MARA.x, z: MARA.z, r: 6, text: 'Bring the briefcase to Mara', dialog: ['MARA', 'It\u2019s done. The Bay is ours tonight, Rook. Drinks are on the house — forever.'] },
    ],
  },
];

export class MissionManager {
  constructor(scene, town, rng, sounds, hooks) {
    this.scene = scene;
    this.town = town;
    this.rng = rng;
    this.sounds = sounds;
    this.hooks = hooks; // { dialog(who,text), banner(main,sub), toast(text), reward(n), crime(n) }
    this.completed = 0;
    this.active = null; // { def, stepIndex, timer, hadHeat, kills }
    this.enemies = [];
    this.dialog = null; // { who, text, until }
    this.objective = 'Visit Mara\u2019s bar and take a job (M)';
    this.marker = null; // { x, z }
    this.failed = false;

    // The beacon: a tall light pillar plus a bobbing diamond over the target.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 30;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd75e }),
    );
    gem.position.y = 7;
    gem.name = 'gem';
    this.beacon.add(pillar, gem);
    this.beacon.visible = false;
    scene.add(this.beacon);

    // Cash stashes: glowing green octahedrons tucked by the kerbs. The
    // first one is Mara's package under the pier — the target of job 1 —
    // so the fixed spots keep the story and the collectibles consistent.
    this.stashes = [];
    const stashGeo = new THREE.OctahedronGeometry(0.55);
    const stashMat = new THREE.MeshBasicMaterial({ color: 0x7ddf8a });
    for (const [x, z] of TOWN.stashSpots.slice(0, ECONOMY.stashCount)) {
      const mesh = new THREE.Mesh(stashGeo, stashMat);
      mesh.position.set(x, 1.1, z);
      scene.add(mesh);
      this.stashes.push({ x, z, mesh, taken: false });
    }
  }

  listJobs() {
    return MISSIONS.map((m, i) => ({
      index: i, title: m.title, desc: m.desc,
      done: i < this.completed,
      active: this.active !== null && this.active.def === m,
      reward: MISSION_REWARDS[i],
    }));
  }

  startMission(i) {
    if (this.active || i !== this.completed || i >= MISSIONS.length) return false;
    const def = MISSIONS[i];
    this.active = { def, index: i, stepIndex: 0, timer: 0, hadHeat: false, kills: 0 };
    this.failed = false;
    this.enterStep();
    this.sounds.phone();
    return true;
  }

  enterStep() {
    const step = this.active.def.steps[this.active.stepIndex];
    this.active.timer = step.time || 0;
    this.active.hadHeat = false;
    this.active.kills = 0;
    if (step.dialog) this.say(step.dialog[0], step.dialog[1]);
    this.objective = step.text;
    if (step.goons) this.spawnGoons(step.goons, step);
    if (step.kind === 'defeat') this.spawnGoons(step.count, step);
    this.updateMarker();
  }

  spawnGoons(n, step) {
    const cx = step.at ? step.at.x : step.x;
    const cz = step.at ? step.at.z : step.z;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const e = new Enemy(this.scene, cx + Math.sin(a) * 9, cz + Math.cos(a) * 9, {
        health: 60, speed: 4.8, damage: 9,
      });
      this.enemies.push(e);
    }
  }

  say(who, text) {
    this.dialog = { who, text, until: performance.now() / 1000 + 5 };
    this.hooks.dialog(who, text);
  }

  failActive(reason) {
    if (!this.active) return;
    this.hooks.banner('JOB FAILED', reason || 'Try again from the jobs menu (M)');
    this.sounds.sting(false);
    this.clearGoons();
    this.active = null;
    this.marker = null;
    this.beacon.visible = false;
    this.objective = 'Visit Mara\u2019s bar and take a job (M)';
    this.failed = true;
  }

  clearGoons() {
    for (const e of this.enemies) e.remove();
    this.enemies = [];
  }

  completeMission() {
    const i = this.active.index;
    const reward = MISSION_REWARDS[i];
    this.completed = Math.max(this.completed, i + 1);
    this.active = null;
    this.marker = null;
    this.beacon.visible = false;
    this.clearGoons();
    this.hooks.reward(reward);
    this.sounds.sting(true);
    if (this.completed >= MISSIONS.length) {
      this.hooks.banner('SUNSET BAY IS YOURS', 'Every job done. Mara\u2019s bar stays open, and the town knows your name.');
      this.objective = 'All jobs complete — free roam. Thanks for playing!';
    } else {
      this.hooks.banner('JOB COMPLETE', `${fmtCash(reward)} earned — next job is waiting at Mara\u2019s (M)`);
      this.objective = 'Visit Mara\u2019s bar and take a job (M)';
    }
  }

  advance() {
    this.active.stepIndex += 1;
    if (this.active.stepIndex >= this.active.def.steps.length) this.completeMission();
    else this.enterStep();
  }

  updateMarker() {
    const step = this.active ? this.active.def.steps[this.active.stepIndex] : null;
    if (step && (step.kind === 'goto' || step.kind === 'defeat')) {
      const p = step.kind === 'defeat' ? step.at : step;
      this.marker = { x: p.x, z: p.z };
      this.beacon.position.set(p.x, 0, p.z);
      this.beacon.visible = true;
    } else {
      this.marker = null;
      this.beacon.visible = false;
    }
  }

  update(dt, ctx) {
    // ctx: { playerX, playerZ, inCar, stolenCar, wantedLevel, onHitPlayer(dmg), time }
    const now = performance.now() / 1000;
    if (this.dialog && now > this.dialog.until) this.dialog = null;
    this.beacon.children.forEach((c) => { if (c.name === 'gem') { c.rotation.y += dt * 2; c.position.y = 7 + Math.sin(now * 2.4) * 0.5; } });

    for (const s of this.stashes) {
      if (s.taken) continue;
      s.mesh.rotation.y += dt * 1.6;
      s.mesh.position.y = 1.1 + Math.sin(now * 2 + s.x) * 0.18;
      if (!ctx.inCar && Math.hypot(ctx.playerX - s.x, ctx.playerZ - s.z) < 2.2) {
        s.taken = true;
        this.scene.remove(s.mesh);
        this.hooks.reward(ECONOMY.stashValue);
        this.hooks.toast(`Stash found: ${fmtCash(ECONOMY.stashValue)}`);
        this.sounds.pickup();
      }
    }

    // Goons fight and fall; count the kills for defeat steps.
    // Hold the list reference for the whole loop: a goon's hit can kill
    // the player mid-loop, and endRun -> failActive -> clearGoons replaces
    // this.enemies, so the live field must never be re-read inside it.
    const enemies = this.enemies;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const wasDead = e.dead;
      e.update(dt, { x: ctx.playerX, z: ctx.playerZ }, this.town, ctx.onHitPlayer);
      if (this.enemies !== enemies) break; // mission failed mid-loop; goons cleared
      if (e.dead && !wasDead) {
        this.active && (this.active.kills += 1);
        this.hooks.crime(8);
      }
    }

    if (!this.active) return;
    const step = this.active.def.steps[this.active.stepIndex];
    if (step.time) {
      this.active.timer -= dt;
      if (this.active.timer <= 0) { this.failActive('Out of time'); return; }
    }
    if (ctx.wantedLevel > 0) this.active.hadHeat = true;
    const dTarget = step.x !== undefined ? Math.hypot(ctx.playerX - step.x, ctx.playerZ - step.z) : 1e9;
    switch (step.kind) {
      case 'goto':
        // A step that names a stash only counts once the package is in hand.
        if (step.stash !== undefined && !this.stashes[step.stash].taken) break;
        if (dTarget < step.r) this.advance();
        break;
      case 'steal':
        if (ctx.inCar && ctx.stolenCar) this.advance();
        break;
      case 'heat':
        if (this.active.hadHeat && ctx.wantedLevel === 0) this.advance();
        break;
      case 'defeat':
        if (this.active.kills >= step.count) this.advance();
        break;
      default:
        break;
    }
    void clamp;
  }
}
