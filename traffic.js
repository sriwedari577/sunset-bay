// Sunset Bay — the city's life: traffic cars that follow the road grid
// and turn at intersections, pedestrians wandering the sidewalks who run
// when a car bears down on them, and the parked cars waiting to be stolen.
import { Vehicle } from './vehicles.js';
import { makePerson } from './models.js';
import { TRAFFIC, CAR_PAINTS, SHIRTS, SKINS } from './tuning.js';
import { TOWN, resolveWorld } from './town.js';
import { clamp, turnToward } from './util.js';

function laneOffset(dir, axis) {
  // Right-hand traffic: offset to the right of the travel direction.
  return dir * 2.4;
}

export class Traffic {
  constructor(scene, town, rng) {
    this.scene = scene;
    this.town = town;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    this.peds = [];

    for (let i = 0; i < TRAFFIC.carCount; i++) {
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const line = rng.pick(town.roadLines);
      const dir = rng.sign();
      const along = rng.range(-220, 220);
      const car = new Vehicle(scene, {
        paint: rng.pick(CAR_PAINTS),
        x: axis === 'x' ? along : line + laneOffset(dir, axis),
        z: axis === 'x' ? line + laneOffset(dir, axis) : along,
        yaw: 0,
      });
      car.route = { axis, line, dir };
      car.cruise = TRAFFIC.carSpeed * rng.range(0.8, 1.15);
      car.speed = car.cruise;
      this.faceRoute(car);
      car.sync();
      this.cars.push(car);
    }

    for (const s of town.carSpawns) {
      const car = new Vehicle(scene, { paint: rng.pick(CAR_PAINTS), x: s.x, z: s.z, yaw: s.yaw, parked: true });
      this.parked.push(car);
    }

    for (let i = 0; i < TRAFFIC.pedCount; i++) {
      const rig = makePerson({
        shirt: rng.pick(SHIRTS), pants: 0x2e3438, skin: rng.pick(SKINS),
        hair: rng.pick([0x2e2018, 0x6a4a2a, 0xd8d0c0, 0x1a1a1a]),
      });
      scene.add(rig.group);
      const x = rng.range(-220, 220);
      const z = rng.range(-200, 220);
      const ped = {
        rig, x, z, yaw: rng.range(0, Math.PI * 2),
        tx: x, tz: z, speed: TRAFFIC.pedSpeed * rng.range(0.8, 1.3),
        wait: 0, flee: 0, downT: 0,
      };
      ped.rig.group.position.set(x, 0, z);
      this.peds.push(ped);
      this.newTarget(ped);
    }
  }

  faceRoute(car) {
    const { axis, dir } = car.route;
    car.yaw = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  }

  newTarget(ped) {
    // Aim for a point on a sidewalk ring: near a road, just off the asphalt.
    const line = this.rng.pick(this.town.roadLines);
    const along = this.rng.range(-220, 220);
    const off = (TOWN.roadWidth / 2 + 2.5) * this.rng.sign();
    if (this.rng.chance(0.5)) { ped.tx = along; ped.tz = line + off; }
    else { ped.tx = line + off; ped.tz = along; }
  }

  // A traffic car leaves AI control (stolen by the player or wrecked).
  release(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car);
    if (j >= 0) this.parked.splice(j, 1);
  }

  stealables() {
    return [...this.cars, ...this.parked];
  }

  update(dt, ctx) {
    // ctx: { playerX, playerZ, playerSpeed, playerInCar, paused }
    for (const car of this.cars) {
      const { axis, dir } = car.route;
      // Maybe turn at an intersection: when close to a crossing line, a
      // small chance per second to take the cross street.
      const cross = axis === 'x' ? car.z : car.x;
      let turned = false;
      for (const line of this.town.roadLines) {
        const along = axis === 'x' ? car.x : car.z;
        if (Math.abs(along - line) < 1.2 && this.rng.chance(dt * 0.25)) {
          car.route = { axis: axis === 'x' ? 'z' : 'x', line, dir: this.rng.sign() };
          // Snap onto the new street's lane.
          if (car.route.axis === 'x') car.z = line + laneOffset(car.route.dir, 'x');
          else car.x = line + laneOffset(car.route.dir, 'z');
          this.faceRoute(car);
          turned = true;
          break;
        }
      }
      void turned;
      // Slow for the car ahead and for the player's car.
      let want = car.cruise;
      const ahead = this.aheadBlocked(car, ctx);
      if (ahead) want = 0;
      car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      // Wrap around the far edge so traffic never runs out.
      const half = TOWN.half + 8;
      if (car.x > half) car.x = -half;
      if (car.x < -half) car.x = half;
      if (car.z > half) car.z = -half;
      if (car.z < -half) car.z = half;
      car.sync();
      car.rig.roll(car.speed * dt, 0);
    }

    for (const ped of this.peds) {
      // Knocked down by a car: lie still, then get back up.
      if (ped.downT > 0) {
        ped.downT -= dt;
        ped.rig.group.position.set(ped.x, 0.3, ped.z);
        ped.rig.group.rotation.set(-Math.PI / 2, ped.yaw, 0);
        if (ped.downT <= 0) ped.rig.group.rotation.x = 0;
        continue;
      }
      // Flee: a fast car close by sends the pedestrian running away.
      const dx = ped.x - ctx.playerX, dz = ped.z - ctx.playerZ;
      const dPlayer = Math.hypot(dx, dz);
      if (ctx.playerInCar && ctx.playerSpeed > 14 && dPlayer < 9) {
        ped.flee = 1.6;
        ped.tx = ped.x + (dx / (dPlayer || 1)) * 30;
        ped.tz = ped.z + (dz / (dPlayer || 1)) * 30;
      }
      ped.flee = Math.max(0, ped.flee - dt);
      const speed = ped.flee > 0 ? ped.speed * 3.2 : ped.speed;
      const tx = ped.tx - ped.x, tz = ped.tz - ped.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 1.5) {
        if (ped.wait <= 0) { ped.wait = this.rng.range(1, 5); this.newTarget(ped); }
        ped.wait -= dt;
      } else {
        const want = Math.atan2(tx, tz);
        ped.yaw = turnToward(ped.yaw, want, dt * 7);
        const nx = ped.x + Math.sin(ped.yaw) * speed * dt;
        const nz = ped.z + Math.cos(ped.yaw) * speed * dt;
        const fixed = resolveWorld(nx, nz, 0.5, this.town);
        ped.x = fixed.x; ped.z = fixed.z;
        ped.rig.stride(dt, speed);
      }
      ped.rig.group.position.set(ped.x, 0, ped.z);
      ped.rig.group.rotation.y = ped.yaw;
    }
  }

  aheadBlocked(car, ctx) {
    // Something slow or stopped in front of this car within ~9 units.
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 9 && side < 2.6) return true;
    }
    const pdx = ctx.playerX - car.x, pdz = ctx.playerZ - car.z;
    const pAlong = pdx * fx + pdz * fz;
    const pSide = Math.abs(pdx * fz - pdz * fx);
    if (ctx.playerInCar && pAlong > 0 && pAlong < 9 && pSide < 2.6) return true;
    return false;
  }
}
