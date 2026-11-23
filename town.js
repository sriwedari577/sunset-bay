// Sunset Bay — the procedural town. Builds the ground, roads, buildings,
// beach, pier and street props from one seed, and hands back the collision
// boxes and the road network the traffic and police drive on.
import * as THREE from 'three';
import { makeRng, clamp } from './util.js';

export const TOWN = {
  half: 240, // playable square is [-240, 240] on x and z
  roadStep: 40, // distance between road centre lines
  roadWidth: 10,
  beachZ: -212, // z below this is sand
  seaZ: -234, // z below this is water
  // Cash stash spots: kerbside and walkable, never inside a building.
  // The first is Mara's package under the pier — the target of job 1.
  stashSpots: [[60, -232], [47, -140], [-153, -180], [47, 180], [-47, 100], [193, 47]],
};

const ROOF_COLORS = [0x8a7a68, 0x6e7d86, 0x9a8a7a, 0x7a6a58];
const WALL_TINTS = [0xe8e0d0, 0xd9c9a8, 0xc9d6dd, 0xe6b8a0, 0xf2ead8, 0xb8c4c9, 0xd8b8c0, 0x9fb8a8];
const LEAF_COLORS = [0x3e8e4a, 0x54a854, 0x2f7d3e];
const AWNING_COLORS = [0xd84a3a, 0x2e7f9e, 0xe8a83a, 0x54a854];

