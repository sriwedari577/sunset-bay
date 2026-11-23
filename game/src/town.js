// Sunset Bay: a procedural 480x480 coastal city. Three districts that read
// differently from the street and from the air — downtown towers in the
// middle, low suburbs in the west, and a beach + sea + pier in the east —
// built from one seeded pass so every staging scene is deterministic.
import * as THREE from 'three';
import { T } from './tuning.js';
import { mulberry32, pick } from './util.js';

const HALF = T.worldHalf;
const GAP = T.roadGap;
const RW = T.roadWidth;

// Road centre lines (both axes). Blocks sit between neighbouring lines.
export const ROAD_LINES = [];
for (let c = -180; c <= 180; c += GAP) ROAD_LINES.push(c);

function districtAt(x, z) {
  if (x > 148) return 'beach';
  if (Math.abs(x) < 95 && Math.abs(z) < 95) return 'downtown';
  if (x < -118) return 'suburb';
  return 'midtown';
}

function groundTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const toPx = (v) => ((v + HALF) / (HALF * 2)) * S;
  const px = (v) => ((v + HALF) / (HALF * 2)) * S;
  const wPx = (v) => (v / (HALF * 2)) * S;
  // Base: dry city blocks.
  g.fillStyle = '#8f9484'; g.fillRect(0, 0, S, S);
  // Sand on the beach strip.
  g.fillStyle = '#e2cf9a'; g.fillRect(toPx(150), 0, S - toPx(150), S);
  // Sea bed under the water plane.
  g.fillStyle = '#c9b183'; g.fillRect(toPx(206), 0, S - toPx(206), S);
  // Blocks: alternating pale lots between roads.
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
      const x0 = ROAD_LINES[ix] + RW / 2, x1 = ROAD_LINES[ix + 1] - RW / 2;
      const z0 = ROAD_LINES[iz] + RW / 2, z1 = ROAD_LINES[iz + 1] - RW / 2;
      if (x0 > 148) continue; // beach: sand stays bare
      g.fillStyle = (ix + iz) % 2 ? '#a8a89b' : '#9d9d92';
      g.fillRect(px(x0), px(z0), px(x1) - px(x0), px(z1) - px(z0));
    }
  }
  // Roads: dark asphalt with centre dashes.
  g.fillStyle = '#3a3d42';
  for (const c of ROAD_LINES) {
    g.fillRect(px(c - RW / 2), 0, wPx(RW), S);
    g.fillRect(0, px(c - RW / 2), S, wPx(RW));
  }
  g.fillStyle = '#c8c25a';
  for (const c of ROAD_LINES) {
    for (let v = -HALF + 8; v < HALF; v += 16) {
      g.fillRect(px(c) - 2, px(v), 4, 7);
      g.fillRect(px(v), px(c) - 2, 7, 4);
    }
  }
  // Crosswalks at the central junction.
  g.fillStyle = '#d8d8d2';
  for (let i = -2; i <= 2; i++) {
    g.fillRect(px(-14 + i * 5), px(-RW / 2), 3, wPx(RW));
    g.fillRect(px(-RW / 2), px(-14 + i * 5), wPx(RW), 3);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildTown(scene, seed = 20261123) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  group.add(ground);

  // Sea: a translucent plane east of the sand, plus a deeper second sheet.
  const seaMat = new THREE.MeshLambertMaterial({
    color: 0x1f7fa8, transparent: true, opacity: 0.86,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(36, HALF * 2), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(206 + 17, 0.25, 0);
  sea.name = 'sea';
  group.add(sea);
  const seaDeep = new THREE.Mesh(
    new THREE.PlaneGeometry(10, HALF * 2),
    new THREE.MeshLambertMaterial({ color: 0x145a7d })
  );
  seaDeep.rotation.x = -Math.PI / 2;
  seaDeep.position.set(236, 0.12, 0);
  group.add(seaDeep);

  // Shared geometry / palette for buildings.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const palette = [
    0xd9c9a8, 0xc4b49a, 0xb08d6a, 0x9fb4c4, 0x7f96a8,
    0xc48a6a, 0x8a9a7a, 0xd8d3c4, 0x6f8296, 0xa89a80,
  ].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a52 });

  function addBuilding(cx, cz, w, d, h, mat) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    group.add(m);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.5, d + 0.6);
    roof.position.set(cx, h + 0.25, cz);
    group.add(roof);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return m;
  }

  // Buildings, one or two per block, scaled by district.
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
      const x0 = ROAD_LINES[ix] + RW / 2 + 3, x1 = ROAD_LINES[ix + 1] - RW / 2 - 3;
      const z0 = ROAD_LINES[iz] + RW / 2 + 3, z1 = ROAD_LINES[iz + 1] - RW / 2 - 3;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const district = districtAt(cx, cz);
      if (district === 'beach') continue;
      const bw = x1 - x0, bd = z1 - z0;
      if (district === 'downtown') {
        const h = 22 + rng() * 34;
        addBuilding(cx, cz, bw * 0.72, bd * 0.72, h, pick(rng, palette));
        if (rng() < 0.5) {
          addBuilding(cx + bw * 0.28, cz + bd * 0.26, bw * 0.3, bd * 0.3, 8 + rng() * 8, pick(rng, palette));
        }
      } else if (district === 'suburb') {
        addBuilding(cx - bw * 0.2, cz, bw * 0.34, bd * 0.4, 5 + rng() * 3, pick(rng, palette));
        addBuilding(cx + bw * 0.22, cz + bd * 0.12, bw * 0.3, bd * 0.34, 4 + rng() * 3, pick(rng, palette));
      } else {
        addBuilding(cx, cz, bw * 0.55, bd * 0.55, 10 + rng() * 14, pick(rng, palette));
      }
    }
  }

  // Beach: palms, umbrellas, lifeguard chair along the sand.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
  const leafGeo = new THREE.SphereGeometry(2.2, 7, 5);
  for (let i = 0; i < 16; i++) {
    const x = 158 + rng() * 42, z = -220 + rng() * 440;
    if (Math.abs(z) < 10) continue; // keep the pier approach clear
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.scale.y = 0.55;
    leaves.position.set(x, 7.4, z);
    group.add(leaves);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xe86a4a });
  const umGeo = new THREE.ConeGeometry(2.6, 1.4, 8);
  for (let i = 0; i < 8; i++) {
    const x = 168 + rng() * 26, z = -200 + rng() * 400;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 5), trunkMat);
    pole.position.set(x, 1.3, z); group.add(pole);
    const um = new THREE.Mesh(umGeo, umbrellaMat);
    um.position.set(x, 3.1, z); group.add(um);
  }

  // Pier: planks out over the sea at z = 0, a shack at the far end.
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const plankGeo = new THREE.BoxGeometry(3.4, 0.5, 8);
  for (let x = 204; x <= 236; x += 3.6) {
    const p = new THREE.Mesh(plankGeo, plankMat);
    p.position.set(x, 0.55, 0);
    group.add(p);
  }
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6);
  for (let x = 206; x <= 236; x += 7.4) {
    for (const z of [-3.6, 3.6]) {
      const post = new THREE.Mesh(postGeo, trunkMat);
      post.position.set(x, 0, z);
      group.add(post);
    }
  }
  addBuilding(234, 0, 5, 7, 4, new THREE.MeshLambertMaterial({ color: 0x3f6a8a }));
  // The shack's collider is the pier-end wall: walking past it drops into sea.
  colliders.push({ minX: 236.5, maxX: 242, minZ: -8, maxZ: 8 });

  // Street lamps along the central roads (visual only, no colliders).
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c2e33 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 6, 5);
  const bulbGeo = new THREE.SphereGeometry(0.42, 6, 5);
  for (const c of [-120, 0, 120]) {
    for (let v = -180; v <= 180; v += 60) {
      const pole = new THREE.Mesh(poleGeo, lampMat);
      pole.position.set(c + 7, 3, v); group.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(c + 7, 6.2, v); group.add(bulb);
    }
  }

  // Named places the missions and staging use.
  const places = {
    pierStash: { x: 228, z: 0 },
    crossroads: { x: 0, z: 0 },
    beachRoad: { x: 168, z: -60 },
    suburbStreet: { x: -150, z: 60 },
    downtownChase: { x: -30, z: 30 },
    maraBar: { x: -60, z: -90 },
  };

  return {
    group, colliders, places,
    update(dt, time) {
      // Gentle sea shimmer: the water sheet breathes almost imperceptibly.
      sea.position.y = 0.25 + Math.sin(time * 0.7) * 0.05;
    },
  };
}
