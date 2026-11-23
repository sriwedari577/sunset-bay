// Sunset Bay — the player: a third-person walker who can jump, punch,
// steal any car, and drive it. The camera is an orbit rig that follows the
// head on foot and pulls back behind the car when driving.
import * as THREE from 'three';
import { makePerson } from './models.js';
import { PLAYER, CAR, WEAPONS, KEYS } from './tuning.js';
import { resolveWorld } from './town.js';
import { clamp, damp, turnToward, TAU } from './util.js';

function groundHeight(x, z, town) {
  // The pier deck sits above the water.
  if (x > 55 && x < 65 && z > town.pierWalk.minZ && z < -226) return 0.65;
  return 0;
}

export class Player {
  constructor(scene, town, input, sounds, camera) {
    this.scene = scene;
    this.town = town;
    this.input = input;
    this.sounds = sounds;
    this.camera = camera;
    this.rig = makePerson({ shirt: 0xe8a83a, pants: 0x2e3438, skin: 0xc9a06a, hat: 0x2e2a3a });
    scene.add(this.rig.group);
    this.x = -160; this.z = 106; this.y = 0; this.vy = 0;
    this.yaw = 0;
    this.velX = 0; this.velZ = 0;
    this.onGround = true;
    this.health = PLAYER.health;
    this.weapon = 'fists';
    this.ammo = WEAPONS.pistolMag;
    this.reloadT = 0;
    this.reloading = false;
    this.punchT = 1;
    this.punchHitDone = true;
    this.inCar = false;
    this.car = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 7.5;
    this.speedShown = 0;
    this.enterCooldown = 0;
    this.hurtT = 0;
    this.dead = false;
  }

  spawn(x, z, yaw) {
    // Respawning always puts Rook on foot: a teleport while driving must
    // not leave the player glued to a car parked somewhere else.
    if (this.car) { this.car.occupied = false; this.car = null; }
    this.inCar = false;
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = groundHeight(x, z, this.town);
    this.vy = 0; this.velX = 0; this.velZ = 0;
    this.camYaw = yaw + Math.PI;
    this.syncMesh();
  }

  get pos() { return { x: this.x, z: this.z }; }

  syncMesh() {
    this.rig.group.position.set(this.x, this.y, this.z);
    this.rig.group.rotation.y = this.yaw;
    this.rig.group.visible = !this.inCar;
  }

  nearestVehicle(vehicles) {
    let best = null, bestD = CAR.enterRange;
    for (const v of vehicles) {
      if (v.dead) continue;
      const d = Math.hypot(v.x - this.x, v.z - this.z);
      if (d < bestD) { best = v; bestD = d; }
    }
    return best;
  }

  enterCar(v) {
    this.inCar = true;
    this.car = v;
    v.parked = false;
    v.stolen = true;
    // Sit in the car at once: position, heading and mesh follow the car
    // from this frame on, so staging and the steal check read true values.
    this.x = v.x; this.z = v.z; this.yaw = v.yaw;
    this.rig.group.visible = false;
    this.camDist = 10.5;
    this.sounds.click();
  }

  exitCar() {
    if (!this.car) return;
    const v = this.car;
    const px = v.x + Math.sin(this.yaw + Math.PI / 2) * 2.4;
    const pz = v.z + Math.cos(this.yaw + Math.PI / 2) * 2.4;
    const fixed = resolveWorld(px, pz, PLAYER.radius, this.town);
    this.x = fixed.x; this.z = fixed.z;
    this.y = groundHeight(this.x, this.z, this.town);
    this.yaw = v.yaw;
    this.inCar = false;
    this.car = null;
    this.velX = 0; this.velZ = 0;
    this.rig.group.visible = true;
    this.camDist = 7.5;
    this.enterCooldown = 0.5;
  }

