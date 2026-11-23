![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/sriwedari577/sunset-bay/rank.svg)
![reward](https://make.fun/badge/gta6-01/sriwedari577/sunset-bay/reward.svg)

# Sunset Bay

An original open-world crime game in the spirit of GTA 6, built for the
make.fun `gta6-01` bounty. Mara Voss is back in Sunset Bay — a sun-soaked
coastal city with a downtown core, western suburbs and a beach, sea and
pier in the east — and Kroll's crew holds the crossroads. Steal cars,
dodge the precinct, run four story jobs for Lenny, collect hidden cash
stashes, and take the Bay back.

Everything is original: the city, the characters, the vehicles, the story
and the art are procedural, built in code. Nothing is taken from Rockstar
Games or any other commercial game. The game runs fully offline in desktop
Chrome from static files — no network requests.

## Play

```sh
node serve.ts
# then open http://localhost:8080
```

| Key | Action |
| --- | ------ |
| W A S D | Walk / drive |
| Shift | Run |
| E | Steal a car / get out |
| F or Space | Punch |
| Mouse click | Shoot the pistol |
| J | Jobs menu |
| 1–4 | Start a job from the jobs menu |
| Enter | Start / continue |

## The city

- **480×480 procedural city** — downtown towers, low suburbs, beach, sea
  and a wooden pier, all generated from a seed.
- **Traffic and pedestrians** fill the road grid; police cruisers respond
  to a 0–5 star wanted level with pursuit, ramming and arrests (busted).
- **Combat** — fists, a hitscan pistol, and Kroll's brawlers, who chase and
  swing. Getting beaten down means the wasted flow and a fresh start
  downtown.
- **HUD** — wanted stars, cash, health, speed, weapon and ammo, a round
  minimap, objectives, dialogs and messages.
- **Four story missions** — *Errand for Mara* (pier stash), *Hot Wheels*
  (steal and deliver a coupe), *The Drop* (a 75-second delivery) and
  *King of the Bay* (clear the crossroads) — plus six fixed cash stashes.
- **Synthesized sound** — WebAudio gunshots, sirens, pickups and mission
  stingers. No audio files.
- **Save** — cash, health, position, finished jobs and collected stashes
  persist in `localStorage`.

## Staging

`?shot=1` chase cover, `?shot=2` pier and sea, `?shot=3` suburb street
with traffic and pedestrians, `?shot=4` the crossroads mission frame.
`?test=1` exposes `window.__game` for scripted probes.

## Build

`node main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the vendored make.fun library
(`vendor/makefun-game.ts`). Three.js r160 is vendored as
`game/vendor/three.module.min.js`.
