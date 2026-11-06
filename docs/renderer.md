# Renderer — how the pseudo-3D works

`js/render.js` is a classic textured raycaster (Wolfenstein 3D / Lodev
school) with billboarded vector sprites, projected floor decals and distance
fog, all on a single 640×400 Canvas 2D context.

## World model

- The map is a top-down grid; a cell is **1×1 world unit** (see
  [level-format.md](level-format.md)). `Level.wallAt(mx, my)` returns `0` for
  floor or a wall id `1..4`.
- Walls are exactly **1 unit tall**; the camera floats at **0.5** (half wall
  height). This constant is never stored — it appears as the `0.5` terms in
  every vertical projection below.
- The player is a point `(x, y)` plus a view angle `a`.

## Camera basis

```js
dirX  = cos(a);  dirY  = sin(a);          // view direction, length 1
planeX = -dirY * 0.8; planeY = dirX * 0.8; // camera plane, length 0.8
```

The plane length **0.8** is derived from the viewport: at depth `d`, one
world unit spans `H/d` pixels vertically but `(W/2)/(0.8·d)` horizontally.
Setting them equal gives `plane = W/(2H) = 640/800 = 0.8`, so world units are
**square on screen** (walls of a 1×1 cell look as wide as tall). The
horizontal FOV is `2·atan(0.8) ≈ 77°`.

## Wall casting — one DDA per screen column

For every column `x` (640 iterations per frame):

```js
var camX = 2 * x / W - 1;                  // -1 … +1 across the screen
var rdx = dirX + planeX * camX;            // ray direction — deliberately
var rdy = dirY + planeY * camX;            // NOT normalized (see below)
```

The ray then walks the grid with the standard DDA algorithm
(`deltaDist = |1/ray|`, stepping the axis whose side-distance is smaller,
until `Level.wallAt > 0`).

**Why the ray is not normalized:** with `dir + plane·camX`, the accumulated
side-distances come out already divided by the ray's length — i.e. they are
**perpendicular distances** (distance projected onto the view direction).
That is exactly the distance you want for perspective scaling, and it makes
the result fisheye-free with no extra cos() correction:

```js
var perp = Math.max(0.02, side === 0 ? sdx - ddx : sdy - ddy);
```

Column drawing:

```js
var lineH = H / perp;                       // wall slice height in pixels
var y0 = H / 2 - lineH / 2;                 // walls are vertically centered
```

Texturing — each wall id has a pre-baked 64×64 canvas (`Tex.walls[id]`):

```js
var wallX = side === 0 ? p.y + perp * rdy : p.x + perp * rdx;  // 0..1 along the wall
var texX  = (wallX * 64) | 0;
if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = 63 - texX; // no mirrored bricks
ctx.drawImage(tex, texX, 0, 1, 64, x, y0, 1, lineH);       // 1px source column
```

Side shading is baked, not computed: each texture exists in a `light` and a
`dark` (32% black overlay) variant; N/S faces use `light`, E/W faces `dark`.
With `imageSmoothingEnabled = false` the nearest-neighbour sampling gives the
chunky retro look for free.

Every column stores its perpendicular wall distance:

```js
zbuf[x] = perp;    // Float32Array(W) — reused by sprites/decals/particles
```

## Fog

```js
fogA(d) = clamp((d - 3.5) / (17 - 3.5), 0, 1) * 0.86
```