  damage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this.hurtT = 0.5;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, PLAYER.health);
  }

  update(dt, ctx) {
    // ctx: { vehicles, allowInput, paused }
    this.enterCooldown = Math.max(0, this.enterCooldown - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.punchT = Math.min(1, this.punchT + dt / PLAYER.punchCooldown);
    const mouse = this.input.takeMouse();
    this.camYaw -= mouse.dx * 0.0026;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0022, -0.1, 0.95);

    if (this.inCar && this.car) {
      const ax = this.input.axes();
      const throttle = ctx.allowInput ? ax.z : 0;
      const steer = ctx.allowInput ? -ax.x : 0;
      const brake = ctx.allowInput && this.input.is(KEYS.jump);
      this.car.drive(dt, throttle, steer, brake, this.town);
      this.x = this.car.x; this.z = this.car.z;
      this.yaw = this.car.yaw;
      this.speedShown = this.car.mph;
      // Camera swings behind the car as it picks up speed.
      const behind = this.car.yaw + Math.PI;
      const blend = clamp(Math.abs(this.car.speed) / 12, 0, 1) * 0.9;
      let dy = behind - this.camYaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.camYaw += dy * Math.min(1, dt * (1.2 + blend * 2.4));
      if (ctx.allowInput && this.input.hit(KEYS.enter) && this.enterCooldown <= 0) {
        this.exitCar();
      }
      // The exit above may have left the car: only hum while still driving.
      if (this.car) this.sounds.engine(true, clamp(Math.abs(this.car.speed) / CAR.maxSpeed, 0, 1));
      else this.sounds.engine(false, 0);
    } else {
      this.sounds.engine(false, 0);
      const ax = ctx.allowInput ? this.input.axes() : { x: 0, z: 0 };
      const run = this.input.is(KEYS.run) || this.input.is(KEYS.runAlt);
      const top = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      // Movement is relative to where the camera looks.
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const wishX = ax.z * sin - ax.x * cos;
      const wishZ = ax.z * cos + ax.x * sin;
      const moving = Math.hypot(wishX, wishZ) > 0.01;
      const tx = moving ? (wishX / Math.hypot(wishX, wishZ)) * top : 0;
      const tz = moving ? (wishZ / Math.hypot(wishX, wishZ)) * top : 0;
      this.velX += (tx - this.velX) * Math.min(1, dt * 10);
      this.velZ += (tz - this.velZ) * Math.min(1, dt * 10);
      const nx = this.x + this.velX * dt;
      const nz = this.z + this.velZ * dt;
      const fixed = resolveWorld(nx, nz, PLAYER.radius, this.town);
      this.x = fixed.x; this.z = fixed.z;
      const speed = Math.hypot(this.velX, this.velZ);
      if (speed > 0.4) {
        this.yaw = turnToward(this.yaw, Math.atan2(this.velX, this.velZ), dt * 12);
      }
      // Jump and gravity over the pier deck / ground.
      const g = groundHeight(this.x, this.z, this.town);
      if (this.onGround && ctx.allowInput && this.input.hit(KEYS.jump)) {
        this.vy = PLAYER.jumpSpeed;
        this.onGround = false;
      }
      if (!this.onGround) {
        this.vy -= PLAYER.gravity * dt;
        this.y += this.vy * dt;
        if (this.y <= g) { this.y = g; this.vy = 0; this.onGround = true; }
      } else {
        this.y = damp(this.y, g, 12, dt);
      }
      this.speedShown = speed * 2.2;
      this.rig.stride(dt, speed);
      // Punch animation while the cooldown runs.
      if (this.punchT < 1) this.rig.punch(this.punchT);
      else if (this.weapon === 'pistol') this.rig.aimPistol();
      else this.rig.relaxArms();
      // Enter the nearest car.
      if (ctx.allowInput && this.input.hit(KEYS.enter) && this.enterCooldown <= 0) {
        const v = this.nearestVehicle(ctx.vehicles);
        if (v) this.enterCar(v);
      }
    }

    this.updateCamera(dt);
    this.syncMesh();
  }

  updateCamera(dt) {
    const aiming = this.weapon === 'pistol' && !this.inCar;
    const target = this.inCar && this.car
      ? { x: this.car.x, y: 1.4, z: this.car.z }
      : { x: this.x, y: this.y + 1.55, z: this.z };
    const dist = this.camDist;
    // With the pistol out the camera levels off: the crosshair ray then
    // flies at chest height instead of dropping into the ground ahead.
    this.pitchEff = damp(this.pitchEff ?? this.camPitch, aiming ? 0.05 : this.camPitch, 8, dt);
    const cy = Math.sin(this.pitchEff) * dist;
    const ch = Math.cos(this.pitchEff) * dist;
    const cx = target.x - Math.sin(this.camYaw) * ch;
    const cz = target.z - Math.cos(this.camYaw) * ch;
    this.camera.position.set(cx, target.y + cy, cz);
    if (aiming) {
      this.camera.lookAt(
        target.x + Math.sin(this.camYaw) * 20,
        this.y + 1.55,
        target.z + Math.cos(this.camYaw) * 20);
    } else {
      this.camera.lookAt(target.x, target.y, target.z);
    }
  }

  lookDir() {
    // Where the player (or the pistol) points, on the ground plane.
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}
