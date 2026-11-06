'use strict';
/* Procedural wall textures — all drawn with canvas vector primitives, baked
 * once into 64x64 offscreen canvases. Each wall id gets a light and a dark
 * (side-shaded) variant. */
var Tex = (function () {
  var SIZE = 64;
  var walls = [];   // walls[id] = { light, dark, mapColor }
  var ready = false;

  function cv(w, h, fn) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    return c;
  }

  function speckle(x, n, color, alpha) {
    x.fillStyle = color; x.globalAlpha = alpha;
    for (var i = 0; i < n; i++) x.fillRect(randi(0, SIZE - 1), randi(0, SIZE - 1), 1, 1);
    x.globalAlpha = 1;
  }

  function darken(src) {
    return cv(SIZE, SIZE, function (x) {
      x.drawImage(src, 0, 0);
      x.fillStyle = 'rgba(8,8,16,0.32)';
      x.fillRect(0, 0, SIZE, SIZE);
    });
  }

  /* id 1 — tech base: metal panels, rivets, seams */
  function drawTech(x) {
    x.fillStyle = '#565e69'; x.fillRect(0, 0, SIZE, SIZE);
    // subtle vertical gradient
    var g = x.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0.13)');
    x.fillStyle = g; x.fillRect(0, 0, SIZE, SIZE);
    // horizontal seams split into two panels
    x.strokeStyle = '#343b44'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 32); x.lineTo(SIZE, 32); x.stroke();
    x.strokeStyle = '#77828f'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, 34); x.lineTo(SIZE, 34); x.stroke();
    // vertical seams
    x.strokeStyle = '#3a414b'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 32); x.moveTo(16, 32); x.lineTo(16, SIZE); x.moveTo(48, 32); x.lineTo(48, SIZE); x.stroke();
    // rivets
    x.fillStyle = '#828d9a';
    [[6, 6], [26, 6], [38, 6], [58, 6], [6, 26], [26, 26], [38, 26], [58, 26],
     [6, 38], [26, 38], [38, 38], [58, 38], [6, 58], [26, 58], [38, 58], [58, 58]].forEach(function (p) {
      x.beginPath(); x.arc(p[0], p[1], 1.6, 0, TAU); x.fill();
    });
    speckle(x, 50, '#20242a', 0.25);
    speckle(x, 24, '#7d8896', 0.2);
  }

  /* id 2 — brick: staggered red-brown bricks with mortar */
  function drawBrick(x) {
    x.fillStyle = '#2c211d'; x.fillRect(0, 0, SIZE, SIZE); // mortar
    var bh = 8, bw = 16;
    for (var row = 0; row * bh < SIZE; row++) {
      var off = (row % 2) * (bw / 2);
      for (var col = -1; col * bw < SIZE + bw; col++) {
        var bx = col * bw + off + 1, by = row * bh + 1;
        var hue = 12 + rand(-5, 6), li = 30 + rand(-5, 7);
        x.fillStyle = 'hsl(' + hue + ',42%,' + li + '%)';
        x.fillRect(bx, by, bw - 2, bh - 2);
        x.fillStyle = 'rgba(255,220,190,0.10)';
        x.fillRect(bx, by, bw - 2, 1);       // top highlight
        x.fillStyle = 'rgba(0,0,0,0.28)';
        x.fillRect(bx, by + bh - 3, bw - 2, 1); // bottom shade
      }
    }
    speckle(x, 40, '#160f0d', 0.25);
  }

  /* id 3 — stone: large cool blocks with cracks */
  function drawStone(x) {
    x.fillStyle = '#39434e'; x.fillRect(0, 0, SIZE, SIZE);
    function block(bx, by, bw, bh) {
      x.fillStyle = 'hsl(212,14%,' + (34 + rand(-4, 5)) + '%)';
      x.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      x.fillStyle = 'rgba(230,240,255,0.08)';
      x.fillRect(bx + 1, by + 1, bw - 2, 1);
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(bx + 1, by + bh - 2, bw - 2, 1);
    }
    block(0, 0, 32, 20); block(32, 0, 32, 20);
    block(0, 20, 18, 22); block(18, 20, 24, 22); block(42, 20, 22, 22);
    block(0, 42, 26, 22); block(26, 42, 38, 22);
    // cracks
    x.strokeStyle = '#20262e'; x.lineWidth = 1;
    for (var i = 0; i < 4; i++) {
      x.beginPath();
      var cx = randi(4, 60), cy = randi(4, 60);
      x.moveTo(cx, cy);
      x.lineTo(cx + randi(-10, 10), cy + randi(4, 12));
      x.lineTo(cx + randi(-14, 14), cy + randi(10, 22));
      x.stroke();
    }
    speckle(x, 46, '#171c22', 0.3);
  }

  /* id 4 — hell flesh: dark red organic mass with veins */
  function drawFlesh(x) {
    x.fillStyle = '#5c1717'; x.fillRect(0, 0, SIZE, SIZE);
    var g = x.createRadialGradient(32, 32, 4, 32, 32, 46);
    g.addColorStop(0, 'rgba(150,40,36,0.35)');
    g.addColorStop(1, 'rgba(30,4,4,0.4)');
    x.fillStyle = g; x.fillRect(0, 0, SIZE, SIZE);
    // veins
    x.strokeStyle = '#3a0d0c'; x.lineWidth = 2; x.lineCap = 'round';
    for (var i = 0; i < 5; i++) {
      x.beginPath();
      var vx = randi(0, SIZE), vy = randi(0, SIZE);
      x.moveTo(vx, vy);
      x.bezierCurveTo(vx + randi(-24, 24), vy + randi(-24, 24),
                      vx + randi(-24, 24), vy + randi(-24, 24),
                      vx + randi(-30, 30), vy + randi(-30, 30));
      x.stroke();
    }
    // bumps
    for (i = 0; i < 7; i++) {
      var bx = randi(6, 58), by = randi(6, 58), r = rand(3, 6);
      var bg = x.createRadialGradient(bx - 1, by - 1, 0, bx, by, r);
      bg.addColorStop(0, 'rgba(190,70,60,0.5)');
      bg.addColorStop(1, 'rgba(90,20,18,0)');
      x.fillStyle = bg;
      x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill();
    }
    // ribs of bone
    x.strokeStyle = 'rgba(210,190,160,0.28)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(10, 0); x.quadraticCurveTo(16, 32, 8, SIZE); x.stroke();
    x.beginPath(); x.moveTo(54, 0); x.quadraticCurveTo(48, 32, 56, SIZE); x.stroke();
    speckle(x, 40, '#2a0606', 0.35);
  }

  var MAP_COLORS = ['#000', '#69707c', '#8a5343', '#5d6b7c', '#7c2a28'];

  function gen() {
    if (ready) return;
    [drawTech, drawBrick, drawStone, drawFlesh].forEach(function (fn, i) {
      var light = cv(SIZE, SIZE, fn);
      walls[i + 1] = { light: light, dark: darken(light), mapColor: MAP_COLORS[i + 1] };
    });
    ready = true;
  }

  return { gen: gen, SIZE: SIZE, walls: walls };
})();
