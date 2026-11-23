// Sunset Bay — fists and the pistol. Enemies are simple brawlers: they
// close in and swing. Shots are hitscan from the camera with a fading
// tracer line so the player can see where the round went.
import * as THREE from 'three';
import { makePerson } from './models.js';
import { PLAYER, WEAPONS } from './tuning.js';
import { resolveWorld } from './town.js';
import { clamp, turnToward } from './util.js';

export class Enemy {
  constructor(scene, x, z, opts = {}) {
    this.rig = makePerson({
      shirt: opts.shirt ?? 0x8a2a3a, pants: 0x2e3438,
      skin: opts.skin ?? 0x8a5a3a, hair: 0x1a1a1a,
    });
    scene.add(this.rig.group);
    this.scene = scene;
    this.x = x; this.z = z; this.yaw = 0;
    this.health = opts.health ?? 60;
    this.speed = opts.speed ?? 4.6;
    this.damage = opts.damage ?? 9;
    this.cool = 0;
    this.dead = false;
    this.hitFlash = 0;
    this.rig.group.position.set(x, 0, z);
  }

  update(dt, player, town, onHitPlayer) {
    if (this.dead) return;
    this.cool = Math.max(0, this.cool - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const dx = player.x - this.x, dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1.6) {
      const want = Math.atan2(dx, dz);
      this.yaw = turnToward(this.yaw, want, dt * 8);
      const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
      const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
      const fixed = resolveWorld(nx, nz, 0.5, town);
      this.x = fixed.x; this.z = fixed.z;
      this.rig.stride(dt, this.speed);
    } else if (this.cool <= 0) {
      this.cool = 0.9;
      this.rig.punch(0.5);
      onHitPlayer(this.damage);
    }
    const s = this.hitFlash > 0 ? 1.15 : 1;
    this.rig.group.scale.set(s, s, s);
    this.rig.group.position.set(this.x, 0, this.z);
    this.rig.group.rotation.y = this.yaw;
  }

  hurt(amount, fromX, fromZ) {
    if (this.dead) return false;
    this.health -= amount;
    this.hitFlash = 0.14;
    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.x += (dx / d) * 0.7;
    this.z += (dz / d) * 0.7;
    if (this.health <= 0) {
      this.dead = true;
      // Fall flat: a quick, readable death without any gore.
      this.rig.group.rotation.x = -Math.PI / 2;
      this.rig.group.position.y = 0.3;
      return true;
    }
    return false;
  }

  remove() {
    this.scene.remove(this.rig.group);
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  }

  // Fists: a short cone in front of the player.
  punch(player, enemies, sounds) {
    if (player.punchT < 1) return null;
    player.punchT = 0;
    player.punchHitDone = false;
    sounds.punch();
    const dir = player.lookDir();
    let hitAny = null;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < PLAYER.punchRange + 0.6) {
        const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
        if (dot > 0.25) {
          const killed = e.hurt(PLAYER.punchDamage, player.x, player.z);
          hitAny = { enemy: e, killed };
        }
      }
    }
    return hitAny;
  }

  // Hitscan from the camera through the crosshair.
  shoot(player, enemies, camera, sounds) {
    if (player.weapon !== 'pistol' || player.reloadT > 0) return null;
    if (player.ammo <= 0) {
      player.reloadT = WEAPONS.reloadTime;
      sounds.reload();
      return 'reload';
    }
    player.ammo -= 1;
    sounds.shot();
    if (player.ammo <= 0) {
      player.reloadT = WEAPONS.reloadTime;
      sounds.reload();
    }
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let best = null, bestT = WEAPONS.pistolRange;
    for (const e of enemies) {
      if (e.dead) continue;
      const to = new THREE.Vector3(e.x - origin.x, 1.1 - origin.y, e.z - origin.z);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const d = Math.hypot(closest.x - e.x, closest.y - 1.1, closest.z - e.z);
      if (d < 1.05) { best = e; bestT = t; }
    }
    const end = origin.clone().addScaledVector(dir, best ? bestT : WEAPONS.pistolRange);
    this.addTracer(origin, end);
    if (best) {
      const killed = best.hurt(WEAPONS.pistolDamage, player.x, player.z);
      return { enemy: best, killed };
    }
    return 'miss';
  }

  addTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = clamp(t.life / 0.09, 0, 1) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
