# Modding guide — add levels, weapons, monsters

Everything here was designed to be data-driven, so most additions touch
exactly one table plus one or two hook points. Each recipe lists **every
file you must touch** — the hook points are easy to miss because there's no
framework, just globals.

After any change: `node --check js/<file>.js` for syntax,
`node tools/validate.js` for maps, then hard-refresh the page
(script URLs in `index.html` carry `?v=N` — bump `N` if your browser serves
stale code during development).

---

## Add a new level

**Files touched: `js/level.js` only.** The campaign auto-includes it —
`Level.count`, the title screen, the "NEXT: …" win text and the
next-level/final-win logic all read the `MAPS` array.

### 1. Sketch it first

On paper or in an editor, 36 columns wide (any width ≤ ~44 works; the
minap draws 3 px/cell), 25–30 rows. Mark: player start, rooms, 2-wide
doorways, pillar clusters, monster nests, pickups. A good first target is
~20 monsters.

Charset reminder (`.` floor · `#BSF` walls tech/brick/stone/flesh ·
`s` start · `g i I p D` monsters · `h a` items) — table in
[level-format.md](level-format.md#charset).

### 2. Write the rows with `R`/`rep`

Append to `MAPS` in `js/level.js`. Build every row from counted segments so
lengths are exact by construction — do **not** hand-count literal strings:

```js
{ name: 'THE CRIMSON MAZE', map: [
  rep('#', 36),                                                      // y0
  R('#', 's', rep('.', 32), '#'),                                    // start corridor
  R('#', '.', rep('F', 8), '.', rep('F', 8), '.', rep('F', 8), '.#'), // flesh pillars
  // …
  R('#', rep('.', 5), 'h', rep('.', 5), 'i', rep('.', 5), 'a', rep('.', 5),
    'i', rep('.', 5), 'h', rep('.', 5), '#'),                        // loot row
  rep('#', 36)
]},
```

Design rules that bite if broken:

- exactly **one** `s`;
- **every floor cell reachable** (flood fill will tell you);
- doorways **2 cells wide** (fattest monster radius is 0.4);
- keep some pillars — they drive occlusion, dodging and monster pathing
  fun;
- walls `F` read as "hell", `S` as "cold", `B` as "brick warm", `#` as
  "tech" — mixing 2–3 per map looks best.

### 3. Validate and iterate

```bash
node tools/validate.js
```

It prints length/charset/reachability errors with row numbers, and the
per-level monster/item census. Iterate until `ALL LEVELS OK`.

### 4. Playtest checklist

- Can you reach every medkit/ammo box? (the validator proves floor
  reachability, not *fun* reachability)
- Do ranged monsters have shooting lanes (`holdDist`) or do they beeline
  into walls?
- Difficulty: level N+1 should assume the player arrives with carried-over
  but depleted gear.

Insert position = campaign position (`MAPS` order is the level order).
`Level.count`-based logic (final level detection, HELL CLEARED screen)
adapts automatically.

---

## Add a new weapon

**Files touched: `js/weapon.js` (definition + art + dispatch), `js/main.js`
(keybind), optionally `js/audio.js` and `js/hud.js`.**

### Worked example: a CHAINGUN (fast, shared rifle ammo — the minimal path)

**1. `js/weapon.js` — definition.** Add to `DEFS` and to `ORDER`:

```js
var DEFS = {
  // …existing…
  chaingun: { cd: 0.06, pellets: 1, dmg: [5, 8], spread: 0.026, ammoKey: 'rifle',
              kick: 0.25, bloom: 0.09, label: 'CHAINGUN' }
};
var ORDER = ['pistol', 'shotgun', 'ak', 'bazooka', 'chaingun'];
```

Behaviour is already fully wired by existing code paths: `cd` = rate of
fire, `pellets`/`dmg`/`spread` feed the hitscan loop, `ammoKey: 'rifle'`
shares the AK pool (240 cap), `bloom` reuses the AK heat system — spin-up
inaccuracy for free.

**2. `js/weapon.js` — viewmodel.** Clone the simplest existing drawer
(`drawPistol`) as `drawChaingun` (a barrel cluster + spinning highlight
works), and register it in the dispatcher:

```js
function draw(ctx, G) {
  // …
  else if (G.player.weapon === 'chaingun') drawChaingun(ctx, G);
}
```

**3. `js/main.js` — keybind.** In `onKey`, alongside the other digits:

```js
if (k === 'Digit5') Weapon.switchWeapon(G, 'chaingun');
```

**4. Optional polish.**

- Sound: add `Snd.chaingun()` to `js/audio.js` (copy `rifle()` — shorter
  and higher) and call it in `tryFire`'s weapon branch.
- HUD: `js/hud.js` `drawBar` maps `ammoKey → label` (`'AK ROUNDS'`); either
  accept the shared label or switch it to read `def.label + ' AMMO'`.
- The ARMS panel and wheel cycle list `ORDER`, so they update themselves.

Done. Switch with 5, fire with everything else unchanged.

### Reference points for other weapon styles

| You want… | Copy this pattern |
|---|---|
| spread + pump animation | `shotgun` def + the `pumpOff` channel in `drawShotgun` |
| heat/bloom + jitter | `ak` def (`bloom`) + the heat terms in `drawAK` |
| a **projectile** weapon | `bazooka` branch in `tryFire` (spawns `pr.player`), flight in `Ent.updateProjs`, splash in `Ent.explodeAt` — a plasma bolt = faster rocket, small `dmg`, no splash (skip `explodeAt`, call `FX.explosion` + direct damage instead) |
| a **new ammo pool** | the full touch-list, below |

**New-ammo checklist** (e.g. `cells` for a plasma rifle):

1. `DEFS.<w>.ammoKey = 'cells'`
2. `js/main.js` `defaultLoadout()`: add the field + starting amount.
3. `js/entities.js` `updateItems`: grant + cap in the ammo-box branch.
4. `js/main.js` `nextLevel` carry object: add the field (or carry all pools
   generically).
5. `js/hud.js`: `ammoLabel` branch + display `p.cells`.

---

## Add a new monster

**Files touched: `js/entities.js` (MDEF), `js/sprites.js` (art),
`js/level.js` (map char), optionally `js/audio.js` (voice).**

### Quick path: a palette-clone (minutes) — "HELL KNIGHT"

Imps, elites and the baron are **one drawing function with different
palettes**, so a stat-variant needs no new art:

**1. `js/sprites.js`** — palette + cache entry:

```js
var palKnight = makeImpPalette('#7a6a30', '#54451c', '#ff8a2a'); // ochre body
// in gen():
knight: genImp(palKnight),
```

(Cache entries are auto-published as `Spr.knight`, which the renderer needs.)

**2. `js/entities.js`** — one MDEF row:

```js
knight: { spr: 'knight', hp: 220, speed: 2.4, rad: 0.34, hitR: 0.42,
          worldH: 1.05, attack: 'fireball', range: 12, holdDist: 3.5,
          windup: 0.5, cd: [0.9, 1.5], dmg: [12, 18], pain: 0.3,
          projSpeed: 6, burst: 2 },
```

`burst: 2` gives it a two-fireball volley (the baron's mechanic — a burst
fireball fires every 0.16 s during the attack state; recovery extends
automatically).

**3. `js/level.js`** — map character:

```js
var MONSTERS = { g: 'grunt', i: 'imp', I: 'elite', p: 'pinky', D: 'baron',
                 K: 'knight' };
```

Now paint `K` into any map. **4. Optional voice** — add a base pair to
`growlBase` in `js/audio.js`: `knight: [95, 55]`.

That's the whole monster: idle/chase/attack/pain/death, corpses, blood
pools, gib, minimap dot and the kill counter all come from the shared
machinery (see [entities.md](entities.md)).

### Full path: custom art — the frame contract

A monster's sprite set must contain: `walk` (2 frames), `attack`, `pain`,
`die` (3 frames), `corpse`. Look at `genGrunt()` for the simplest complete
example. Conventions:

- canvas **96×96** (wide monsters like the pinky use **128×96** — width
  just changes the rendered aspect);
- **feet at y ≈ 92**, shadow ellipse baked at the bottom
  (`shadow(x, cx, rx)`);
- fill the frame's height with the body — rendered height is
  `def.worldH` wall-units regardless of canvas size;
- death frames: fall via rotate-around-feet
  (`translate/rotate/translate` around (48, 92)), corpse frame faces up with
  a baked blood pool;
- add the set to `gen()`'s cache object with a key **identical to
  `MDEF.<type>.spr`** — the renderer resolves `Spr[def.spr]` by string.

### Tuning guidance

- **worldH** is visual intimidation; **hitR** is how easy it is to hit
  (bullet-cylinder radius, +0.05 slack is added per pellet);
  **rad** must stay ≤ ~0.4 or wide monsters wedge in 1-cell doors.
- **speed** 1.7–2.3 for shooters, ~3.2 for melee (player is 4.1 — melee
  must be slightly slower or it's unwinnable).
- **pain** chance is the stunlock dial: 0.7 (grunt) melts under sustained
  fire; 0.12 (baron) means it trades hits.
- **cd / windup** set the attack cadence; inaccuracy scales with distance
  inside `fireballAttack` automatically.
- A new **attack style** (e.g. a hitscan shotgunner or a spawner) means
  editing the attack state machine in `updateMonsters` — the three existing
  branches (`hitscan` / `fireball` / `melee`) show the pattern.

---

## Gotchas checklist

- Sprite cache keys must equal `MDEF.spr` **and** get published on `Spr`
  (automatic for entries in `gen()`'s cache object).
- Map charset is closed — any new letter must be added to `tools/validate.js`
  too, or validation fails.
- `Level.load` must run **before** `HUD.init` / `newGame` (the minimap and
  spawns read it) — true by boot order; only relevant if you rearrange boot.
- Distance comparisons: gameplay uses the **euclidean** `castRay`, rendering
  uses perpendicular distances (`zbuf`) — don't cross-compare
  (renderer.md § Two raycasts).
- Browsers aggressively cache classic scripts during development — bump the
  `?v=` on `<script>` tags in `index.html` (or dev with DevTools caching
  disabled).
