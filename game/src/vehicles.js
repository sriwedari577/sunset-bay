// Sunset Bay — one drivable vehicle: arcade physics, steering that bites
// harder with speed, a handbrake that breaks the rear loose, and simple
// collision against the town. Traffic, police and the player all drive
// through this same class.
import { makeCar } from './models.js';
import { CAR } from './tuning.js';
import { resolveWorld } from './town.js';
import { clamp, TAU } from './util.js';

export class Vehicle {
  constructor(scene, opts = {}) {
    this.rig = makeCar({ paint: opts.paint ?? 0xd84a3a, police: !!opts.police });
    this.group = this.rig.group;
    scene.add(this.group);
    this.paint = opts.paint ?? 0xd84a3a;
    this.police = !!opts.police;
    this.x = opts.x ?? 0;
    this.z = opts.z ?? 0;
    this.yaw = opts.yaw ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.parked = opts.parked ?? false;
    this.stolen = false;
    this.dead = false;
    this.crashed = false;
    this.sync();
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.speed = 0;
    this.sync();
  }

  // throttle: -1 (full reverse/brake) .. 1 (full throttle). steer: -1..1.
  // Returns true when the body hit something solid this step.
  drive(dt, throttle, steer, handbrake, town) {
    this.crashed = false;
    const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
    if (throttle > 0) {
      this.speed += CAR.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += CAR.brake * throttle * dt;
      else this.speed += CAR.accel * throttle * dt * 0.7;
    }
    // Rolling drag toward a stop.
    const drag = Math.exp(-grip * 0.28 * dt);
    if (throttle === 0) this.speed *= Math.pow(0.5, dt * 0.9);
    else this.speed *= drag > 0.995 ? 1 : 1;
    this.speed = clamp(this.speed, -CAR.reverseSpeed, CAR.maxSpeed);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;

    const spd = Math.abs(this.speed);
    const steerAuthority = clamp(spd / 9, 0, 1) * (handbrake ? 1.5 : 1);
    this.yaw += steer * CAR.turnRate * steerAuthority * dt * (this.speed >= 0 ? 1 : -1);
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const nx = this.x + fx * this.speed * dt;
    const nz = this.z + fz * this.speed * dt;
    const fixed = resolveWorld(nx, nz, CAR.radius, town);
    if (Math.abs(fixed.x - nx) > 0.001 || Math.abs(fixed.z - nz) > 0.001) {
      if (spd > 6) this.crashed = true;
      this.speed *= 0.35;
    }
    const moved = Math.hypot(fixed.x - this.x, fixed.z - this.z);
    this.x = fixed.x; this.z = fixed.z;
    this.sync();
    this.rig.roll(this.speed * dt, this.steer);
    return moved;
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.yaw;
  }

  get mph() { return Math.abs(this.speed) * 3.1; }
}

// Keep a list of vehicles from overlapping: push circles apart and trade a
// little speed, which reads as a fender-bender rather than a ghost pass.
export function separateVehicles(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = 3.4;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.7; b.speed = avg * 0.7;
        a.sync(); b.sync();
      }
    }
  }
}
