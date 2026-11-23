// Sunset Bay — every tuning number in one place: movement, driving,
// police, weapons, economy and keys.
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  accel: 42,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.55,
  height: 1.8,
  health: 100,
  punchDamage: 14,
  punchRange: 1.7,
  punchCooldown: 0.42,
};

export const CAR = {
  maxSpeed: 36,
  reverseSpeed: 11,
  accel: 17,
  brake: 32,
  turnRate: 2.0,
  grip: 6.5,
  handbrakeGrip: 1.7,
  radius: 1.7,
  enterRange: 3.8,
};

export const TRAFFIC = {
  carCount: 14,
  pedCount: 24,
  carSpeed: 8.5,
  pedSpeed: 1.7,
};

export const POLICE = {
  carSpeed: 31,
  carAccel: 21,
  spawnDistance: 60,
  maxCars: 5,
  footSpeed: 7.6,
  arrestRange: 1.9,
  arrestTime: 2.4,
  decayDelay: 9,
  decayStep: 14,
  sightRange: 44,
  ramDamage: 7,
};

export const WEAPONS = {
  pistolDamage: 26,
  pistolRange: 60,
  pistolCooldown: 0.26,
  pistolMag: 12,
  reloadTime: 1.1,
};

export const ECONOMY = {
  startCash: 120,
  stashValue: 75,
  stashCount: 6,
  bustedFine: 150,
  wastedFine: 100,
};

export const KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  run: 'ShiftLeft',
  runAlt: 'ShiftRight',
  enter: 'KeyE',
  punch: 'KeyF',
  weapon: 'KeyQ',
  reload: 'KeyR',
  pause: 'KeyP',
  escape: 'Escape',
  phone: 'KeyM',
  mute: 'KeyN',
};

export const MISSION_REWARDS = [400, 600, 900, 1500];

export const CAR_PAINTS = [0xd84a3a, 0x3a6fd8, 0xe8c84a, 0x48b868, 0xe8e8e8, 0x2e2e34, 0x8a4ad8, 0xd8803a, 0x2e7f9e];
export const SHIRTS = [0x3a6fd8, 0xd84a3a, 0x48b868, 0xe8c84a, 0x8a4ad8, 0xe8e8e8, 0x2e7f9e, 0xd8803a];
export const SKINS = [0xc9a06a, 0x8a5a3a, 0xe8c09a, 0x6a452e, 0xb87a52];
