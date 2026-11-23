// Sunset Bay — deterministic screenshot scenes behind ?shot=. Each setup
// places the player, the heat and the police, then the main loop runs a
// fixed number of settle frames before the screenshot is taken.
export function stageShot(name, g) {
  const setups = {
    start() {
      g.teleportPlayer(-168, 30, 2.7);
      g.setCamera(2.7 + Math.PI, 0.3, 10);
      g.setObjective('Visit Mara\u2019s bar and take a job (M)');
    },
    play() {
      g.teleportPlayer(-58, 44, 2.4);
      g.setCamera(2.4 + Math.PI, 0.34, 8);
      g.setObjective('Free roam — explore Sunset Bay');
    },
    foot() {
      g.teleportPlayer(2, 50, 0);
      g.setCamera(Math.PI, 0.3, 7);
      g.placeTrafficNear(3);
      g.placePedsNear(4);
      g.setObjective('On foot in the city — traffic, pedestrians, and trouble');
    },
    drive() {
      g.giveCar(0, 44, 0, 0xd84a3a);
      g.setCamera(Math.PI, 0.26, 11);
      g.placeTrafficNear(3);
      g.placePedsNear(4);
      g.setObjective('Driving the Bay — E to leave the car');
    },
    chase() {
      g.giveCar(0, 44, 0, 0x3a6fd8);
      g.setWantedHeat(58);
      g.placePoliceNear(1);
      g.placePoliceAhead(2);
      g.setCamera(Math.PI, 0.24, 12);
      g.setObjective('Lose the police — break line of sight');
      g.say('MARA', 'You\u2019ve got stars now. Break line of sight and stay quiet until they give up.');
    },
    mission() {
      g.startJob(3);
      g.teleportPlayer(4, 4, -2.36);
      g.setCamera(-2.36 + Math.PI, 0.32, 10);
      g.say('MARA', 'This is it. The crossroads, four of his best. Take them down and the Bay hears about it.');
    },
  };
  (setups[name] || setups.play)();
}
