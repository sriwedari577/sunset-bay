// Mara Voss on foot: movement, building collision, getting in and out of
// cars, punching, shooting, health and the wasted flow. The game object
// passed in (`game`) carries the shared world state; the player never
// touches the DOM directly.
import * as THREE from 'three';
import { T } from './tuning.js';
import { clamp, collideCircle, dist2d } from './util.js';
import { makePersonMesh } from './models.js';

export class Player {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    const built = makePersonMesh(0xd84a2a, 0x2a3a55);
    this.body = built;
    this.mesh = built.group;
    scene.add(this.mesh);
    this.x = 0; this.z = 24; this.heading = Math.PI;
    this.vx = 0; this.vz = 0;
    this.health = T.playerHealth;
    this.maxHealth = T.playerHealth;
    this.cash = T.startCash;
    this.ammo = T.pistolAmmoStart;
    this.hasPistol = true;
    this.weapon = 'pistol';
    this.dead = false;
    this.inCar = null;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.shootTimer = 0;
    this.hurtFlash = 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  get speed2d() { return Math.hypot(this.vx, this.vz); }

  place(x, z, heading = this.heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  // Movement input is camera-relative: forward is away from the camera.
  update(dt, input, camYaw) {
    if (this.dead) return;
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.inCar) return; // the car drives itself in main.js

    let ix = 0, iz = 0;
    if (input.forward) iz += 1;
    if (input.back) iz -= 1;
    if (input.left) ix -= 1;
    if (input.right) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const run = input.run;
    const speed = run ? T.runSpeed : T.walkSpeed;
    if (moving) {
      const len = Math.hypot(ix, iz);
      // Forward is away from the camera: the camera sits behind Mara at
      // camYaw, so "forward" is the opposite of the camera offset.
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const wx = (fx * iz + rx * ix) / len, wz = (fz * iz + rz * ix) / len;
      this.vx = wx * speed; this.vz = wz * speed;
      this.heading = Math.atan2(this.vx, this.vz);
      this.walkPhase += dt * (run ? 11 : 7.5);
    } else {
      this.vx = 0; this.vz = 0;
    }
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const solved = collideCircle(nx, nz, T.playerRadius, this.game.town.colliders);
    this.x = clamp(solved.x, -T.worldHalf + 2, T.worldHalf - 2);
    this.z = clamp(solved.z, -T.worldHalf + 2, T.worldHalf - 2);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.body.setWalk(this.walkPhase, moving);
  }

  nearestCar(cars, maxDist = 4.2) {
    let best = null, bd = maxDist;
    for (const c of cars) {
      if (c.dead) continue;
      const d = dist2d(this.x, this.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar(car) {
    if (!car || this.inCar) return false;
    this.inCar = car;
    this.mesh.visible = false;
    this.game.onCrime('steal', T.stealWanted);
    this.game.sound?.carDoor();
    return true;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    const side = car.heading + Math.PI / 2;
    this.place(car.x + Math.sin(side) * 3.2, car.z + Math.cos(side) * 3.2, car.heading);
    this.mesh.visible = true;
    this.game.sound?.carDoor();
  }

  // Melee: hits the closest damageable thing in front of Mara.
  punch(targets) {
    if (this.punchTimer > 0 || this.dead || this.inCar) return false;
    this.punchTimer = T.punchCooldown;
    this.game.sound?.punch();
    let hitAny = false;
    for (const t of targets) {
      if (t.dead || t.health <= 0) continue;
      const d = dist2d(this.x, this.z, t.x, t.z);
      if (d > T.punchRange) continue;
      const ang = Math.atan2(t.x - this.x, t.z - this.z);
      let diff = Math.abs(ang - this.heading);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.1) continue;
      t.damage(T.punchDamage, this);
      hitAny = true;
    }
    return hitAny;
  }

  // Hitscan pistol: a ray from Mara toward the aim heading.
  shoot(targets, aimHeading) {
    if (this.shootTimer > 0 || this.dead || this.inCar) return false;
    if (this.ammo <= 0) { this.game.sound?.click(); this.shootTimer = 0.3; return false; }
    this.shootTimer = T.pistolCooldown;
    this.ammo -= 1;
    this.game.sound?.gunshot();
    const dx = Math.sin(aimHeading), dz = Math.cos(aimHeading);
    let best = null, bd = T.pistolRange;
    for (const t of targets) {
      if (t.dead || t.health <= 0) continue;
      const rx = t.x - this.x, rz = t.z - this.z;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > bd) continue;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp > 1.4) continue;
      best = t; bd = along;
    }
    if (best) best.damage(T.pistolDamage, this);
    this.game.tracer?.(this.x, this.z, aimHeading, bd);
    return true;
  }

  damage(amount, from) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtFlash = 0.25;
    this.game.sound?.hurt();
    if (from && from.isGoon) this.game.onCrime('attacked', 0);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  revive() {
    this.dead = false;
    this.health = this.maxHealth;
    this.mesh.visible = true;
    if (this.inCar) { this.inCar = null; }
  }
}
