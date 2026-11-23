// Sunset Bay — save game in localStorage: cash, mission progress, the
// stashes found, and where the player was standing.
const KEY = 'sunset-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage off: the run simply is not kept */ }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
