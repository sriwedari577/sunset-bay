// Procedural low-poly models: every car, person and prop is built from
// boxes and cylinders here, so the game needs no art assets at all.
import * as THREE from 'three';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 10);
const tireMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d4 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xd43a2a });
const barMat = new THREE.MeshBasicMaterial({ color: 0x4a7ad4 });

function box(mat, w, h, d, x, y, z, parent) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// A car facing +Z (forward). `color` picks the body paint; police adds a
// light bar and a black-and-white scheme.
export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const lowerMat = police
    ? new THREE.MeshLambertMaterial({ color: 0x14161a })
    : bodyMat;
  box(bodyMat, 2.0, 0.62, 4.4, 0, 0.62, 0, g);
  box(lowerMat, 2.02, 0.3, 4.42, 0, 0.32, 0, g);
  box(glassMat, 1.7, 0.55, 1.9, 0, 1.18, -0.25, g);
  box(bodyMat, 1.9, 0.22, 0.9, 0, 1.0, 1.75, g);
  box(lightMat, 0.42, 0.2, 0.1, -0.62, 0.66, 2.22, g);
  box(lightMat, 0.42, 0.2, 0.1, 0.62, 0.66, 2.22, g);
  box(tailMat, 0.42, 0.2, 0.1, -0.62, 0.66, -2.22, g);
  box(tailMat, 0.42, 0.2, 0.1, 0.62, 0.66, -2.22, g);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  let bar = null;
  if (police) {
    bar = new THREE.Group();
    const r = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xe23a2a }));
    r.scale.set(0.6, 0.22, 0.3); r.position.x = -0.4;
    const b = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2a6ae2 }));
    b.scale.set(0.6, 0.22, 0.3); b.position.x = 0.4;
    bar.add(r, b);
    bar.position.set(0, 1.6, -0.25);
    g.add(bar);
  }
  g.traverse((o) => { o.matrixAutoUpdate = true; });
  return { group: g, wheels, bar };
}

// A person standing, facing +Z. Arms swing when `walkPhase` advances.
export function makePersonMesh(shirt, pants, skin = 0xc89878) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skinMat);
  head.position.y = 1.62;
  g.add(head);
  box(new THREE.MeshLambertMaterial({ color: 0x2a2018 }), 0.56, 0.22, 0.56, 0, 1.86, 0, g); // hair
  box(shirtMat, 0.78, 0.72, 0.42, 0, 1.08, 0, g); // torso
  const armGeo = new THREE.BoxGeometry(0.22, 0.62, 0.22);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.52, 1.08, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.52, 1.08, 0);
  g.add(armL, armR);
  const legGeo = new THREE.BoxGeometry(0.28, 0.68, 0.28);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.2, 0.34, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.2, 0.34, 0);
  g.add(legL, legR);
  return {
    group: g, armL, armR, legL, legR,
    setWalk(phase, moving) {
      const s = moving ? Math.sin(phase) * 0.55 : 0;
      armL.rotation.x = s; armR.rotation.x = -s;
      legL.rotation.x = -s; legR.rotation.x = s;
    },
  };
}

// A glowing beacon column marking a mission objective.
export function makeBeaconMesh(color = 0xffd23a) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.4, depthWrite: false,
  });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 26, 10, 1, true), mat);
  col.position.y = 13;
  g.add(col);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.18, 6, 20),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

// A cash stash: a small green duffel with a glow ring.
export function makeStashMesh() {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2f6a34 }));
  bag.scale.set(0.9, 0.5, 0.6);
  bag.position.y = 0.25;
  g.add(bag);
  const strap = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1d4220 }));
  strap.scale.set(0.94, 0.12, 0.2);
  strap.position.y = 0.42;
  g.add(strap);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.1, 6, 18),
    new THREE.MeshBasicMaterial({ color: 0x51d45a })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);
  return g;
}
