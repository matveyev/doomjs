# Effects & Audio

Two independent systems: `js/effects.js` (`FX`) for the gore simulation, and
`js/audio.js` (`Snd`) for WebAudio synthesis. Neither touches the others'
domain — combat code calls both (`Ent.hurtMonster` → `FX.blood` +
`Snd.growl`).

## Particles (`G.particles`)

3D points with a height coordinate `z ∈ [0, 1]` (camera is at 0.5):

```js
{ x, y, z, vx, vy, vz, r, life, maxLife, color, kind }
```

- **kinds:** `blood` (gravity 6.5 u/s², dark red palette, alpha tied to
  remaining life), `puff` (wall dust, gravity 6.5 but slow), `spark`
  (gravity 2.5, drawn additively for fire/electric glow).
- Hard cap **320** particles (oldest are shifted out on spawn).
- Wall contact (`Level.solidAt`) kills the particle — blood doesn't run
  down walls, it just vanishes.
- **Floor contact is the fun part:** when `z <= 0`, a blood particle has a
  **60% chance to leave a permanent decal** at its position (radius
  0.04–0.12) before dying. This is why shooting a demon paints the floor
  around it.

Spawners: `FX.blood` (hemisphere burst along the shot direction, count
scaled by damage), `FX.puff` (7 dust + 3 sparks at wall impacts),
`FX.explosion` (12 additive sparks + 5 smoke + small scorch),
`FX.explosionBig` (22 + 9 + bigger scorch — rockets), `FX.trail` /
`FX.rocketTrail` (per-tick projectile trails).

## Floor decals (`G.decals`)

```js
{ x, y, r, r1, born, growT, dark }
```

Flat ellipses rendered by the raycaster onto the floor plane (projection
math in [renderer.md](renderer.md#floor-decals--blood-pools-and-scorch-marks)):

- **Growing:** `r` eases toward `r1` over `growT` seconds — corpse pools
  spread to 0.3–0.42 units in 3.5 s, which reads as "still bleeding".
- **dark** swaps the blood red for near-black — scorch marks under
  explosions.
- Cap **240** (oldest evicted). With 106 monsters in the campaign plus
  particle droplets, late levels keep a satisfying history of the fight.

## Screen splatter (`G.splats`)

Not world-space — 2D blobs on the screen (`{x, y, r, life, seed}`) drawn as
three seeded ellipses in dark red, fading over ~2 s. Spawned by
`FX.screenSplat` when a monster is **gibbed within 2.5 units** of the
player. Cheap, and the single most commented-on feature.

## Sprite baking (`js/sprites.js`)

Every sprite frame is drawn **once at startup** with Canvas 2D vector
primitives into an offscreen canvas, then fog-baked:

```js
function frame(w, h, drawFn) {
  var c = cv(w, h, drawFn);          // the visible frame
  return { c: fogVersions(c), w, h };// + 5 darkened copies
}
// fogVersions: overlay rgba(6,5,10, i/5 · 0.86) for i = 1..5
```

At render time the raycaster just indexes `frame.c[fogLevel(depth)]` — six
precomputed brightness levels, zero per-frame cost (this is why sprites fog
without `ctx.filter`, which would be far too slow per sprite).

Frame sets per monster: `walk[2]` (0.28 s/leg), `attack`, `pain`,
`die[3]` (0.14 s each, driven by `animT`), `corpse` (permanent). Imps,
elites and the baron share one drawing function with different palettes
(`genImp(pal)`); the pinky is wider (128×96 frame). A soft shadow ellipse is
baked into every frame's feet.

Items (medkit, ammo), the fireball (2 flicker frames) and the rocket are
baked the same way. One gotcha: `gen()` **publishes the cache onto the
module** (`Spr.grunt`, `Spr.medkit`, …) because `render.js` looks frames up
by string key — a cache entry that's never published is invisible to the
renderer (this bit us once; the render loop died silently on an
`undefined.c` read until the loop got its try/catch).

## Textures (`js/textures.js`)

Four 64×64 wall textures drawn with vector primitives + speckle noise:
tech panels with rivets, staggered bricks, cracked stone blocks, veined
flesh. Each gets a **dark variant** (32% black overlay) for side-shading —
N/S faces draw `light`, E/W faces draw `dark`, no runtime shading math.

## Audio (`js/audio.js`)

Everything is synthesized; there are no samples and no network.

**Graph:** `osc/noise → master gain (0.55) → compressor (−18 dB, 8:1) →
destination`. A 1-second white-noise buffer is generated once and reused by
every noise-based sound (band/low/high-pass filtered with exponential
frequency ramps).

Two builder helpers make each sound one or two lines:

```js
osc(type, f0, f1, dur, vol, when)   // pitch-swept oscillator, exp. decay
noise(dur, vol, filterType, f0, f1) // filtered noise with swept cutoff
```

Examples of the palette:

- `shotgun()` — lowpass noise 4200→320 Hz (the boom) + sine 110→50 (thump)
  + a highpass crack.
- `rifle()` — 50 ms highpass crack + square 260→105.
- `rocket()` — sine 150→55 + lowpass noise; `rocketBoom()` adds a sub
  sine 95→28.
- `growl(type, 'alert'|'pain'|'die')` — detuned sawtooth pairs with
  per-type base pitches (`growlBase`), the death variant appends a wet
  noise splat.
- Drone — two saws at 55/55.8 Hz through a lowpass whose cutoff is wobbled
  by a 0.09 Hz LFO. Very quiet (gain 0.045), starts on first game start.

**Autoplay policy:** `Snd.init()` (which creates the `AudioContext`) is
called from the first `mousedown`; `Snd.resume()` un-suspends it. Muting is
a master-gain zero, not a flag — scheduled sounds stop instantly.

Sound calls are all fire-and-forget (`Snd.shotgun()`) and internally no-op
before init or while muted, so game code never needs to check state.
