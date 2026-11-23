// Sunset Bay: boot, the main loop, screen flow, camera, crime hooks and
// the test/staging hooks. Everything the other modules expose meets here.
import * as THREE from 'three';
import { T } from './tuning.js';
import { clamp, damp, angleLerp, dist2d } from './util.js';
import { buildTown } from './town.js';
import { Player } from './player.js';
import { spawnParkedCars } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Cops } from './cops.js';
import { GoonHorde } from './fight.js';
import { Missions } from './jobs.js';
import { HUD } from './hud.js';
import { Input } from './controls.js';
import { Sound } from './sound.js';
import { saveGame, loadGame } from './save.js';
import { applyShot } from './shots.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot') ? parseInt(params.get('shot'), 10) : 0;
const TEST = params.has('test');

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d6);
    this.scene.fog = new THREE.Fog(0x87b5d6, 160, 420);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x5a5a48, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
    sun.position.set(90, 140, 50);
    this.scene.add(sun);

    this.sound = new Sound();
    this.hud = new HUD();
    this.input = new Input();
    this.town = buildTown(this.scene);
    this.player = new Player(this.scene, this);
    this.parkedCars = spawnParkedCars(this.scene, mulberrySeed(), this.town.colliders);
    this.traffic = new Traffic(this.scene, this);
    this.cops = new Cops(this.scene, this);
    this.horde = new GoonHorde(this.scene, this);
    this.missions = new Missions(this.scene, this);
    this.camYaw = 0; // == Mara's heading (PI) + PI: the camera starts behind her
    this.camPos = new THREE.Vector3(0, 9, 35);
    this.shake = 0;
    this.state = 'title';
    this.jobsOpen = false;
    this.overlayTimer = 0;
    this.mapTimer = 0;
    this.saveTimer = 0;
    this.shotCamera = null;
    this.shotActive = false;
    this.shotLabel = '';
    this.tracers = [];
    this.time = 0;
    this.ready = false;

    this.save = () => saveGame(this);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.getElementById('start-btn')?.addEventListener('click', () => this.startGame());
    document.getElementById('resume-btn')?.addEventListener('click', () => this.hideOverlaysAndRespawn());
    document.getElementById('resume-btn2')?.addEventListener('click', () => this.hideOverlaysAndRespawn());
    document.getElementById('jobs-close')?.addEventListener('click', () => this.toggleJobs(false));
    window.addEventListener('keydown', (e) => {
      if (this.jobsOpen && /^Digit[1-4]$/.test(e.code)) {
        this.missions.start('m' + e.code.slice(5));
        this.toggleJobs(false);
      }
      if (this.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) this.startGame();
      if ((this.state === 'busted' || this.state === 'wasted') && (e.code === 'Enter' || e.code === 'Space')) {
        this.hideOverlaysAndRespawn();
      }
    });
    window.addEventListener('pointerdown', () => this.sound.unlock(), { once: true });

    if (SHOT >= 1 && SHOT <= 4) {
      applyShot(this, SHOT);
      this.hud.showTitle(false);
    } else {
      this.hud.showTitle(true);
      this.hud.setObjective('');
    }

    if (TEST) {
      window.__game = this;
      this.testHelpers();
    }
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  testHelpers() {
    const input = this.input;
    this.test = {
      hold: (a, on = true) => input.testHold(a, on),
      tap: (a) => input.testTap(a),
      click: () => { input.mouseClicked = true; },
      teleport: (x, z) => {
        if (this.player.inCar) { this.player.inCar.place(x, z, this.player.inCar.heading); }
        this.player.place(x, z);
      },
      startMission: (id) => this.missions.start(id),
      state: () => this.state,
      errors: () => window.__errors,
    };
  }

  startGame() {
    if (this.state !== 'title') return;
    this.sound.unlock();
    this.state = 'playing';
    this.hud.showTitle(false);
    if (!SHOT) {
      const had = loadGame(this);
      this.hud.toast(had ? 'Save loaded — welcome back to Sunset Bay.' : 'Welcome to Sunset Bay. Press J for jobs.');
    }
    this.hud.setObjective(this.missions.active ? '' : 'Press J to pick a job');
  }

  // --- hooks called by the other modules -------------------------------
  onCrime(kind, amount) {
    if (kind === 'steal' || kind === 'pedDown') this.cops.addHeat(amount);
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.overlayTimer = 0;
    this.missions.onPlayerDeath();
    this.cops.clearHeat();
    this.hud.setObjective('');
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.overlayTimer = 0;
    const fine = Math.min(this.player.cash, this.cops.heat * T.finePerStar);
    this.player.cash -= fine;
    this.hud.message(`Busted! Fine paid: $${fine}.`, 'bad');
    this.cops.clearHeat();
    this.hud.setObjective('');
  }

  onGoonDown() {
    this.missions.onGoonDown();
  }

  hideOverlaysAndRespawn() {
    if (this.state !== 'busted' && this.state !== 'wasted') return;
    const p = this.player;
    p.revive();
    this.horde.clear();
    p.place(0, -34, Math.PI);
    if (p.inCar) p.inCar = null;
    p.mesh.visible = true;
    this.hud.showBusted(false);
    this.hud.showWasted(false);
    this.state = 'playing';
    this.hud.setObjective('Press J to pick a job');
    this.save();
  }

  toggleJobs(open) {
    this.jobsOpen = open;
    this.hud.showJobs(open, this.missions.definitions(), this.missions.completed);
  }

  setShotCamera(pos, lookAt) {
    this.shotCamera = { pos: new THREE.Vector3(...pos), lookAt: new THREE.Vector3(...lookAt) };
  }

  tracer(x, z, heading, len) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 1.3, z),
      new THREE.Vector3(x + Math.sin(heading) * len, 1.3, z + Math.cos(heading) * len),
    ]);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // --- per-frame --------------------------------------------------------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    if (this.state === 'title') {
      const t = this.time * 0.08;
      this.camera.position.set(Math.sin(t) * 70, 34, Math.cos(t) * 70);
      this.camera.lookAt(0, 8, 0);
      this.town.update(dt, this.time);
      this.renderer.render(this.scene, this.camera);
      this.ready = true;
      this.input.endFrame();
      return;
    }

    const input = this.input;
    const p = this.player;

    if (this.state === 'playing') {
      // Shot cameras hold until the player actually drives or walks.
      if (this.shotCamera && (input.forward || input.back || input.left || input.right || input.wasPressed('interact'))) {
        this.shotCamera = null;
      }
      // Jobs menu.
      if (input.consume('jobs')) this.toggleJobs(!this.jobsOpen);

      // Interact: dialog first, then car, then nothing.
      if (input.consume('interact')) {
        if (this.hud.dialogTimer) this.hud.advanceDialog();
        else if (p.inCar) { if (Math.abs(p.inCar.speed) < 6) p.exitCar(); }
        else {
          const car = p.nearestCar([...this.parkedCars, ...this.traffic.cars]);
          if (car) p.enterCar(car);
        }
      }
      if (input.consume('punch')) p.punch(this.horde.damageables());
      if (input.consumeClick()) {
        if (!p.inCar && !this.jobsOpen) p.shoot(this.horde.damageables(), p.heading);
      }

      // Movement / driving.
      if (p.inCar) {
        const car = p.inCar;
        const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
        // Screen-left turns toward screen-left: with forward = (sin h,
        // cos h), pressing left increases the heading.
        const steer = (input.left ? 1 : 0) + (input.right ? -1 : 0);
        car.drive(throttle, steer, dt, this.town.colliders);
        p.x = car.x; p.z = car.z; p.heading = car.heading;
        if (this.shotActive) this.shotActive = false;
      } else {
        p.update(dt, input, this.camYaw);
      }

      this.traffic.update(dt);
      this.cops.update(dt);
      this.horde.update(dt);
      this.missions.update(dt);
      this.town.update(dt, this.time);

      // Context prompt.
      let prompt = '';
      if (!p.inCar) {
        const car = p.nearestCar([...this.parkedCars, ...this.traffic.cars]);
        if (car) prompt = 'E — Take the car';
        else if (this.horde.alive().some((g) => dist2d(p.x, p.z, g.x, g.z) < 7)) prompt = 'F — Punch    Click — Shoot';
      } else {
        prompt = 'E — Get out    W/S — Drive';
      }
      this.hud.setPrompt(prompt);

      // Periodic save.
      this.saveTimer += dt;
      if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }
    } else if (this.state === 'busted' || this.state === 'wasted') {
      this.overlayTimer += dt;
      if (this.overlayTimer > 0.9) {
        if (this.state === 'busted') this.hud.showBusted(true);
        else this.hud.showWasted(true);
      }
      this.traffic.update(dt);
      this.horde.update(dt);
      this.town.update(dt, this.time);
    }

    // HUD readouts + minimap.
    const speed = p.inCar ? p.inCar.speed : p.speed2d;
    this.hud.setStats({
      heat: this.cops.heat, cash: p.cash, health: p.health, maxHealth: p.maxHealth,
      speed, weapon: p.weapon, ammo: p.ammo,
    });
    this.hud.setVignette(p.hurtFlash * 2);
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.12;
      this.hud.drawMinimap({
        player: p.inCar ? p.inCar : p,
        cops: this.cops.cars,
        goons: this.horde.alive(),
        stashes: this.missions.stashes,
        beacon: this.missions.beacon ? { x: this.missions.beacon.position.x, z: this.missions.beacon.position.z } : null,
      });
    }

    // Tracers fade fast.
    for (const t of [...this.tracers]) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }

    // Camera.
    this.updateCamera(dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.4);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.renderer.render(this.scene, this.camera);
    if (!this.ready) {
      this.ready = true;
      window.__shotReady = true;
    }
    this.input.endFrame();
  }

  updateCamera(dt) {
    if (this.shotCamera) {
      this.camera.position.copy(this.shotCamera.pos);
      this.camera.lookAt(this.shotCamera.lookAt);
      return;
    }
    const p = this.player;
    const focus = p.inCar ? p.inCar : p;
    const heading = focus.heading;
    const targetYaw = heading + Math.PI;
    this.camYaw = angleLerp(this.camYaw, targetYaw, 1 - Math.exp(-2.2 * dt));
    const back = p.inCar ? T.camBack + 3 : T.camBack;
    const height = p.inCar ? T.camHeight + 1.5 : T.camHeight;
    const desired = new THREE.Vector3(
      focus.x + Math.sin(this.camYaw) * back,
      height,
      focus.z + Math.cos(this.camYaw) * back
    );
    this.camPos.x = damp(this.camPos.x, desired.x, 6, dt);
    this.camPos.y = damp(this.camPos.y, desired.y, 6, dt);
    this.camPos.z = damp(this.camPos.z, desired.z, 6, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(focus.x, 1.6, focus.z);
  }
}

function mulberrySeed() {
  // Seeded RNG for parked cars: same layout on every load.
  let a = 20261123;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

new Game();
