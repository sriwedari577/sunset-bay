// Ambient life: traffic cars looping the road grid, and pedestrians
// strolling the sidewalks. Both are seeded, so staged scenes are stable.
import * as THREE from 'three';
import { T } from './tuning.js';
import { mulberry32, dist2d } from './util.js';
import { Car, carColor } from './vehicles.js';
import { makePersonMesh } from './models.js';

const SHIRTS = [0x4a6a9a, 0x9a4a4a, 0x4a9a5a, 0xc0a040, 0x7a5a9a, 0xd0d0c8, 0x305050];
const PANTS = [0x2a2a3a, 0x3a3a2a, 0x4a4a55, 0x222222];

export class Traffic {
  constructor(scene, game, seed = 777) {
    this.scene = scene;
    this.game = game;
    this.rng = mulberry32(seed);
    this.cars = [];
    this.peds = [];
    this.lines = [];
    for (let c = -180; c <= 180; c += 60) this.lines.push(c);
    for (let i = 0; i < T.trafficCount; i++) this.spawnCar(true);
    for (let i = 0; i < T.pedCount; i++) this.spawnPed(true);
  }

  randomRoadPoint() {
    const horizontal = this.rng() < 0.5;
    const line = this.lines[Math.floor(this.rng() * this.lines.length) % this.lines.length];
    const along = -215 + this.rng() * 430;
    return horizontal
      ? { x: along, z: line, heading: this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, horizontal }
      : { x: line, z: along, heading: this.rng() < 0.5 ? 0 : Math.PI, horizontal };
  }

  spawnCar(initial = false) {
    const p = this.randomRoadPoint();
    if (p.x > 145) return;
    const car = new Car(this.scene, p.x, p.z, p.heading, carColor(this.rng));
    car.horizontal = p.horizontal;
    car.cruise = T.trafficSpeed * (0.8 + this.rng() * 0.4);
    this.cars.push(car);
    return car;
  }

  spawnPed(initial = false) {
    const p = this.randomRoadPoint();
    const side = this.rng() < 0.5 ? -1 : 1;
    const x = p.horizontal ? p.x : p.x + side * 7.5;
    const z = p.horizontal ? p.z + side * 7.5 : p.z;
    if (x > 150) return;
    const shirt = SHIRTS[Math.floor(this.rng() * SHIRTS.length) % SHIRTS.length];
    const pants = PANTS[Math.floor(this.rng() * PANTS.length) % PANTS.length];
    const built = makePersonMesh(shirt, pants);
    built.group.position.set(x, 0, z);
    this.scene.add(built.group);
    const ped = {
      body: built, mesh: built.group, x, z,
      heading: p.heading + (this.rng() < 0.5 ? 0 : Math.PI),
      horizontal: p.horizontal,
      speed: T.pedSpeed * (0.7 + this.rng() * 0.6),
      phase: this.rng() * 6.28,
      dead: false, health: 30, isPed: true,
      damage: (amount) => { ped.health -= amount; if (ped.health <= 0) ped.die(); },
      die: () => {
        if (ped.dead) return;
        ped.dead = true;
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.35;
        this.game.onCrime('pedDown', 1);
      },
    };
    this.peds.push(ped);
    return ped;
  }

  // Place traffic + pedestrians near a point for a staged scene.
  stageNear(x, z, carCount, pedCount) {
    const placedCars = [];
    const spots = [
      [x - 18, z + 8, 0], [x + 16, z - 10, Math.PI], [x + 4, z + 20, Math.PI / 2],
      [x - 24, z - 16, Math.PI / 2], [x + 26, z + 14, -Math.PI / 2],
    ];
    for (let i = 0; i < Math.min(carCount, spots.length); i++) {
      const [sx, sz, h] = spots[i];
      const car = new Car(this.scene, sx, sz, h, carColor(this.rng));
      car.parked = true;
      this.cars.push(car);
      placedCars.push(car);
    }
    const pedSpots = [
      [x - 8, z + 6], [x + 10, z + 4], [x - 4, z - 12], [x + 14, z - 6], [x - 14, z - 2],
    ];
    for (let i = 0; i < Math.min(pedCount, pedSpots.length); i++) {
      const [px, pz] = pedSpots[i];
      const shirt = SHIRTS[i % SHIRTS.length];
      const built = makePersonMesh(shirt, PANTS[i % PANTS.length]);
      built.group.position.set(px, 0, pz);
      built.group.rotation.y = this.rng() * 6.28;
      this.scene.add(built.group);
      this.peds.push({
        body: built, mesh: built.group, x: px, z: pz, heading: 0,
        horizontal: false, speed: 0, phase: 0, dead: false, health: 30,
        isPed: true, staged: true,
        damage: function (a) { this.health -= a; if (this.health <= 0 && !this.dead) { this.dead = true; this.mesh.rotation.x = -Math.PI / 2; } },
      });
    }
    return placedCars;
  }

  update(dt) {
    const player = this.game.player;
    for (const car of this.cars) {
      if (car.parked) continue;
      // Cruise at a steady speed; the grid keeps them on roads.
      const target = car.cruise;
      car.speed += Math.sign(target - car.speed) * 14 * dt;
      car.drive(car.speed < target ? 0.6 : 0, 0, dt, this.game.town.colliders);
      // Wrap around the far edge so the loop never empties.
      if (car.horizontal) {
        if (car.x > 148) { car.x = -228; }
        if (car.x < -232) { car.x = 144; }
      } else {
        if (car.z > 232) { car.z = -232; }
        if (car.z < -232) { car.z = 232; }
      }
      car.mesh.position.set(car.x, 0, car.z);
    }
    // A speeding player car that clips a pedestrian knocks them down.
    if (player && player.inCar && Math.abs(player.inCar.speed) > 6) {
      for (const ped of this.peds) {
        if (ped.dead) continue;
        if (dist2d(player.inCar.x, player.inCar.z, ped.x, ped.z) < 3.4) ped.die();
      }
    }
    for (const ped of this.peds) {
      if (ped.dead || ped.staged) continue;
      ped.phase += dt * 5;
      const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
      if (Math.abs(nx) > 232 || Math.abs(nz) > 232 || nx > 148) {
        ped.heading += Math.PI;
      } else {
        ped.x = nx; ped.z = nz;
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      ped.body.setWalk(ped.phase, true);
    }
  }

  clearStaged() {
    for (const car of this.cars) if (car.parked) car.dispose();
    this.cars = this.cars.filter((c) => !c.parked);
    for (const ped of this.peds) if (ped.staged) this.scene.remove(ped.mesh);
    this.peds = this.peds.filter((p) => !p.staged);
  }
}
