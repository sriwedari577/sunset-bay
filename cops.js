// Sunset Bay — the wanted system and the police who answer it. Heat
// rises with crimes and cools when nobody is watching; the level sets how
// many cars and officers come, and officers on foot can make an arrest.
import { Vehicle } from './vehicles.js';
import { makePerson } from './models.js';
import { POLICE } from './tuning.js';
import { resolveWorld } from './town.js';
import { clamp, turnToward, wrapAngle } from './util.js';

export class Wanted {
  constructor() {
    this.heat = 0;
    this.level = 0;
    this.unseenFor = 0;
  }

  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 100);
    this.unseenFor = 0;
    this.level = this.levelFromHeat();
  }

  levelFromHeat() {
    if (this.heat >= 90) return 5;
    if (this.heat >= 70) return 4;
    if (this.heat >= 50) return 3;
    if (this.heat >= 30) return 2;
    if (this.heat >= 12) return 1;
    return 0;
  }

  clear() {
    this.heat = 0;
    this.level = 0;
    this.unseenFor = 0;
  }

  update(dt, seen) {
    if (seen) {
      this.unseenFor = 0;
    } else {
      this.unseenFor += dt;
      if (this.unseenFor > POLICE.decayDelay) {
        this.heat = Math.max(0, this.heat - POLICE.decayStep * dt);
        this.level = this.levelFromHeat();
      }
    }
  }
}

export class Police {
  constructor(scene, town, rng, sounds) {
    this.scene = scene;
    this.town = town;
    this.rng = rng;
    this.sounds = sounds;
    this.cars = [];
    this.officers = [];
    this.flashT = 0;
    this.arrestT = 0;
    this.pinT = 0;
    this.sirenOn = false;
  }

  wantCars(level) {
    if (level <= 0) return 0;
    return Math.min(POLICE.maxCars, level + (level >= 4 ? 1 : 0));
  }

  spawnCar(ctx) {
    // Drop in on the nearest road, a little way off, facing the player.
    const px = ctx.playerX, pz = ctx.playerZ;
    let best = null, bestD = 1e9;
    for (const line of this.town.roadLines) {
      for (const d of [-POLICE.spawnDistance, POLICE.spawnDistance]) {
        const cx = px + d, cz = line;
        const dd = Math.hypot(cx - px, cz - pz);
        if (dd < bestD) { best = { x: cx, z: cz }; bestD = dd; }
        const cx2 = line, cz2 = pz + d;
        const dd2 = Math.hypot(cx2 - px, cz2 - pz);
        if (dd2 < bestD) { best = { x: cx2, z: cz2 }; bestD = dd2; }
      }
    }
    const car = new Vehicle(this.scene, {
      paint: 0x1e2a3a, police: true,
      x: best.x, z: best.z, yaw: Math.atan2(px - best.x, pz - best.z),
    });
    car.speed = POLICE.carSpeed * 0.6;
    this.cars.push(car);
    return car;
  }

  spawnOfficer(ctx) {
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(14, 22);
    const x = ctx.playerX + Math.sin(a) * d;
    const z = ctx.playerZ + Math.cos(a) * d;
    const fixed = resolveWorld(x, z, 0.5, this.town);
    const rig = makePerson({ shirt: 0x1e2a3a, pants: 0x1e2a3a, skin: this.rng.pick([0xc9a06a, 0x8a5a3a, 0xe8c09a]), cap: 0x141c28 });
    this.scene.add(rig.group);
    const off = { rig, x: fixed.x, z: fixed.z, yaw: 0, speed: POLICE.footSpeed, cool: 0 };
    this.officers.push(off);
    return off;
  }

  clearAll() {
    for (const c of this.cars) this.scene.remove(c.group);
    for (const o of this.officers) this.scene.remove(o.rig.group);
    this.cars = [];
    this.officers = [];
    this.arrestT = 0;
    this.pinT = 0;
    this.sounds.siren(false);
    this.sirenOn = false;
  }

