# DOOM.js — Technical Documentation

A DOOM-like first-person shooter in pure JavaScript + Canvas 2D.
No assets, no dependencies, no build step: every wall texture, monster
sprite, weapon viewmodel and sound effect is generated procedurally at
startup.

## Run

```bash
python3 -m http.server 8099        # any static server
# open http://localhost:8099
```

Opening `index.html` directly from disk also works — classic `<script>` tags,
no modules, no `fetch`, nothing that requires an origin. Pointer lock works
from `file://` in Chrome/Firefox/Edge; if a browser refuses it, arrow-key
turning is the fallback.

## Documentation map

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | File layout, boot sequence, game loop, game states, input system, cheat codes, test hooks |
| [renderer.md](renderer.md) | The raycaster: DDA, perpendicular distance, wall projection, sprite billboarding + z-clipping, floor decals, particles, fog |
| [entities.md](entities.md) | Monster AI state machine, movement & collision, line of sight, attack types (hitscan / fireball / melee / burst), projectiles, rockets, pickups |
| [weapons.md](weapons.md) | Weapon definitions, hitscan math, AK heat bloom, rocket ballistics & splash, viewmodel drawing |
| [effects-and-audio.md](effects-and-audio.md) | Blood particles, floor decals, screen splatter, WebAudio synthesis |
| [level-format.md](level-format.md) | The ASCII map format, parsing, the 5-level campaign flow, the validator |
| [modding.md](modding.md) | Step-by-step: add a new level, a new weapon, a new monster |

## The 60-second tour

The whole game is ~2,900 lines of plain JS in 11 files. The core idea:

```
              ┌────────────┐   keystrokes / mouse
              │  main.js   │◄────────────────────── user
              │ game state │
              │  + input   │
              └─────┬──────┘
        update(dt)  │            render (every rAF frame)
   ┌────────────────┼───────────────────────┐
   ▼                ▼                       ▼
entities.js    effects.js              render.js        hud.js
 monster AI     particles/decs       DDA raycaster     status bar,
 projectiles    screen splats        sprite casting    face, minimap,
 weapons fire   audio triggers       decals, fog       overlays
   │                │                       │
   └──── writes ────┴──► G (shared state) ──┘
```

- **`G`** (in `js/main.js`) is the single shared game state object: player,
  monsters, items, projectiles, particles, decals, timers, counters. Every
  module is a stateless bag of functions that takes `G` as its first
  argument.
- **`Level`** (in `js/level.js`) holds the parsed map grid for the current
  level and is the only world-geometry source of truth.
- **The world** is a 2D top-down grid (cells are 1×1 units, walls are exactly
  1 unit tall). The 3D look is entirely a projection trick — see
  [renderer.md](renderer.md).
- Rendering runs at a fixed internal resolution of **640×400** (CSS-scaled,
  `image-rendering: pixelated`). A busy frame costs ~1.4 ms of Canvas time.

## Numbers worth knowing

| Thing | Value | Where |
|---|---|---|
| Internal resolution | 640×400 | `index.html` canvas |
| Camera plane length | 0.8 (≈77° horizontal FOV, square world units) | `Render` in `js/render.js` |
| Wall height | 1.0 world unit; camera implicitly at 0.5 | renderer math |
| Player | radius 0.26, speed 4.1 u/s, turn 2.8 rad/s | `js/main.js` |
| View bob | 10 Hz phase, driven by movement | `js/main.js` + `js/render.js` |
| Fog | starts 3.5 u, full at 17 u, max alpha 0.86 | `js/render.js` |
| Campaign | 5 levels, 106 monsters total | `js/level.js` |

## Debugging hooks

Open the browser console while playing:

- `window.G` — the live game state (try `G.god = true`).
- `G.debugStart()` — skip the title screen (no pointer lock needed).
- `G.step(dt)` — run one world update tick manually.
- `Render.frame(G); HUD.draw(G.ctx, G);` — paint one frame synchronously
  (useful when the tab is hidden and `requestAnimationFrame` is throttled).
