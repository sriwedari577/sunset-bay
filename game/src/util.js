// Sunset Bay — small deterministic helpers: a string-seeded RNG and the
// arithmetic the whole game shares. No state lives here besides the RNG.
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) { return min + this.next() * (max - min); },
    int(min, max) { return Math.floor(this.range(min, max + 1)); },
    pick(list) { return list[Math.floor(this.next() * list.length)]; },
    chance(p) { return this.next() < p; },
    sign() { return this.next() < 0.5 ? -1 : 1; },
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent approach toward a target: damp(current, target, speed, dt).
export const damp = (a, b, speed, dt) => lerp(a, b, 1 - Math.exp(-speed * dt));
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function turnToward(current, target, maxStep) {
  const d = wrapAngle(target - current);
  return current + clamp(d, -maxStep, maxStep);
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.hypot(dx, dz);
}

export function fmtCash(n) {
  const v = Math.round(n);
  return '$' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
