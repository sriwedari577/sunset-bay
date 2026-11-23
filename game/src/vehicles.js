// Cars: one arcade physics model shared by the player's ride, parked cars
// and police cruisers. Forward is +Z rotated by `heading`.
import * as THREE from 'three';
import { T } from './tuning.js';
import { clamp, collideCircle } from './util.js';
import { makeCarMesh } from './models.js';

const PALETTE = [0xb03030, 0x3050b0, 0xc0a030, 0x409050, 0x8050a0, 0xd0d0d0, 0x303840, 0xe07020];

export class Car {
  constructor(scene, x, z, heading, color, police = false) {
    this.scene = scene;
    this.police = police;
    const built = makeCarMesh(police ? 0xe8e8e8 : color, police);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.bar = built.bar;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.color = color;
    this.dead = false;
    this.isCar = true;
    this.sirenPhase = 0;
  }

  get pos() { return this.mesh.position; }

  // throttle: -1..1, steerInput: -1..1. Returns true if a wall was hit.
  drive(throttle, steerInput, dt, colliders) {
    const maxF = this.police ? T.copCarSpeed : T.carMaxSpeed;
    if (throttle > 0) this.speed += T.carAccel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= T.carBrake * dt;
      else this.speed = Math.max(this.speed - T.carAccel * 0.55 * dt, -T.carMaxReverse);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    }
    this.speed = clamp(this.speed, -T.carMaxReverse, maxF);
    const spd = Math.abs(this.speed);
    // Arcade steering: some authority even at a crawl, so a cruiser (or
    // Mara) can turn around without a ten-point shuffle.
    const turnAuthority = clamp(0.3 + spd / 9, 0, 1) * (1 - clamp(spd / maxF, 0, 1) * 0.45);
    this.steer = steerInput * T.carTurnRate * turnAuthority;
    if (this.speed < -0.1) this.heading -= this.steer * dt;
    else this.heading += this.steer * dt;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const solved = collideCircle(nx, nz, T.carRadius, colliders);
    const hitWall = solved.hit && spd > 4;
    if (solved.hit) this.speed *= 0.45;
    this.x = solved.x; this.z = solved.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt / 0.42;
    for (const w of this.wheels) w.rotation.x += spin;
    if (this.bar) {
      this.sirenPhase += dt * 9;
      this.bar.visible = Math.sin(this.sirenPhase) > -0.2;
      this.bar.children[0].visible = Math.sin(this.sirenPhase) > 0;
      this.bar.children[1].visible = Math.sin(this.sirenPhase) <= 0;
    }
    return hitWall;
  }

  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading; this.speed = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
  }
}

export function carColor(rng) {
  return PALETTE[Math.floor(rng() * PALETTE.length) % PALETTE.length];
}

// Parked cars along road edges, away from the pier approach.
export function spawnParkedCars(scene, rng, colliders, count = 16) {
  const cars = [];
  const lines = [];
  for (let c = -180; c <= 180; c += 60) lines.push(c);
  let tries = 0;
  while (cars.length < count && tries++ < 300) {
    const horizontal = rng() < 0.5;
    const line = lines[Math.floor(rng() * lines.length) % lines.length];
    const along = -200 + rng() * 400;
    const side = rng() < 0.5 ? -1 : 1;
    const x = horizontal ? along : line + side * 7.5;
    const z = horizontal ? line + side * 7.5 : along;
    if (x > 145) continue;
    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue; // keep the crossroads clear
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const car = new Car(scene, x, z, heading, carColor(rng));
    cars.push(car);
  }
  return cars;
}