Walls: one `fillRect(x, y0, 1, lineH)` of `rgba(6,5,10,a)` per column (skipped
when `a < 0.02`). Sprites can't be tinted that way cheaply, so their frames
are **pre-baked at 6 darkness levels** (see
[effects-and-audio.md](effects-and-audio.md#sprite-baking)) and the renderer
just picks `frame.c[fogLevel(ty)]`.

Ceiling and floor are precomputed vertical gradients (near-black at the
horizon) — there is no perspective floor casting; the illusion is completed
by decals and fog.

## Sprite casting — monsters, items, projectiles

All world sprites go through one path (`drawSprites`), sorted
**far → near** (painter's order).

### Camera-space transform

For a sprite at world `(sx, sy)`, relative to the player `(rx, ry)`:

```js
var invDet = 1 / (planeX * dirY - dirX * planeY);
var tx = invDet * ( dirY * rx - dirX * ry);   // lateral offset (screen units)
var ty = invDet * (-planeY * rx + planeX * ry); // DEPTH (perpendicular!)
if (ty < 0.25) continue;                       // behind the camera
var screenX = (W / 2) * (1 + tx / ty);
```

`ty` is directly comparable with `zbuf` values because both are perpendicular
distances — that's the whole trick of sprite occlusion.

### Size and anchoring

```js
var ppu = H / ty;                    // pixels per world unit at this depth
var sh  = worldH * ppu;              // sprite height in pixels
var sw  = sh * (frame.w / frame.h);  // width from the frame's aspect ratio
var feetY = H / 2 + ppu * 0.5;       // where the floor is at depth ty
var topY  = feetY - sh;
```

Monsters stand on the floor (`feetY` anchor). Floating things (fireballs,
rockets fly at world height 0.5) subtract an air offset:
`topY = feetY - sh - zAir * ppu` where `zAir = 0.5 - worldH/2`.

### Per-column z-clipping with run batching

A sprite may be partially hidden by a nearer wall. Testing each of its
columns against `zbuf` and drawing each visible column separately would cost
hundreds of `drawImage` calls; instead consecutive visible columns are merged
into **runs**, one `drawImage` per run, with the source rectangle scaled
proportionally:

```js
for (var x = x0; x <= x1 + 1; x++) {
  var vis = x <= x1 && zbuf[x] > ty;
  if (vis && run < 0) run = x;
  else if (!vis && run >= 0) {
    ctx.drawImage(img, (run-left)/sw*img.width, 0, (x-run)/sw*img.width,
                  img.height, run, topY, x - run, sh);
    run = -1;
  }
}
```

## Floor decals — blood pools and scorch marks

Decals are flat ellipses on the floor plane, projected with the same
transform:

```js
var floorY = H/2 + ppu * 0.5;         // floor line at the decal's depth
var rx = d.r * ppu, ry = rx * 0.45;   // 0.45 = perspective foreshortening
ctx.ellipse(sx, floorY - ry*0.4, rx, ry, ...)
```

Two subtleties:

1. **They are drawn *before* the walls**, so walls paint over them — perfect
   occlusion around corners with zero z-buffer work. (A decal nearer than a
   wall always projects *lower* on screen than that wall's base, so this
   never clips incorrectly.)
2. Distance dimming multiplies the alpha by `1 - fogA(ty)/0.86`; if the
   decal's center column fails `zbuf[mid] > ty` it is skipped entirely.

## Particles

Blood drops, wall puffs and sparks are points with a world `z` height. The
same transform gives `sx`, and the row comes from the camera height:

```js
var sy = H/2 + ppu * (0.5 - p.z);
```

One z-buffer lookup at the particle's column decides visibility. Sparks use
`globalCompositeOperation = 'lighter'` for additive glow; blood runs at
partial alpha tied to remaining life.

## Frame composition

```js
ctx.translate(shakeX, shakeY + bobY)   // screen shake + view bob
ceiling gradient | floor gradient
drawDecals                            // under walls (free occlusion)
drawWalls                             // 640 DDA columns, fills zbuf
drawSprites                           // painter's order, z-clipped runs
muzzle-flash room light               // additive radial gradient while firing
drawParticles
Weapon.draw                           // viewmodel (see weapons.md)
ctx.restore()
→ HUD.draw                            // outside the shake transform
```

## Two raycasts, one engine

There is a **second DDA** — `castRay(px, py, dx, dy, maxDist)` in
`js/entities.js` — used by line-of-sight, bullet hitscan and projectile wall
tests. It takes a **normalized** direction, so its returned distance is
*euclidean* (true along-ray distance), not perpendicular. Don't mix them up:
rendering needs perpendicular (no fisheye), gameplay needs euclidean (a
bullet travels real distance). Comparing an euclidean distance against
`zbuf` values would subtly bias results near the screen edges.

## Performance

Measured on the dev machine: **~1.4 ms/frame** with 60 particles, 60 decals
and full walls+sprites — versus a 16.6 ms budget at 60 fps. The costs are
dominated by ~640 `drawImage` wall strips + a few hundred small
`fillRect`/`drawImage` calls; nothing is allocated per frame except two
small gradients (muzzle light). If you ever need more headroom: render fewer
columns into a narrower internal buffer, or batch the fog fillRects by
merging adjacent equal-alpha columns.