function facadeTexture(rng, warm) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = warm ? '#d8cbb2' : '#c3ccd4';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 14) {
    for (let x = 6; x < 58; x += 13) {
      const lit = rng.chance(0.42);
      g.fillStyle = lit ? '#ffe9a8' : '#3a4a58';
      g.fillRect(x, y, 8, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f46';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#565c64';
  g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3);
  g.fillStyle = '#e8e2c8';
  g.fillRect(29, 8, 6, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg; g.font = '900 30px Trebuchet MS, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTown(scene, seed) {
  const rng = makeRng(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const roadLines = [];
  for (let k = -5; k <= 5; k++) roadLines.push(k * TOWN.roadStep);

  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);

  // Lighting: warm late-afternoon sun plus sky bounce. No shadow maps;
  // people and cars carry soft blob shadows instead (cheap, always crisp).
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.4);
  sun.position.set(140, 220, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fc8e8, 0x6a7a52, 1.5));
  scene.fog = new THREE.Fog(0xcfe9f7, 260, 520);
  scene.background = new THREE.Color(0x8fc3e8);

  // Ground, sand, sea.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x7fae5c });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0; group.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(560, 280 + TOWN.beachZ),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (TOWN.beachZ - 280) / 2);
  group.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(560, 280 + TOWN.seaZ),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e, transparent: true, opacity: 0.92 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, (TOWN.seaZ - 280) / 2);
  group.add(sea);

  // Sidewalks and roads. The road texture carries the dashed centre line, so
  // no hundreds of little dash meshes are needed. Geometry is baked flat
  // with rotateX; vertical roads just turn around Y.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a6 });
  const tex = roadTexture();
  const walkGeo = new THREE.PlaneGeometry(480, TOWN.roadWidth + 4);
  walkGeo.rotateX(-Math.PI / 2);
  const roadGeo = new THREE.PlaneGeometry(480, TOWN.roadWidth);
  roadGeo.rotateX(-Math.PI / 2);
  for (const line of roadLines) {
    const walkH = new THREE.Mesh(walkGeo, walkMat);
    walkH.position.set(0, 0.03, line);
    group.add(walkH);
    const walkV = new THREE.Mesh(walkGeo, walkMat);
    walkV.position.set(line, 0.03, 0);
    walkV.rotation.y = Math.PI / 2;
    group.add(walkV);
    const roadTex = tex.clone();
    roadTex.needsUpdate = true;
    roadTex.repeat.set(40, 1);
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const roadH = new THREE.Mesh(roadGeo, roadMat);
    roadH.position.set(0, 0.06, line);
    group.add(roadH);
    const roadV = new THREE.Mesh(roadGeo, roadMat);
    roadV.position.set(line, 0.06, 0);
    roadV.rotation.y = Math.PI / 2;
    group.add(roadV);
  }

  // Buildings, one or two per block, taller toward the middle of town.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const facadeMats = [facadeTexture(rng, true), facadeTexture(rng, false), facadeTexture(rng, true)]
    .map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const tintMats = WALL_TINTS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const roofMats = ROOF_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const landmarks = {};
  const carSpawns = [];

  function addBox(x, z, w, h, d, mat, yBase = 0) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, yBase + h / 2, z);
    group.add(m);
    return m;
  }

  for (let ix = 0; ix < 10; ix++) {
    for (let iz = 0; iz < 10; iz++) {
      const cx = -180 + ix * 40;
      const cz = -180 + iz * 40;
      if (cz < TOWN.beachZ + 18) continue; // beach blocks stay open
      const distC = Math.hypot(cx, cz) / 260;
      const roll = rng.next();
      // A few blocks become a park, a car park, or the plaza.
      if (roll < 0.07) {
        // Park: grass, palms, benches (benches are low boxes).
        for (let p = 0; p < 5; p++) addPalm(cx + rng.range(-12, 12), cz + rng.range(-12, 12));
        addBox(cx - 8, cz + 6, 6, 0.8, 1.6, tintMats[3]);
        addBox(cx + 8, cz - 6, 6, 0.8, 1.6, tintMats[3]);
        continue;
      }
      if (roll < 0.13) {
        // Car park: flat lot with parked cars to steal.
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(28, 28),
          new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
        lot.rotation.x = -Math.PI / 2; lot.position.set(cx, 0.08, cz);
        group.add(lot);
        for (let p = 0; p < 4; p++) {
          carSpawns.push({ x: cx - 9 + (p % 2) * 18, z: cz - 7 + Math.floor(p / 2) * 14, yaw: p % 2 ? Math.PI : 0 });
        }
        continue;
      }
      const tall = clamp(34 - distC * 30 + rng.range(-4, 10), 8, 42);
      const split = rng.chance(0.4);
      const blocks = split ? [
        { dx: -7.5, dz: 0, w: 14, d: 28, h: tall * rng.range(0.6, 1) },
        { dx: 7.5, dz: 0, w: 14, d: 28, h: tall * rng.range(0.5, 0.95) },
      ] : [{ dx: 0, dz: 0, w: 28, d: 28, h: tall }];
      for (const b of blocks) {
        const mat = rng.chance(0.85) ? rng.pick(facadeMats) : rng.pick(tintMats);
        addBox(cx + b.dx, cz + b.dz, b.w, b.h, b.d, mat);
        addBox(cx + b.dx, cz + b.dz, b.w + 0.8, 0.7, b.d + 0.8, rng.pick(roofMats), b.h);
        colliders.push({ minX: cx + b.dx - b.w / 2, maxX: cx + b.dx + b.w / 2, minZ: cz + b.dz - b.d / 2, maxZ: cz + b.dz + b.d / 2 });
        if (rng.chance(0.4)) {
          addBox(cx + b.dx, cz + b.dz + b.d / 2 + 0.7, b.w * 0.6, 1.6, 1.2, new THREE.MeshLambertMaterial({ color: rng.pick(AWNING_COLORS) }), 3);
        }
      }
      if (rng.chance(0.5)) addPalm(cx + 16, cz + 16);
    }
  }

  // Landmarks: Mara's bar (mission hub), the police station, the pier.
  function landmark(x, z, w, h, d, mat, signText, signBg) {
    addBox(x, z, w, h, d, mat);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 3.2),
      new THREE.MeshBasicMaterial({ map: signTexture(signText, signBg, '#f5eedd') }));
    sign.position.set(x, h + 1.8, z + d / 2 + 0.1);
    group.add(sign);
    const sign2 = sign.clone();
    sign2.rotation.y = Math.PI;
    sign2.position.z = z - d / 2 - 0.1;
    group.add(sign2);
  }
  landmark(-180, 20, 26, 14, 24, tintMats[1], "MARA'S", '#7a2a3a');
  landmarks.mara = { x: -180, z: 20 };
  landmark(180, -20, 26, 16, 24, tintMats[5], 'POLICE', '#1e2a3a');
  landmarks.station = { x: 180, z: -20 };

  // Pier: walkable planks out over the sea, with posts and a shack.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7a58 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 44), pierMat);
  pier.position.set(60, 0.35, TOWN.seaZ - 14);
  group.add(pier);
  addBox(60, TOWN.seaZ - 32, 8, 5, 7, tintMats[0], 0.6);
  colliders.push({ minX: 56, maxX: 64, minZ: TOWN.seaZ - 35.5, maxZ: TOWN.seaZ - 28.5 });
  landmarks.pier = { x: 60, z: TOWN.seaZ - 14 };
  const pierWalk = { minX: 55, maxX: 65, minZ: TOWN.seaZ - 36, maxZ: TOWN.beachZ };

  // Palms, lamps, hydrants, billboards.
  function addPalm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
    trunk.position.set(x, 3.5, z); group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.2, 7),
      new THREE.MeshLambertMaterial({ color: rng.pick(LEAF_COLORS) }));
    top.position.set(x, 8.2, z); group.add(top);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }
  for (let i = 0; i < 26; i++) {
    addPalm(rng.range(-220, 220), rng.range(TOWN.beachZ - 6, TOWN.beachZ + 14));
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
  for (let ix = -5; ix <= 5; ix += 2) {
    for (let iz = -5; iz <= 5; iz += 2) {
      const x = ix * 40 + 6, z = iz * 40 + 6;
      if (z < TOWN.beachZ) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6, 5), lampMat);
      pole.position.set(x, 3, z); group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lampHeadMat);
      head.position.set(x, 6.2, z); group.add(head);
      colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.pick(roadLines) + rng.range(-14, 14);
    const z = rng.pick(roadLines) + rng.range(-14, 14);
    if (z < TOWN.beachZ) continue;
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.1, 7),
      new THREE.MeshLambertMaterial({ color: 0xd84a3a }));
    hyd.position.set(x, 0.55, z); group.add(hyd);
  }
  const billboards = [
    { x: -100, z: 138, text: 'SUNSET BAY', bg: '#e8a83a' },
    { x: 140, z: -100, text: 'VISIT THE PIER', bg: '#2e7f9e' },
    { x: 20, z: 178, text: "MARA'S • OPEN", bg: '#7a2a3a' },
  ];
  for (const b of billboards) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({ map: signTexture(b.text, b.bg, '#f5eedd'), side: THREE.DoubleSide }));
    board.position.set(b.x, 12, b.z); group.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 5), lampMat);
    post.position.set(b.x, 5, b.z); group.add(post);
    colliders.push({ minX: b.x - 0.4, maxX: b.x + 0.4, minZ: b.z - 0.4, maxZ: b.z + 0.4 });
  }

  // Clouds: a few flat drifting slabs, purely decorative.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(rng.range(24, 46), 2.5, rng.range(8, 14)), cloudMat);
    cloud.position.set(rng.range(-240, 240), rng.range(70, 95), rng.range(-240, 240));
    group.add(cloud);
    clouds.push(cloud);
  }

  // Parked cars along the kerbs for stealing.
  for (let i = 0; i < 8; i++) {
    const horizontal = rng.chance(0.5);
    const line = rng.pick(roadLines);
    const along = rng.range(-200, 200);
    const side = rng.sign() * (TOWN.roadWidth / 2 + 2.2);
    carSpawns.push(horizontal
      ? { x: along, z: line + side, yaw: rng.chance(0.5) ? 0 : Math.PI }
      : { x: line + side, z: along, yaw: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 });
  }

  return { group, colliders, roadLines, clouds, landmarks, carSpawns, pierWalk, sea, sand };
}

// Push a circle (x, z, radius) out of every collider it overlaps. Sea blocks
// movement except on the pier walkway. Returns the corrected position.
export function resolveWorld(x, z, radius, town) {
  const half = TOWN.half - radius;
  x = clamp(x, -half, half);
  z = clamp(z, -half, half);
  const onPier = x > town.pierWalk.minX && x < town.pierWalk.maxX && z > town.pierWalk.minZ && z < town.pierWalk.maxZ;
  if (z < TOWN.seaZ + radius && !onPier) z = TOWN.seaZ + radius;
  for (const c of town.colliders) {
    const nx = clamp(x, c.minX, c.maxX);
    const nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pushL = x - c.minX + radius, pushR = c.maxX + radius - x;
        const pushU = z - c.minZ + radius, pushD = c.maxZ + radius - z;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) x = c.minX - radius;
        else if (m === pushR) x = c.maxX + radius;
        else if (m === pushU) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return { x, z };
}

export function onRoad(x, z, town, margin = 1) {
  for (const line of town.roadLines) {
    if (Math.abs(x - line) < TOWN.roadWidth / 2 + margin) return true;
    if (Math.abs(z - line) < TOWN.roadWidth / 2 + margin) return true;
  }
  return false;
}
