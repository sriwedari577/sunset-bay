// Mara's work: four story missions, six fixed cash stashes, beacons and
// dialogs. The manager never mutates a list another system is iterating:
// goon checks use snapshots, and every update returns early the moment
// Mara is down, so a goon killing her mid-loop ends the mission cleanly.
import * as THREE from 'three';
import { T } from './tuning.js';
import { dist2d } from './util.js';
import { makeBeaconMesh, makeStashMesh } from './models.js';

const STASH_SPOTS = [
  { x: 228, z: 0, label: 'Pier stash' },
  { x: -150, z: -120, label: 'Suburb stash' },
  { x: 60, z: 120, label: 'Midtown stash' },
  { x: -60, z: 180, label: 'South stash' },
  { x: 120, z: -180, label: 'North stash' },
  { x: -180, z: 30, label: 'West stash' },
];

const DIALOGS = {
  m1: [
    ['MARA', 'Kroll took my cut. His runner left a bag on the pier — I want it back.'],
    ['LENNY', 'Pier’s quiet this time of day. Grab it fast, and don’t let the gulls see you smile.'],
  ],
  m2: [
    ['MARA', 'A buyer wants a clean coupe, no questions. There’s one parked downtown with the keys in it.'],
    ['LENNY', 'Bring it to the lockup on the south road. Try not to bring the whole precinct with you.'],
  ],
  m3: [
    ['MARA', 'Package for the beach house. Seventy-five seconds, or the tide takes the deal.'],
    ['LENNY', 'Drive like the rent is due, Mara. Because it is.'],
  ],
  m4: [
    ['MARA', 'Kroll’s crew holds the crossroads. Tonight the Bay remembers whose name is on it.'],
    ['LENNY', 'Five of them, Mara. Make it loud.'],
  ],
};

