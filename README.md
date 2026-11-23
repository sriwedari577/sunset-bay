[![Sunset Bay](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/sriwedari577/sunset-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/sriwedari577/sunset-bay/reward.svg)](https://make.fun/bounty/gta6-01)

# Sunset Bay

An original open-world crime game in the spirit of GTA 6, built for
[make.fun's gta6-01 bounty](https://make.fun/bounty/gta6-01). Everything in
it is the author's own: the city, the characters, the vehicles, the story,
the art and the synthesized sound. No Rockstar Games names, logos,
characters, maps or assets, and nothing borrowed from any commercial game.

You are Rook, new in Sunset Bay, a sun-soaked coastal city. Mara runs the
bar on the west side; Vince Kroll runs the streets. Take Mara's jobs, steal
cars, dodge the police, and take the town for yourself.

## Play

Serve this directory and open the page, or open `game/index.html`
directly — the game runs fully offline in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Walk / drive |
| Mouse | Look around (click to capture) |
| E | Steal / leave a car |
| Space | Jump on foot / handbrake in a car |
| F / Click | Punch / shoot |
| Q | Swap fists and pistol |
| R | Reload |
| M | Mara's job board |
| P | Pause |
| N | Mute |

## What's in the Bay

- **A city on foot and by car** — a procedural grid of streets, towers,
  parks, car parks, a beach, a pier and the sea, all generated from a
  seed. Walk anywhere; drive anything.
- **Traffic and pedestrians** — cars follow the road grid and turn at
  intersections; pedestrians stroll the sidewalks and run when a car
  bears down on them.
- **Stealing cars** — parked cars and traffic cars are all fair game.
  Stealing one draws police attention.
- **Wanted level and police** — five stars of heat. Patrol cars pursue
  and ram; officers on foot close in and make arrests. Break line of
  sight and the heat cools off.
- **Missions and a story** — four jobs from Mara, with objectives,
  dialogs, a timed delivery, goons to beat, and a finale at the plaza.
  Cash stashes are hidden around town.
- **Combat** — fists and a pistol, with enemy crew who fight back.
- **HUD with a minimap** — wanted stars, cash, health, speed, weapon,
  objective tracker, and a round minimap with police, markers and
  mission beacons.
- **Start screen and save** — progress (cash, jobs done, stashes found,
  position) is kept in localStorage; continue from the title screen.
- **Sound** — every sound is synthesized live with WebAudio: engine hum,
  sirens, shots, pickups and a sunset groove. No audio files.

## Structure

- `game/index.html` — the page, HUD and menus.
- `game/src/main.js` — boot and the game loop.
- `game/src/town.js` — the procedural city, roads and collision.
- `game/src/models.js` — people and car meshes.
- `game/src/player.js` — walking, driving and the camera.
- `game/src/vehicles.js` — shared arcade car physics.
- `game/src/traffic.js` — traffic cars, pedestrians, parked cars.
- `game/src/cops.js` — wanted heat, pursuit cars and officers.
- `game/src/fight.js` — fists, pistol, enemy brawlers.
- `game/src/jobs.js` — Mara's missions, stashes and beacons.
- `game/src/hud.js` — HUD, minimap and menu screens.
- `game/src/controls.js`, `game/src/sound.js`, `game/src/save.js`,
  `game/src/tuning.js`, `game/src/util.js` — input, synth audio,
  saving, tuning numbers and shared helpers.
- `game/vendor/three.module.min.js` — three.js r160, vendored.
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes
  `dossier.json` with the vendored make.fun library.

## License

MIT. See [LICENSE](LICENSE).
