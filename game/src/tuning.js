// Every tunable number for Sunset Bay lives here, so balance changes
// never require hunting through gameplay code.

export const T = {
  worldHalf: 240,
  roadGap: 60,
  roadWidth: 11,

  // On foot
  walkSpeed: 7,
  runSpeed: 11.5,
  playerRadius: 0.9,
  playerHealth: 100,
  punchDamage: 12,
  punchRange: 2.4,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 60,
  pistolCooldown: 0.28,
  pistolAmmoStart: 24,

  // Driving (arcade)
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 40,
  carMaxReverse: 12,
  carTurnRate: 2.1,
  carRadius: 1.9,
  stealWanted: 1,

  // Traffic + pedestrians
  trafficCount: 14,
  trafficSpeed: 9,
  pedCount: 22,
  pedSpeed: 1.6,

  // Wanted / police
  wantedMax: 5,
  copCarSpeed: 34,
  copSpawnDist: 55,
  maxCopCars: 5,
  bustHoldTime: 2.6,
  bustRange: 7,
  arrestRange: 4.5,
  wantedDecayTime: 22,
  finePerStar: 60,

  // Missions + money
  startCash: 520,
  stashValues: [75, 60, 90, 50, 120, 80],
  missionReward: [150, 220, 300, 500],
  goonHealth: 45,
  goonDamage: 8,
  goonSpeed: 5.2,

  // Camera
  camHeight: 7.5,
  camBack: 11,
  camLookAhead: 6,
};
