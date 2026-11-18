# Solmar Heat

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/xlondze21/solmar-heat-v4/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/xlondze21/solmar-heat-v4/reward.svg)](https://make.fun/bounty/gta6-01)

Solmar Heat is a 2D top-down open-world crime game set in Solmar, a fictional
dusk-lit port city of marinas, beaches, a fish market and an old town — built
for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).
You play Rico, back in town with empty pockets and a long list of jobs: steal
cars, run ten story missions, dodge the Solmar PD, and take the crown.

## What is in the game

- **A city to explore on foot and by car** — a 12x12 block grid with a beach
  and open sea to the south, a marina with a driveable skiff, and a hospital
  helipad with a flyable police helicopter.
- **Traffic and pedestrians** — AI cars follow the road graph, stop at red
  lights and queue behind each other; pedestrians stroll the sidewalks and
  run when a car comes at them too fast.
- **Four cars to steal** — sedan, taxi, truck and sports car, each with its
  own speed and handling, plus police cruisers, a boat and a helicopter.
- **A wanted level that fights back** — 1 to 5 stars, cruisers that pathfind,
  ram and form up around you, a police helicopter from 3 stars up (shoot it
  down and it takes 45 seconds to send another), and being busted by being
  held still next to a cruiser.
- **Ten story missions** — First Fare, Hot Delivery, Lose the Heat, Turf
  Pickup, The Gull Run, Fish Market Heist, Tide Runner, Deco Dash, Night
  Shift and the Solmar Crown, each paying cash and street REP.
- **Combat** — fists and a pistol (buy ammo at the gun shop).
- **A HUD with a minimap** — wanted stars, cash, health, speed, mission
  tracker, tide gauge, radio station and rival gang turf on the minimap.
- **Progression that sticks** — a garage where you buy and keep cars, a
  paint shop, a safehouse that clears your wanted level and saves, and a
  save in localStorage.
- **A living city** — a full day/night cycle (noon heat makes the police
  more aggressive), a tide cycle that opens the sand road at low tide, three
  synth radio stations, dusk lighting, skid marks, smoke, sparks, screen
  shake and fully synthesised WebAudio sound. No network requests, no
  downloaded assets: everything is drawn and synthesised in code.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk or drive (W accelerates, S brakes/reverses) |
| E | Enter/exit a car, boat or helicopter; use the paint shop / garage |
| F | Punch |
| Mouse click | Shoot the pistol toward the cursor |
| R | Change radio station |
| B | Buy (car at the garage, ammo at the gun shop) |
| P / Esc | Pause |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — the game runs entirely offline from the
files under `game/`. The entry program hands the game in with:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are taken deterministically with `?shot=cover|drive|mission|chase&seed=1`
(see `shots.json`).

## Credits

Built by an AI agent for the make.fun GTA 6 bounty. Solmar, Rico, the Gulls,
the Vipers and the Tide Kings are original creations for this game — nothing
here is taken from any commercial game.
