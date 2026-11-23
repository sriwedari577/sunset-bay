// localStorage persistence: cash, health, ammo, position, finished
// missions and collected stashes. Everything is guarded — a blocked or
// corrupt store simply means a fresh start.
const KEY = 'sunsetbay-save-v1';

export function saveGame(game) {
  try {
    const p = game.player;
    const data = {
      cash: p.cash,
      health: p.health,
      ammo: p.ammo,
      x: p.inCar ? p.inCar.x : p.x,
      z: p.inCar ? p.inCar.z : p.z,
      missions: [...game.missions.completed],
      stashes: game.missions.stashes.map((s) => s.taken),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(game) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const p = game.player;
    if (typeof d.cash === 'number') p.cash = d.cash;
    if (typeof d.health === 'number') p.health = Math.max(1, Math.min(p.maxHealth, d.health));
    if (typeof d.ammo === 'number') p.ammo = d.ammo;
    if (typeof d.x === 'number' && typeof d.z === 'number') p.place(d.x, d.z);
    if (Array.isArray(d.missions)) {
      for (const id of d.missions) game.missions.completed.add(id);
    }
    if (Array.isArray(d.stashes)) {
      d.stashes.forEach((taken, i) => {
        const s = game.missions.stashes[i];
        if (taken && s && !s.taken) {
          s.taken = true;
          game.scene.remove(s.mesh);
        }
      });
    }
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
