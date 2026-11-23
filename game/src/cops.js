// The wanted system: heat 0-5, police cruisers that spawn, pursue and
// ram, and the busted flow when they corner Mara. All state changes go
// through the game object so the HUD and missions stay in sync.
import * as THREE from 'three';
import { T } from './tuning.js';
import { clamp, dist2d, angleTo, angleLerp } from './util.js';
import { Car } from './vehicles.js';

export class Cops {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.heat = 0;
    this.cars = [];
    this.bustTimer = 0;
    this.decayTimer = 0;
    this.spawnTimer = 0;
    this.seenTimer = 0;
  }

  get wanted() { return this.heat; }

  addHeat(n) {
    if (n <= 0) return;
    const before = this.heat;
    this.heat = clamp(this.heat + n, 0, T.wantedMax);
    if (this.heat > 0 && before === 0) {
      this.decayTimer = 0;
      this.game.hud?.message('The cops are onto you.', 'bad');
      this.game.sound?.siren(true);
    }
  }

  clearHeat() {
    this.heat = 0;
    this.bustTimer = 0;
    for (const c of this.cars) c.dispose();
    this.cars = [];
    this.game.sound?.siren(false);
  }

  desiredCars() {
    if (this.heat <= 0) return 0;
    return Math.min(T.maxCopCars, 1 + Math.floor(this.heat / 2));
  }

  spawnCop() {
    const p = this.game.player;
    const tx = p.inCar ? p.inCar.x : p.x;
    const tz = p.inCar ? p.inCar.z : p.z;
    // Spawn on a road point roughly spawn-distance away, clamped in town.
    let bx = tx, bz = tz, tries = 0;
    while (tries++ < 24) {
      const a = Math.random() * Math.PI * 2;
      bx = clamp(tx + Math.sin(a) * T.copSpawnDist, -225, 200);
      bz = clamp(tz + Math.cos(a) * T.copSpawnDist, -225, 225);
      const onRoadX = [-180, -120, -60, 0, 60, 120, 180].some((l) => Math.abs(bx - l) < 7);
      const onRoadZ = [-180, -120, -60, 0, 60, 120, 180].some((l) => Math.abs(bz - l) < 7);
      if (onRoadX || onRoadZ) break;
      // Snap to the nearest road line so cruisers start on asphalt.
      const snap = (v) => [-180, -120, -60, 0, 60, 120, 180].reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
      if (Math.abs(bx - snap(bx)) < Math.abs(bz - snap(bz))) bx = snap(bx); else bz = snap(bz);
    }
    const car = new Car(this.scene, bx, bz, angleTo(bx, bz, tx, tz), 0xe8e8e8, true);
    this.cars.push(car);
    return car;
  }

  update(dt) {
    const p = this.game.player;
    if (!p || p.dead) {
      // No pursuit while Mara is down; cruisers hold position.
      for (const c of this.cars) c.drive(0, 0, dt, this.game.town.colliders);
      return;
    }
    const tx = p.inCar ? p.inCar.x : p.x;
    const tz = p.inCar ? p.inCar.z : p.z;
    const playerSpeed = p.inCar ? Math.abs(p.inCar.speed) : p.speed2d;

    if (this.heat > 0) {
      this.spawnTimer -= dt;
      if (this.cars.length < this.desiredCars() && this.spawnTimer <= 0) {
        this.spawnCop();
        this.spawnTimer = 1.2;
      }
      // A cop with eyes on Mara resets the decay clock.
      let seen = false;
      for (const c of this.cars) {
        if (dist2d(c.x, c.z, tx, tz) < 60) { seen = true; break; }
      }
      if (seen) { this.seenTimer = 0; this.decayTimer = 0; }
      else {
        this.seenTimer += dt;
        this.decayTimer += dt;
        if (this.decayTimer >= T.wantedDecayTime) {
          this.heat = Math.max(0, this.heat - 1);
          this.decayTimer = 0;
          if (this.heat === 0) this.clearHeat();
          else this.game.hud?.message('Heat is cooling off…', 'info');
        }
      }
    }

    let nearest = Infinity;
    for (const c of this.cars) {
      const d = dist2d(c.x, c.z, tx, tz);
      nearest = Math.min(nearest, d);
      // Pursuit steering: aim at Mara, lead slightly when she drives.
      const lead = p.inCar ? 0.45 : 0;
      const aimX = tx + (p.inCar ? Math.sin(p.inCar.heading) * p.inCar.speed * lead : 0);
      const aimZ = tz + (p.inCar ? Math.cos(p.inCar.heading) * p.inCar.speed * lead : 0);
      const want = angleTo(c.x, c.z, aimX, aimZ);
      let diff = want - c.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.6, -1, 1);
      // Speed control: cruise when far, creep when close, so a cruiser
      // that corners Mara holds position instead of blowing past her.
      const wantSpeed = clamp(d * 0.9, 0, T.copCarSpeed);
      let throttle = 0;
      if (c.speed < wantSpeed - 1) throttle = 1;
      else if (c.speed > wantSpeed + 2) throttle = -0.8;
      c.drive(throttle, steer, dt, this.game.town.colliders);
      // Ramming contact shoves Mara's car and rattles the camera.
      if (p.inCar && d < 4.2) {
        p.inCar.speed *= 0.82;
        this.game.shake = Math.min(0.5, (this.game.shake || 0) + 0.25);
      }
    }

    // Busted: cornered at low speed with a cruiser on top of her.
    if (this.heat > 0 && nearest < (p.inCar ? T.bustRange : T.arrestRange) && playerSpeed < 3.5) {
      this.bustTimer += dt;
      if (this.bustTimer >= T.bustHoldTime) {
        this.bustTimer = 0;
        this.game.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
  }
}