export class Missions {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.completed = new Set();
    this.active = null;
    this.stepIndex = 0;
    this.beacon = null;
    this.beaconTarget = null; // {x, z} or a Car to follow
    this.timer = 0;
    this.targetCar = null;
    this.stashes = [];
    this.goonsToBeat = 0;
    this.goonsBeaten = 0;
    this.buildStashes();
    this.loadProgress();
  }

  buildStashes() {
    STASH_SPOTS.forEach((s, i) => {
      const mesh = makeStashMesh();
      mesh.position.set(s.x, 0, s.z);
      this.scene.add(mesh);
      this.stashes.push({ ...s, mesh, taken: false, value: T.stashValues[i] });
    });
  }

  loadProgress() {
    try {
      const raw = localStorage.getItem('sunsetbay-missions');
      if (raw) {
        const done = JSON.parse(raw);
        if (Array.isArray(done)) for (const id of done) this.completed.add(id);
      }
    } catch { /* private mode: progress just doesn't persist */ }
  }

  persist() {
    try {
      localStorage.setItem('sunsetbay-missions', JSON.stringify([...this.completed]));
    } catch { /* ignore */ }
  }

  definitions() {
    return [
      { id: 'm1', name: 'Errand for Mara', reward: T.missionReward[0], desc: 'Collect the stash Kroll’s runner left on the pier.' },
      { id: 'm2', name: 'Hot Wheels', reward: T.missionReward[1], desc: 'Steal the marked coupe downtown and deliver it to the lockup.' },
      { id: 'm3', name: 'The Drop', reward: T.missionReward[2], desc: 'Pick up the package and reach the beach house in 75 seconds.' },
      { id: 'm4', name: 'King of the Bay', reward: T.missionReward[3], desc: 'Clear Kroll’s crew from the crossroads.' },
    ];
  }

  start(id) {
    if (this.active) this.fail('Mission replaced.');
    // Stale dialogs from the previous job must not linger and swallow
    // the interact key while the new job's briefing plays.
    this.game.hud.clearDialogs();
    const p = this.game.player;
    this.active = id;
    this.stepIndex = 0;
    this.timer = 0;
    this.goonsBeaten = 0;
    const dlg = DIALOGS[id] || [];
    for (const [who, text] of dlg) this.game.hud.showDialog(who, text);
    if (id === 'm1') {
      this.setBeacon(this.game.town.places.pierStash);
      this.game.hud.setObjective('Collect the pier stash');
    } else if (id === 'm2') {
      const cars = this.game.parkedCars.filter((c) => !c.dead && Math.abs(c.x) < 100 && Math.abs(c.z) < 100);
      this.targetCar = cars[0] || this.game.parkedCars[0] || null;
      if (this.targetCar) {
        // The beacon follows the car itself, not a fixed point.
        this.setBeacon(this.targetCar);
        this.game.hud.setObjective('Steal the marked coupe');
      } else {
        this.fail('No car to steal.');
      }
    } else if (id === 'm3') {
      this.setBeacon(this.game.town.places.maraBar);
      this.game.hud.setObjective('Pick up the package at the bar');
    } else if (id === 'm4') {
      this.goonsToBeat = 5;
      this.game.horde.spawn(6, 6, 5);
      this.setBeacon(this.game.town.places.crossroads);
      this.game.hud.setObjective('Clear the crossroads: 0 / 5 crew down');
    }
    this.game.sound?.missionStart();
  }

  setBeacon(at) {
    this.clearBeacon();
    this.beacon = makeBeaconMesh();
    this.beacon.position.set(at.x, 0, at.z);
    this.scene.add(this.beacon);
    this.beaconTarget = at;
  }

  clearBeacon() {
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
    this.beaconTarget = null;
  }

  fail(reason) {
    if (!this.active) return;
    this.active = null;
    this.clearBeacon();
    this.game.hud.setObjective('');
    if (reason) this.game.hud.message(reason, 'bad');
  }

  complete() {
    const def = this.definitions().find((d) => d.id === this.active);
    if (!def) return;
    this.completed.add(def.id);
    this.persist();
    this.game.player.cash += def.reward;
    this.game.hud.message(`Mission complete: ${def.name} (+$${def.reward})`, 'good');
    this.game.sound?.missionDone();
    this.active = null;
    this.stepIndex = 0;
    this.clearBeacon();
    this.game.hud.setObjective('');
    this.game.save?.();
  }

  near(x, z, r) {
    const p = this.game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    return dist2d(px, pz, x, z) < r;
  }

  // Called by the main loop. Snapshot discipline: goon state is read
  // through horde.alive() (a fresh array), and the very first thing this
  // does after Mara dies is stop — nothing below runs on a dead player.
  update(dt) {
    if (this.beacon && this.beaconTarget) {
      if (this.beaconTarget.isCar) {
        this.beacon.position.set(this.beaconTarget.x, 0, this.beaconTarget.z);
      }
      this.beacon.rotation.y += dt * 0.8;
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      this.beacon.scale.set(s, 1, s);
    }
    const p = this.game.player;
    if (!this.active || !p || p.dead) return;

    if (this.active === 'm1') {
      const stash = this.stashes[0];
      if (!stash.taken && this.near(stash.x, stash.z, 3.2)) this.collectStash(stash, true);
    } else if (this.active === 'm2') {
      if (this.stepIndex === 0 && this.targetCar && p.inCar === this.targetCar) {
        this.stepIndex = 1;
        this.setBeacon({ x: -30, z: 186 });
        this.game.hud.setObjective('Deliver the coupe to the lockup');
      } else if (this.stepIndex === 1 && !p.inCar && this.near(-30, 186, 8)) {
        this.complete();
      }
    } else if (this.active === 'm3') {
      if (this.stepIndex === 0 && this.near(this.game.town.places.maraBar.x, this.game.town.places.maraBar.z, 5)) {
        this.stepIndex = 1;
        this.timer = 75;
        this.setBeacon(this.game.town.places.beachRoad);
        this.game.hud.setObjective('Reach the beach house — 75s');
      } else if (this.stepIndex === 1) {
        this.timer -= dt;
        this.game.hud.setObjective(`Reach the beach house — ${Math.max(0, Math.ceil(this.timer))}s`);
        if (this.near(this.game.town.places.beachRoad.x, this.game.town.places.beachRoad.z, 9)) {
          this.complete();
        } else if (this.timer <= 0) {
          this.fail('Too slow — the deal fell through.');
        }
      }
    } else if (this.active === 'm4') {
      // Count from a snapshot so a goon dying in this same frame (or
      // Mara dying to the last goon) cannot disturb the iteration.
      const aliveNow = this.game.horde.alive().length;
      const beaten = this.goonsToBeat - aliveNow;
      if (beaten !== this.goonsBeaten) {
        this.goonsBeaten = beaten;
        this.game.hud.setObjective(`Clear the crossroads: ${beaten} / ${this.goonsToBeat} crew down`);
      }
      if (aliveNow <= 0 && this.goonsToBeat > 0) this.complete();
    }

    // Free-roam stash pickups (any stash, any time).
    for (const stash of [...this.stashes]) {
      if (!stash.taken && this.near(stash.x, stash.z, 3.0)) {
        this.collectStash(stash, false);
      }
    }
  }

  collectStash(stash, fromMission) {
    if (stash.taken) return;
    stash.taken = true;
    this.scene.remove(stash.mesh);
    this.game.player.cash += stash.value;
    this.game.hud.message(`${stash.label}: +$${stash.value}`, 'good');
    this.game.sound?.pickup();
    if (fromMission && this.active === 'm1') this.complete();
  }

  onPlayerDeath() {
    // Mara went down mid-mission: end it quietly. No list is touched.
    if (this.active) {
      this.active = null;
      this.clearBeacon();
      this.game.hud.setObjective('');
    }
  }

  onGoonDown() {
    // The count is recomputed from the snapshot in update(); nothing to do.
  }
}