  // Returns { seen, busted }.
  update(dt, ctx, wanted) {
    const level = wanted.level;
    this.flashT += dt;
    const flashing = Math.floor(this.flashT * 4) % 2 === 0;
    for (const c of this.cars) c.rig.flash(flashing);

    // Siren follows the chase.
    const wantSiren = level > 0;
    if (wantSiren !== this.sirenOn) { this.sounds.siren(wantSiren); this.sirenOn = wantSiren; }

    // Match the fleet to the wanted level.
    while (this.cars.length < this.wantCars(level)) this.spawnCar(ctx);
    while (this.cars.length > this.wantCars(level)) {
      const c = this.cars.pop();
      this.scene.remove(c.group);
    }
    const wantOfficers = !ctx.playerInCar && level >= 1 ? Math.min(3, level) : 0;
    while (this.officers.length < wantOfficers) this.spawnOfficer(ctx);
    while (this.officers.length > wantOfficers) {
      const o = this.officers.pop();
      this.scene.remove(o.rig.group);
    }

    let seen = false;
    // Pursuit cars: steer at the player, ram when close.
    for (const car of this.cars) {
      const dx = ctx.playerX - car.x, dz = ctx.playerZ - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < POLICE.sightRange) seen = true;
      // Aim slightly ahead of a moving target.
      const lead = clamp(dist / 30, 0, 1.2);
      const tx = ctx.playerX + (ctx.playerVelX || 0) * lead;
      const tz = ctx.playerZ + (ctx.playerVelZ || 0) * lead;
      const want = Math.atan2(tx - car.x, tz - car.z);
      const steer = clamp(wrapAngle(want - car.yaw) * 1.6, -1, 1);
      const throttle = dist > 5 ? 1 : 0.35;
      car.drive(dt, throttle, steer, false, this.town);
      if (dist > 190) {
        // Teleport the pursuit back in range instead of letting it trail off.
        const a = this.rng.range(0, Math.PI * 2);
        car.place(ctx.playerX + Math.sin(a) * POLICE.spawnDistance, ctx.playerZ + Math.cos(a) * POLICE.spawnDistance, Math.atan2(ctx.playerX - car.x, ctx.playerZ - car.z));
        car.speed = POLICE.carSpeed * 0.6;
      }
      // Ramming contact: the main loop turns overlap into damage.
      car.touching = dist < 3.6;
    }

    // Officers on foot close in and try to hold the player for an arrest.
    let arresting = false;
    for (const o of this.officers) {
      const dx = ctx.playerX - o.x, dz = ctx.playerZ - o.z;
      const dist = Math.hypot(dx, dz);
      if (dist < POLICE.sightRange) seen = true;
      o.cool = Math.max(0, o.cool - dt);
      if (dist > POLICE.arrestRange) {
        const want = Math.atan2(dx, dz);
        o.yaw = turnToward(o.yaw, want, dt * 9);
        const nx = o.x + Math.sin(o.yaw) * o.speed * dt;
        const nz = o.z + Math.cos(o.yaw) * o.speed * dt;
        const fixed = resolveWorld(nx, nz, 0.5, this.town);
        o.x = fixed.x; o.z = fixed.z;
        o.rig.stride(dt, o.speed);
      } else {
        arresting = true;
        o.rig.stride(dt, 0.1);
      }
      o.rig.group.position.set(o.x, 0, o.z);
      o.rig.group.rotation.y = o.yaw;
    }
    if (arresting && !ctx.playerInCar) this.arrestT += dt;
    else this.arrestT = Math.max(0, this.arrestT - dt * 2);

    // Pinned: boxed in by a police car while stopped.
    const pinned = ctx.playerInCar && Math.abs(ctx.playerSpeed || 0) < 1.5 && this.cars.some((c) => Math.hypot(c.x - ctx.playerX, c.z - ctx.playerZ) < 4.5);
    if (pinned) this.pinT += dt;
    else this.pinT = Math.max(0, this.pinT - dt * 2);

    const busted = this.arrestT >= POLICE.arrestTime || this.pinT >= 3;
    return { seen, busted };
  }
}
