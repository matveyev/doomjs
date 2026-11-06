'use strict';
/* Node script: validates every level — row lengths, charset, spawn
 * reachability (flood fill from each player start), spawn counts. */
require('../js/level.js');

var L = globalThis.Level;
var allOk = true;
function fail(msg) { allOk = false; console.error('FAIL:', msg); }

L.MAPS.forEach(function (def, idx) {
  var map = def.map;
  var W = map[0].length, H = map.length;
  var starts = 0;

  map.forEach(function (row, y) {
    if (row.length !== W) fail('level ' + (idx + 1) + ' row ' + y + ' has length ' + row.length + ': "' + row + '"');
    for (var x = 0; x < row.length; x++) {
      if ('.#BSFsgiIphaD'.indexOf(row[x]) < 0) {
        fail('level ' + (idx + 1) + ' row ' + y + ' col ' + x + ' bad char "' + row[x] + '"');
      }
      if (row[x] === 's') starts++;
    }
  });
  if (starts !== 1) fail('level ' + (idx + 1) + ' has ' + starts + ' player starts, expected 1');

  L.load(idx);
  if (L.W !== W || L.H !== H) fail('level ' + (idx + 1) + ' grid mismatch');

  // flood fill from the start
  var seen = new Uint8Array(W * H);
  var q = [[Math.floor(L.start.x), Math.floor(L.start.y)]];
  seen[q[0][1] * W + q[0][0]] = 1;
  var reached = 0;
  while (q.length) {
    var c = q.pop();
    reached++;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = c[0] + d[0], ny = c[1] + d[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      var i = ny * W + nx;
      if (!seen[i] && L.grid[i] === 0) { seen[i] = 1; q.push([nx, ny]); }
    });
  }

  var counts = {};
  L.spawns.forEach(function (s) {
    counts[s.type] = (counts[s.type] || 0) + 1;
    var i = Math.floor(s.y) * W + Math.floor(s.x);
    if (!seen[i]) fail('level ' + (idx + 1) + ': unreachable spawn: ' + s.type + ' at ' + Math.floor(s.x) + ',' + Math.floor(s.y));
  });

  var floorCells = 0, i;
  for (i = 0; i < L.grid.length; i++) if (L.grid[i] === 0) floorCells++;
  var monsters = Object.keys(counts).filter(function (k) { return k !== 'medkit' && k !== 'ammo'; })
    .reduce(function (a, k) { return a + counts[k]; }, 0);
  console.log('level ' + (idx + 1) + ' "' + def.name + '" ' + W + 'x' + H +
    ' · floor ' + floorCells + ' (reachable ' + reached + ')' +
    ' · monsters ' + monsters + ' ' + JSON.stringify(counts));
  if (reached !== floorCells) {
    console.warn('  note: ' + (floorCells - reached) + ' floor cells not reachable');
  }
});

if (allOk) console.log('ALL LEVELS OK');
else process.exit(1);
