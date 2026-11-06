# Architecture

## File layout

```
index.html        canvas shell, CSS scaling (pixelated), scanline/vignette overlay
js/util.js        rand/clamp/lerp/dist2/pick helpers (~15 lines)
js/textures.js    4 procedurally drawn 64x64 wall textures (+ dark variants)
js/sprites.js     all monster/item/projectile sprites, drawn + baked at load
js/audio.js       WebAudio synth: guns, rockets, growls, explosions, drone
js/level.js       the 5 ASCII maps, parser, Level.load(idx)
js/effects.js     particles, floor decals, screen splatter (FX namespace)
js/entities.js    MDEF table, monster AI, projectiles, rockets, pickups (Ent)
js/weapon.js      weapon defs, firing logic, viewmodel art (Weapon)
js/render.js      the raycaster and everything drawn inside the world
js/hud.js         status bar, marine face, minimap, messages, screens (HUD)
js/main.js        G state object, input, cheats, level flow, main loop
tools/validate.js node script validating every map
```

Load order matters (classic scripts, globals only):
`util → textures → sprites → audio → level → effects → entities → weapon → render → hud → main`.
Each file defines one global namespace (`Tex`, `Spr`, `Snd`, `Level`, `FX`,
`Ent`, `Weapon`, `Render`, `HUD`, `G`) or plain functions (`castRay`, `rand`, …).

## Boot sequence

`js/main.js`, on `window.load`:

1. `Level.load(0)` — parse level 1 into `Level.grid/start/spawns`.
2. `Tex.gen()` / `Spr.gen()` — bake all procedural art into offscreen canvases
   (this is where "no assets" happens; see
   [effects-and-audio.md](effects-and-audio.md#sprite-baking)).
3. `Render.init(canvas)` — grab the 2D context, allocate the z-buffer
   (`Float32Array(640)`), precompute ceiling/floor gradients.
4. `HUD.init()` — renders the static minimap backdrop for the current level.
5. `newGame(null)` — build the player, `Ent.spawn(G)` the monsters/items.
6. `state = 'title'` and start the `requestAnimationFrame` loop. The title
   screen is drawn **over a live render** of level 1 with a slowly rotating
   camera (`player.ang += dt * 0.09`).

## The game state object `G`

One shared mutable object, defined in `js/main.js`. Everything reads/writes it:

```js
G.state        // 'title' | 'play' | 'pause' | 'dead' | 'win'
G.player       // position, angle, hp, ammo pools, weapon, animation timers
G.monsters[]   // entity objects from Ent.spawn (corpses stay in the array)
G.items[]      // medkits + ammo boxes (taken:true once collected)
G.projs[]      // both monster fireballs AND player rockets (pr.player flag)
G.particles[]  // blood/puff/spark — see effects-and-audio.md
G.decals[]     // permanent floor stains (blood pools, scorch marks)
G.splats[]     // screen-space blood splatter
G.msgs[]       // top-left message feed
G.kills / G.total / G.shots / G.hits        // per-level stats
G.levelIdx / G.totKills / G.totTime         // campaign progress
G.god / G.noclip                             // cheat flags
G.shake / G.dmgFlash / G.pickFlash / G.grinT / G.painT   // juice timers
G.input        // { keys: {code:bool}, fire: bool }
```

## Game states

```
        click                  click / Enter            kills == total
 title ───────► play ⇄ pause   dead ───────► retry(same level, fresh loadout)
                   │  ▲         ▲                 │
                   │  └──────────┘ player hp <= 0 │ last level? ──► title
                   │            damage            ▼            (HELL CLEARED)
                   └──────────────────────────► win ──► next level
                                                  (carries hp/ammo/weapon)
```

- `pause` is entered on pointer-lock loss, window blur, or Esc (when the
  browser refused pointer lock). Any click resumes and re-requests the lock.
- `win` triggers after a 1.3 s grace period (`G.winDelay`) once
  `G.kills >= G.total`.
- `nextLevel()` snapshots `{hp, ammo, rifle, rockets, weapon}` and passes it
  into `loadLevel(idx + 1, carry)`; death restarts the same level with
  `defaultLoadout()` (100 hp, 24 shells, 90 rounds, 6 rockets, shotgun).

## The main loop

```js
function loop(ts) {
  var dt = clamp((ts - last) / 1000, 0, 0.05);   // clamp: tab-switch spikes
  last = ts;
  try {
    update(dt);          // state machine, AI, physics — skipped in pause
    Render.frame(G);     // world (see renderer.md)
    HUD.draw(G.ctx, G);  // overlays, status bar, screens
  } catch (e) { console.error(e); }   // a bad frame never kills the loop
  requestAnimationFrame(loop);
}
```

`update(dt)` responsibilities in order: title-screen camera pan → player
movement (`movePlayer`) → `Ent.updateMonsters` → `Ent.updateProjs` →
`Ent.updateItems` → `FX.update` → `Weapon.update` (which auto-fires while the
button is held) → decay all juice timers → win check.

## Input

All listeners on `window` (`js/main.js`):

| Event | Behaviour |
|---|---|
| `keydown`/`keyup` | fill `G.input.keys`; Tab toggles minimap; M mutes; 1–4 select weapons; Enter confirms win/dead screens; Esc pauses (no-lock mode); every `Key[A-Z]` feeds the cheat buffer |
| `mousemove` | pointer-locked only: `ang += movementX * 0.0023` |
| `mousedown`/`mouseup` (button 0) | also boots audio (`Snd.init` + `resume` — WebAudio needs a user gesture); drives all state transitions; sets `G.input.fire` |
| `wheel` | cycles `Weapon.ORDER` |
| `blur` | clears keys, pauses |
| `pointerlockchange` | lost lock while playing → pause; gained while paused → resume |

Prevent-default list (no page scroll / no browser shortcuts): Tab, Space,
arrows, ControlLeft.

## Cheat codes

A rolling buffer of the last 10 letters typed (lowercased), suffix-matched on
every letter keydown:

```js
cheatBuf = (cheatBuf + letter).slice(-10);
if (cheatBuf.slice(-5) === 'iddqd') { G.god = !G.god; if (G.god) p.hp = 100; … }
```

- `iddqd` — `G.god` (checked in `G.playerDamage`, fireball collision and
  rocket splash). Turning it on also heals to 100, like the original.
- `idkfa` — fills all three ammo pools to their caps (50/240/30).
- `idclip` — `G.noclip`: `movePlayer` then applies raw translation with no
  `circleFits` tests and no monster push-out.

Note the lowercase normalization — keyboard events give `KeyI`, and the codes
are lowercase, so the buffer lowercases before comparing (this was an actual
bug during development).

## Test hooks

`window.G` is always exposed. Additionally:

- `G.debugStart()` — fresh level 1, straight to `play`, no pointer lock.
- `G.step(dt)` — run `update(dt)` once out of band.

These exist because hidden tabs throttle `requestAnimationFrame`; automated
tests drive the world synchronously (see the "Debugging hooks" section of
[index.md](index.md)).
