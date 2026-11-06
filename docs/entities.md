# Entities — monster AI, projectiles, pickups

All gameplay entities live in `js/entities.js` (namespace `Ent`) and operate
on the shared `G` state. Monsters, items and player rockets are plain object
literals — no classes, no inheritance; behaviour is driven by the `MDEF`
definition table.

## The MDEF table

One row per monster type; every field is plain data, which is what makes
adding a monster mostly declarative (see
[modding.md](modding.md#add-a-new-monster)):

```js
grunt: { spr: 'grunt',        // key into the Spr sprite cache
         hp: 30,              // hit points
         speed: 1.7,          // units/second while chasing
         rad: 0.28,           // collision radius vs walls/monsters
         hitR: 0.34,          // how fat the monster is to BULLETS
         worldH: 0.72,        // rendered height in wall-units
         attack: 'hitscan',   // 'hitscan' | 'fireball' | 'melee'
         range: 10,           // max distance to start an attack
         holdDist: 5,         // stops approaching once this close (0 = never)
         windup: 0.5,         // seconds of tell before the attack lands
         cd: [1.2, 2.0],      // cooldown range after each attack
         dmg: [4, 9],         // damage range (per shot / fireball / bite)
         pain: 0.7 }          // probability a hit interrupts into 'pain'
```

Actual values: grunt 30 hp / hitscan; imp 60 hp / fireball (speed 5.5);
elite 160 hp / fireball (speed 6.5, bigger projectile); pinky 150 hp / melee
(speed 3.2 — nearly the player's 4.1); baron 500 hp / fireball speed 7 +
`burst: 3`.

`rad` vs `hitR`: `rad` is movement collision (keeps monsters out of walls and
each other), `hitR` is the targeting cylinder bullets test against — it's
deliberately a bit larger so shots feel fair.

## Monster lifecycle

`Ent.spawn(G)` reads `Level.spawns` and creates one object per monster
letter in the map (position = cell center, `x+0.5, y+0.5`).

```
 idle ──seen/noise/hurt──► chase ──in range & LOS & cd ready──► attack*
                             ▲  │                                │
                             │  └── lost LOS ──► wander ──────────┘
                             │                     (random headings)
   damage ──p<def.pain──► pain (0.28s) ──► chase
   hp <= 0 ─────────────► dead: die frames (3×0.14s) → corpse (permanent,
                           non-blocking, rendered at the bottom of the sort)
```

\* attack sequence: `windup` seconds of tell (attack sprite frame) → the shot
lands → `0.3s + (burst-1)·0.16s` recovery → back to chase with
`cd = rand(cd[0], cd[1])`.

### Waking up

An idle monster wakes (with a growl) when any of:

- it has line of sight to the player at ≤ 14 units (`canSee`),
- the player fires any weapon within **9 units** (gunfire noise —
  `Weapon.tryFire` loops idle monsters and calls `Ent.wake`),
- it takes damage (also `Ent.wake`).

### Line of sight

```js
function canSee(m, px, py) {
  // euclidean DDA from the monster to the player (see renderer.md §Two raycasts)
  var hit = castRay(m.x, m.y, dx/d, dy/d, d);
  return !hit.hit || hit.dist >= d - 0.05;
}
```

No facing/FOV check — demons sense you through walls only via noise, but
sight is omnidirectional.

### Chase movement

- Target = the player while seen; otherwise the **last seen position**
  (`seenX/seenY`). Reaching a stale position with no LOS switches to
  *wander*: a random heading re-rolled every 0.6–1.8 s until sight is
  regained.
- Movement uses axis-separated sliding collision:
  `circleFits(x±r, y±r)` samples the four corners of the radius box against
  the grid; X and Y move independently, so gliding along walls works.
- **Wall-hug avoidance:** when a full step gets completely eaten by walls,
  the monster veers ±63° — each monster remembers its veer direction
  (`m.vd`) so it doesn't jitter.
- Ranged types stop closing at `holdDist` (grunts 5, imps 3.5, baron 3) and
  shoot from there; pinkies (holdDist 0) run all the way in to bite.
- A **separation pass** (O(n²) over ≤ 25 monsters) pushes overlapping pairs
  apart so they don't stack into one column.

### Attacks

- **hitscan** (grunt): no projectile — one `Snd.pistol()` and a probability
  roll `clamp(0.85 − dist·0.055, 0.2, 0.8)`; a hit calls
  `G.playerDamage(rand(dmg))`.
- **fireball** (imp/elite/baron): aims at the player's current position plus
  inaccuracy `±(0.03 + dist·0.004)` radians, spawns a projectile 0.5 units
  ahead of the monster at speed `def.projSpeed`. Fireballs are **dodgeable**
  by design — that's the core defense mechanic of the game.
- **melee** (pinky): damage only lands if the player is still within 1.7 at
  the end of the windup.
- **burst** (baron): after the first fireball, `burstLeft` extra fireballs
  fire every 0.16 s (`m.nextBurst` timestamps inside the attack state).

### Damage, pain and death — `Ent.hurtMonster`

Called by every player weapon with the impact point and shot direction (used
to spray blood *away* from the shooter):

1. Blood burst scaled to damage (`4 + dmg·0.6` particles, capped 16).
2. `hp -= dmg`; if still alive, a `def.pain` probability roll interrupts
   into the 0.28 s pain state (a pain-stunned monster can't attack — this is
   why the shotgun stunlock works on grunts).
3. Death: state `dead`, kill counter + face-grin timer, a 18-particle burst,
   a blood pool decal that **grows** to 0.3–0.42 units over 3.5 s. If the
   hit overkilled by ≥ 30 hp: gib — bigger burst, gib sound, and screen
   splatter if it happened within 2.5 units.

Corpses never despawn; they're skipped by AI, collision and hitscan, but
still rendered (and still receive the painter's-sort treatment).

## Projectiles — one array, two owners

`G.projs` holds monster fireballs *and* player rockets, distinguished by
`pr.player`:

| | monster fireball | player rocket |
|---|---|---|
| speed | 5.5–7 u/s | 9.5 u/s |
| hits player when | dist < 0.42 | never directly (spawns 0.55 ahead, flies away) |
| hits monsters when | never (no infighting) | dist < hitR + 0.2 → detonate |
| hits wall when | `Level.solidAt(next)` | same → detonate |
| on detonation | small `FX.explosion` | `Ent.explodeAt` splash (below) |
| trail | orange `FX.trail` ~70% of ticks | flame+smoke `FX.rocketTrail` every tick |

### `Ent.explodeAt(G, x, y, dmg, radius, selfSafe)`

Rocket ballistics: big explosion FX + `Snd.rocketBoom`, then for every living
monster within `radius` (2.6): `max(dmg·(1 − d/R), 10)` damage applied via
`hurtMonster` (direction = blast→monster, so blood flies outward). The player
takes `dmg·0.55·falloff` (min 4) unless `selfSafe` (direct monster hits) or
god mode — so point-blank rockets hurt, and rocket-jumping is possible.

## Pickups

`Ent.updateItems` checks a 0.55-unit radius against the player each tick:

- **medkit** (`h` on the map): +25 hp, only picked up below 100 hp.
- **ammo** (`a`): +4 shells / +20 rifle rounds / +2 rockets, respecting the
  50 / 240 / 30 caps; not picked up when everything is already full.

Both flash the screen, play a blip and push a message; consumed items stay in
the array with `taken: true` (skipped by the renderer and this check).
