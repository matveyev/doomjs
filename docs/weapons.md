# Weapons

All weapon logic lives in `js/weapon.js` (namespace `Weapon`). Four slots:

| # | key | cd (s) | damage | notes |
|---|---|---|---|---|
| 1 | pistol | 0.36 | 11–15 ×1 | infinite ammo, spread 0.015 |
| 2 | shotgun | 0.95 | 7–11 ×7 pellets | spread 0.09, pump animation, wake radius 9 |
| 3 | AK-47 | 0.12 | 7–10 ×1 | full auto, heat bloom, 240-round cap |
| 4 | bazooka | 1.30 | 70–95 + splash | projectile, 30-rocket cap, self-splash |

## Definitions

```js
var DEFS = {
  pistol:  { cd: 0.36, pellets: 1, dmg: [11, 15], spread: 0.015, ammoKey: null,
             kick: 0.5, label: 'PISTOL' },
  shotgun: { cd: 0.95, pellets: 7, dmg: [7, 11],  spread: 0.09,  ammoKey: 'ammo',
             kick: 1, pump: true, label: 'SHOTGUN' },
  ak:      { cd: 0.12, pellets: 1, dmg: [7, 10],  spread: 0.016, ammoKey: 'rifle',
             kick: 0.42, bloom: 0.05, label: 'AK-47' },
  bazooka: { cd: 1.3, pellets: 0, ammoKey: 'rockets',
             kick: 1.5, label: 'BAZOOKA' }
};
var ORDER = ['pistol', 'shotgun', 'ak', 'bazooka'];   // wheel / cycle order
```

- `ammoKey` names the player field consumed (`ammo` = shells, `rifle`,
  `rockets`); `null` = infinite.
- `kick` scales recoil, screenshake and the viewmodel jolt.
- `bloom` is extra spread added per unit of AK heat (below).
- `pellets: 0` marks a projectile weapon (no hitscan loop at all).

Ammo pools on `G.player`: `ammo` (shells, cap 50), `rifle` (cap 240),
`rockets` (cap 30). Defaults on a fresh run / after death: 24 / 90 / 6.

## Firing — `Weapon.tryFire(G)`

Runs from `Weapon.update` while `G.input.fire` is held (auto-fire for
everything; the per-weapon `cd` is the rate limiter):

1. **Gates:** cooldown ready, player alive. If the weapon's ammo pool is
   empty → auto-switch to the pistol with a message and a click sound (no
   dead trigger, ever).
2. **Consume + juice:** decrement ammo, set `cd`, `flash = 1`,
   `recoil = 1`, add `kick·0.5` screenshake, play the sound. The shotgun
   schedules its pump-rack sound with `setTimeout(…, 320)`.
3. **Noise:** every idle monster within 9 units wakes (`Ent.wake`) —
   gunfire is heard through walls, DOOM-style.
4. **Hitscan** (pellets > 0), per pellet:

```js
var an  = p.ang + rand(-1, 1) * spread;
var dx  = cos(an), dy = sin(an);
var wallD = castRay(p.x, p.y, dx, dy, 20).dist;   // euclidean, see renderer.md
// nearest monster whose along-ray distance t is within (0.15, wallD)
// AND lateral offset |−rx·dy + ry·dx| < hitR + 0.05:
//     hit → Ent.hurtMonster(dmg, impact point, shot direction)
//     miss but wall hit → FX.puff at wallD − 0.03 (sparks + dust)
```

The `hitR + 0.05` lateral slack is per-pellet aim forgiveness; `t > 0.15`
stops the gun clipping monsters you're standing inside of.

5. **Projectile** (bazooka): spawn
   `{ x: p + dir·0.55, vx: dir·9.5, player: true, dmg: rand(70, 95) }` into
   `G.projs` — flight and detonation are handled by `Ent.updateProjs` /
   `Ent.explodeAt` (see [entities.md](entities.md#projectiles—one-array-two-owners)).

## AK-47 heat model

- Each shot: `p.akHeat += 0.14` (clamped to 1).
- Passive cooling: `−0.75/s` in `Weapon.update`.
- Effective spread: `0.016 + akHeat · 0.05` — about 4× looser when hot.
- The viewmodel mirrors it: the rifle jitters
  (`sin(t·47)·heat` px), climbs (`−heat·12` px) and the crosshair gap widens.

Burst discipline is real: ~7 shots to full heat, roughly a second of
sustained fire before accuracy falls apart.

## Viewmodels

Each weapon is a hand-written Canvas drawing function (`drawPistol`,
`drawShotgun`, `drawAK`, `drawBazooka`) sharing a common pattern:

- anchored bottom-center-right of the screen (above the HUD bar),
- **bob**: `sin(bobT)·7` px lateral, `|cos(bobT)|·5` vertical, scaled by
  `bobAmt` (movement blend), phase advanced at 10 Hz while moving,
- **recoil transform**: `translate + rotate` driven by `p.recoil` (decays at
  5/s) scaled by `def.kick`,
- special animation channels: shotgun pump slide
  (`sin(phase·π)·24` px between 0.3–0.65 s after firing), AK chatter jitter,
- **muzzle flash**: `drawFlash()` paints an additive
  (`globalCompositeOperation = 'lighter'`) radial gradient plus 5 random
  spikes at the barrel tip while `p.flash > 0` (decays at 9/s ≈ 110 ms).

Weapon switching (`Weapon.switchWeapon`) resets the flash, plays a click and
imposes a 0.25 s minimum cooldown; the mouse wheel cycles `ORDER`.

The HUD reads the same defs: the ARMS panel lists `ORDER`, the ammo counter
shows `p[def.ammoKey]` (or ∞) with a per-`ammoKey` label.
