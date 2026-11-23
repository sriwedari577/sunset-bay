// Small math + determinism helpers shared by every Sunset Bay module.
// No imports: this file must load anywhere, including headless test pages.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent approach toward a target.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

export const dist2d = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// Resolve a circle (x, z, radius) against axis-aligned box colliders.
// Returns a corrected {x, z, hit} — the circle is pushed out of every box.
export function collideCircle(x, z, r, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const cx = clamp(x, c.minX, c.maxX);
    const cz = clamp(z, c.minZ, c.maxZ);
    let dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r; z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = x - c.minX + r, pr = c.maxX - x + r;
      const pn = z - c.minZ + r, pf = c.maxZ - z + r;
      const m = Math.min(pl, pr, pn, pf);
      if (m === pl) x = c.minX - r;
      else if (m === pr) x = c.maxX + r;
      else if (m === pn) z = c.minZ - r;
      else z = c.maxZ + r;
    }
  }
  return { x, z, hit };
}

export function pointInBox(x, z, c, pad = 0) {
  return x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad;
}

export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
