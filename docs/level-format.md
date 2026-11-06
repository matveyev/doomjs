# The level system

Levels are ASCII art in `js/level.js`. One file holds all five; the campaign
is the order of the `MAPS` array.

## Charset

| char | meaning |
|---|---|
| `.` | floor |
| `#` `B` `S` `F` | walls: tech / brick / stone / flesh (ids 1–4, each with its procedural texture + minimap color) |
| `s` | player start (faces east, `ang = 0`) — exactly one per level |
| `g` `i` `I` `p` `D` | grunt / imp / elite imp / pinky / baron |
| `h` `a` | medkit (+25 hp) / ammo box (+4 shells, +20 rounds, +2 rockets) |

Anything else fails validation (see below).

Monsters and items spawn at the **cell center** (`x + 0.5, y + 0.5`), which
also keeps them clear of walls in narrow corridors.

## Map assembly

Rows can be plain strings (level 1) or built from counted segments via two
tiny helpers (levels 2, 3, 5), which makes row lengths exact by
construction:

```js
function R()  { return Array.prototype.join.call(arguments, ''); }
function rep(ch, n) { return ch.repeat(n); }

// Level 2, a room-interior row: 13 floor, divider, 13 floor
R('#', '..', 'S', rep('.', 13), 'SS', rep('.', 13), 'S', '..', '#'),
```

Recommend the `R`/`rep` style for new maps — hand-counted literals are where
almost every map bug during development came from.

## Parsing — `Level.load(idx)`

Rebuilds all `Level` state from `MAPS[idx]`:

- `grid` — `Uint8Array(W·H)`, `0` floor / `1..4` wall id. Out-of-bounds
  coordinates read as solid (`wallAt` returns 1), so rays always terminate.
- `start` — `{x, y, ang: 0}` from the `s` cell.
- `spawns` — one `{kind:'monster'|'item', type, x, y}` per letter.
- Getters `W/H/grid/start/spawns/name/idx` + `Level.count` (5).

Everything downstream reads `Level` live — the renderer, the minimap
(`HUD.buildMinimap()` re-renders its static backdrop on every `newGame`),
spawn, the validator — so switching levels is just `Level.load(i)` +
`newGame(carry)`.

## Geometry conventions

- Widths are flexible per level (all current maps are 36 wide; heights
  28–30). The minimap draws 3 px per cell at the top-right, so stay under
  ~44 columns to fit.
- **Doorways should be 2 cells wide.** A 1-cell gap is technically passable
  (player radius 0.26, fattest monster 0.4) but feels miserable in play.
- Pillars make sprite occlusion and fireball-dodging interesting; the
  courtyard levels exist because of them.

## The validator

```bash
node tools/validate.js
```

Checks **every** map: uniform row lengths, charset, exactly one `s`,
4-directional flood fill from the start (every floor cell and every spawn
must be reachable), and prints per-level monster/item counts. Exit code 1 on
any failure. Run it after any map edit — it catches the entire class of
"typo row" bugs (wrong length, stray character, spawn sealed behind a wall).

Sample output:

```
level 1 "SECTOR 7" 36x28 · floor 690 (reachable 690) · monsters 25 {grunt:9, …}
level 5 "HELLGATE" 36x30 · floor 901 (reachable 901) · monsters 20 {…, baron:1}
ALL LEVELS OK
```

## Campaign flow

`js/main.js` owns progression:

- `startGame()` — fresh run: `loadLevel(0, null)`, reset run totals.
- `nextLevel()` — on win click: accumulates `G.totKills/totTime`, snapshots
  `{hp, ammo, rifle, rockets, weapon}` from the dying level and calls
  `loadLevel(idx+1, carry)`. **Weapons and health carry downward** — finishing
  a level at 20 hp is a real problem for the next one.
- `retryLevel()` — on death click/Enter: same level index, `null` carry →
  `defaultLoadout()` (100 hp / 24 shells / 90 rounds / 6 rockets / shotgun).
- `finishRun()` — after the last level's win screen: back to the title with
  everything reset. The last-level win screen reads `G.totKills/totTime` for
  the HELL CLEARED summary.

Win condition per level: `G.kills >= G.total`, where `G.total` is set by
`Ent.spawn` from the parsed spawns — killing every monster, including the
baron, is mandatory.

## Difficulty curve of the shipped campaign

| # | Level | Theme | Monsters | New threat |
|---|---|---|---|---|
| 1 | SECTOR 7 | tech → courtyard mix | 25 | everything but the baron, gently |
| 2 | THE VAULTS | stone ring + 4 rooms | 19 | room-to-room ambushes |
| 3 | COURTYARD OF FIRE | brick cloister + arena | 17 | open-field imps + 2 elites |
| 4 | THE GAUNTLET | serpentine flesh halls | 25 | pinky swarms in corridors |
| 5 | HELLGATE | approach + grand arena | 20 | the baron (500 hp, triple burst) |
