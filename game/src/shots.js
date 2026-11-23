// Deterministic staging for the four screenshots (?shot=1..4). Each scene
// resets the world to a known state first — heat cleared, goons cleared,
// staged traffic cleared, Mara revived — then places exactly what the
// frame needs. A screenshot agent captures the frame; no input is needed.
import { Car } from './vehicles.js';
import { makeBeaconMesh } from './models.js';

function resetWorld(game) {
  const p = game.player;
  p.revive();
  p.heal(1000);
  p.ammo = 24;
  if (p.inCar) p.exitCar();
  game.cops.clearHeat();
  game.horde.clear();
  game.traffic.clearStaged();
  if (game.missions.active) game.missions.fail(null);
  game.missions.clearBeacon();
  game.hud.setObjective('');
  game.hud.showJobs(false);
  game.hud.showTitle(false);
  game.hud.showBusted(false);
  game.hud.showWasted(false);
}

function restoreStash(game, i) {
  const s = game.missions.stashes[i];
  if (s && s.taken) {
    s.taken = false;
    game.scene.add(s.mesh);
  }
}

export function applyShot(game, n) {
  resetWorld(game);
  const p = game.player;
  const town = game.town;

  if (n === 1) {
    // Chase cover: wanted stars, police cruisers with light bars, the
    // round minimap, an objective pill and Mara's dialog in one frame.
    // Everything sits ON road x = 0 — mid-block coordinates would bury
    // the cars inside buildings.
    const car = game.parkedCars.find((c) => !c.dead) || null;
    p.place(0, 20, 0);
    if (car) {
      car.place(0, 20, 0);
      // Silent boarding for staging: no crime hook, no door sound.
      p.inCar = car;
      p.mesh.visible = false;
      car.speed = 16;
    }
    game.cops.heat = 3;
    // Cruisers stage just behind Mara's car (smaller z), closing in —
    // the previous staging put them ahead of her, which read as Mara
    // chasing the police. Staging only — no gameplay state changes.
    const cop1 = new Car(game.scene, 3.5, 13, 0.2, 0xe8e8e8, true);
    const cop2 = new Car(game.scene, -3.5, 15, -0.2, 0xe8e8e8, true);
    game.cops.cars.push(cop1, cop2);
    game.hud.setObjective('Lose the police — break line of sight');
    game.hud.showDialog('MARA', 'They’re right behind us. Hold on, Lenny — this is going to get loud.');
    // Closer, lower chase camera: the previous [0, 8.5, 2] framing left the
    // cars small and distant with a blank building wall filling the left
    // half of the frame. Staging only — no gameplay state changes.
    game.setShotCamera([0, 6, 6], [0, 1.5, 26]);
    game.shotLabel = 'chase';
  } else if (n === 2) {
    // Pier / beach: Mara on the boardwalk, the sea unmistakable behind her.
    restoreStash(game, 0);
    p.place(222, 0, Math.PI / 2);
    p.heading = Math.PI / 2;
    p.mesh.rotation.y = Math.PI / 2;
    game.hud.setObjective('Collect the pier stash');
    game.missions.setBeacon({ x: 228, z: 0 });
    game.setShotCamera([206, 5.5, 12], [232, 1, -2]);
    game.shotLabel = 'pier';
  } else if (n === 3) {
    // A different district: the western suburbs, with traffic cars and
    // pedestrians in frame and houses instead of towers.
    const spot = town.places.suburbStreet;
    p.place(spot.x, spot.z, Math.PI / 2);
    game.traffic.stageNear(spot.x, spot.z, 3, 4);
    game.hud.setObjective('Explore Sunset Bay');
    game.hud.showDialog('LENNY', 'West side’s quiet. Good place to disappear — if the rent ever gets paid.');
    game.setShotCamera([spot.x - 14, 7, spot.z + 16], [spot.x + 4, 1, spot.z - 4]);
    game.shotLabel = 'suburb';
  } else if (n === 4) {
    // Mission frame: the crossroads beacon column, goons, objective pill
    // and story dialog, with the downtown towers behind.
    const cross = town.places.crossroads;
    p.place(2, 16, Math.PI);
    game.horde.spawn(-4, -4, 3);
    game.missions.setBeacon({ x: cross.x, z: cross.z });
    game.hud.setObjective('Clear the crossroads of Kroll’s crew');
    game.hud.showDialog('MARA', 'Kroll’s crew holds the crossroads. Tonight the Bay remembers whose name is on it.');
    game.setShotCamera([10, 7.5, 30], [-2, 1.5, -2]);
    game.shotLabel = 'mission';
  }
  game.state = 'playing';
  game.shotActive = true;
  game.hud.showTitle(false);
}

// Kept tiny on purpose: the staging module owns no rendering state.
export function shotCount() { return 4; }
