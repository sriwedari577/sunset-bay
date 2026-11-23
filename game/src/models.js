// Sunset Bay — mesh builders for people and cars. Everything is boxes and
// cylinders with flat Lambert colours: readable silhouettes, no assets,
// and a soft blob shadow under each actor instead of a shadow map.
import * as THREE from 'three';

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

function blobShadow(radius) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

// A person about 1.8 units tall, facing +Z when yaw is 0. The arms and legs
// pivot at the shoulder/hip so the walk cycle can swing them.
export function makePerson(opts = {}) {
  const shirt = opts.shirt ?? 0x3a6fd8;
  const pants = opts.pants ?? 0x2e3438;
  const skin = opts.skin ?? 0xc9a06a;
  const hair = opts.hair ?? 0x2e2018;
  const group = new THREE.Group();

  const legL = new THREE.Group(); legL.position.set(-0.14, 0.82, 0);
  const legR = new THREE.Group(); legR.position.set(0.14, 0.82, 0);
  legL.add(box(0.2, 0.8, 0.24, pants, 0, -0.4, 0));
  legR.add(box(0.2, 0.8, 0.24, pants, 0, -0.4, 0));
  group.add(legL, legR);

  const torso = box(0.56, 0.62, 0.3, shirt, 0, 1.13, 0);
  group.add(torso);
  const armL = new THREE.Group(); armL.position.set(-0.36, 1.38, 0);
  const armR = new THREE.Group(); armR.position.set(0.36, 1.38, 0);
  armL.add(box(0.15, 0.56, 0.18, shirt, 0, -0.26, 0));
  armR.add(box(0.15, 0.56, 0.18, shirt, 0, -0.26, 0));
  armL.add(box(0.14, 0.14, 0.16, skin, 0, -0.58, 0));
  armR.add(box(0.14, 0.14, 0.16, skin, 0, -0.58, 0));
  group.add(armL, armR);

  const head = new THREE.Group();
  head.position.set(0, 1.44, 0);
  head.add(box(0.4, 0.4, 0.4, skin, 0, 0.2, 0));
  head.add(box(0.42, 0.14, 0.42, hair, 0, 0.42, 0));
  // Simple face: two dark eyes on the +Z side.
  head.add(box(0.06, 0.06, 0.03, 0x1a1a1a, -0.1, 0.22, 0.21));
  head.add(box(0.06, 0.06, 0.03, 0x1a1a1a, 0.1, 0.22, 0.21));
  group.add(head);

  if (opts.hat !== undefined) {
    const hat = box(0.5, 0.12, 0.5, opts.hat, 0, 0.5, 0);
    head.add(hat);
    head.add(box(0.2, 0.16, 0.2, opts.hat, 0, 0.6, 0));
  }
  if (opts.cap) {
    head.add(box(0.44, 0.1, 0.44, opts.cap, 0, 0.46, 0));
    head.add(box(0.3, 0.04, 0.2, opts.cap, 0, 0.42, 0.3));
  }

  const shadow = blobShadow(0.55);
  group.add(shadow);

  return {
    group,
    parts: { legL, legR, armL, armR, head, torso },
    shadow,
    phase: Math.random() * 6,
    // Swing limbs with the distance walked; `moving` 0..1 scales the swing.
    stride(dt, speed) {
      this.phase += dt * speed * 1.6;
      const s = Math.sin(this.phase) * 0.6 * Math.min(1, speed / 5);
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;
      if (speed < 0.2) {
        legL.rotation.x *= 0.2; legR.rotation.x *= 0.2;
        armL.rotation.x *= 0.2; armR.rotation.x *= 0.2;
      }
    },
    punch(t) {
      // t: 0..1 through the punch; the right arm snaps forward.
      const reach = Math.sin(Math.min(1, t) * Math.PI);
      armR.rotation.x = -Math.PI / 2 - reach * 0.5;
      armR.position.z = reach * 0.3;
      if (t >= 1) armR.position.z = 0;
    },
    aimPistol() {
      armR.rotation.x = -Math.PI / 2 + 0.15;
      armL.rotation.x = -Math.PI / 2 + 0.35;
    },
    relaxArms() {
      armL.rotation.x = 0; armR.rotation.x = 0;
    },
  };
}

// A car about 4.4 long and 1.9 wide, facing +Z when yaw is 0. Wheels spin
// with distance driven; front wheels also yaw with steering.
export function makeCar(opts = {}) {
  const paint = opts.paint ?? 0xd84a3a;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc8e0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 2.0), bodyMat);
  roof.position.set(0, 1.48, -0.25);
  group.add(roof);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 0.24), darkMat);
  bumperF.position.set(0, 0.42, 2.24);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.24;
  group.add(bumperR);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  for (const sx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), lampMat);
    lamp.position.set(sx, 0.72, 2.22);
    group.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xd83028 }));
    tail.position.set(sx, 0.72, -2.22);
    group.add(tail);
  }

  let lightBar = null;
  if (opts.police) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.42), darkMat);
    barBase.position.set(0, 1.58, -0.25);
    group.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2a20 }));
    red.position.set(-0.28, 1.7, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2060ff }));
    blue.position.set(0.28, 1.7, -0.25);
    group.add(red, blue);
    lightBar = { red, blue };
    const star = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xe8e2c8 }));
    star.position.set(0, 0.62, 0.98);
    star.rotation.x = 0;
    group.add(star);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const steers = [];
  for (const [wx, wz, front] of [[-0.92, 1.45, true], [0.92, 1.45, true], [-0.92, -1.45, false], [0.92, -1.45, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.4, wz);
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (front) steers.push(pivot);
  }

  const shadow = blobShadow(1.5);
  shadow.scale.set(1.15, 1.6, 1);
  group.add(shadow);

  return {
    group, wheels, steers, lightBar,
    roll(distance, steer) {
      for (const w of wheels) w.rotation.x += distance / 0.4;
      for (const s of steers) s.rotation.y = steer * 0.42;
    },
    flash(on) {
      if (!lightBar) return;
      lightBar.red.visible = on;
      lightBar.blue.visible = !on;
    },
  };
}
