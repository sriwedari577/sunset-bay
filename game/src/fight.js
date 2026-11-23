// Kroll's crew: brawlers who chase Mara and swing when close. A goon never
// touches mission state directly — the mission manager owns the list and
// always iterates a snapshot, so a goon killing Mara mid-loop cannot
// corrupt anything (see jobs.js).
import * as THREE from 'three';
import { T } from './tuning.js';
import { dist2d, angleTo, collideCircle } from './util.js';
import { makePersonMesh } from './models.js';

export class Goon {
  constructor(scene, game, x, z) {
    this.scene = scene;
    this.game = game;
    this.isGoon = true;
    const built = makePersonMesh(0x222226, 0x3a3a40, 0xb08a6a);
    this.body = built;
    this.mesh = built.group;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = T.goonHealth;
    this.maxHealth = T.goonHealth;
    this.dead = false;
    this.attackTimer = 0;
    this.phase = Math.random() * 6.28;
    this.deathTimer = 0;
  }

  damage(amount, from) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deathTimer = 0;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.35;
      this.game.sound?.thud();
      this.game.onGoonDown?.(this);
    }
  }

  update(dt) {
    if (this.dead) {
      this.deathTimer += dt;
      return;
    }
    const p = this.game.player;
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    // If Mara is down, goons stand down — no updates touch her state.
    if (!p || p.dead) {
      this.body.setWalk(this.phase, false);
      return;
    }
    const d = dist2d(this.x, this.z, p.x, p.z);
    if (d > 1.9) {
      const want = angleTo(this.x, this.z, p.x, p.z);
      this.heading = want;
      const nx = this.x + Math.sin(want) * T.goonSpeed * dt;
      const nz = this.z + Math.cos(want) * T.goonSpeed * dt;
      const solved = collideCircle(nx, nz, 0.8, this.game.town.colliders);
      this.x = solved.x; this.z = solved.z;
      this.phase += dt * 8;
      this.body.setWalk(this.phase, true);
    } else {
      this.body.setWalk(this.phase, false);
      if (this.attackTimer <= 0) {
        this.attackTimer = 0.85;
        this.game.sound?.punch();
        p.damage(T.goonDamage, this);
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

export class GoonHorde {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
  }

  spawn(x, z, count = 1) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const g = new Goon(this.scene, this.game, x + (i % 3) * 3 - 3, z + Math.floor(i / 3) * 3);
      this.list.push(g);
      made.push(g);
    }
    return made;
  }

  // Snapshot iteration: callers may remove goons during callbacks.
  update(dt) {
    for (const g of [...this.list]) g.update(dt);
    // Sweep corpses that have lain long enough; removal never happens
    // while another system is iterating the live list.
    for (const g of [...this.list]) {
      if (g.dead && g.deathTimer > 6) {
        g.dispose();
        this.list.splice(this.list.indexOf(g), 1);
      }
    }
  }

  alive() {
    return this.list.filter((g) => !g.dead);
  }

  clear() {
    for (const g of this.list) g.dispose();
    this.list = [];
  }

  damageables() {
    return [...this.list, ...this.game.traffic.peds.filter((p) => !p.dead)];
  }
}
