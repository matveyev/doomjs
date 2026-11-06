'use strict';
/* The renderer: a classic DDA raycaster at 640x400. Walls are textured with
 * baked vector textures, sprites are z-clipped per column against the wall
 * depth buffer, blood decals project onto the floor plane. */
var Render = (function () {
  var PLANE = 0.8;   // camera plane half-length (square world units at 640x400)
  var FOG_START = 3.5, FOG_END = 17, FOG_MAX = Spr.FOG_MAX;

  var ctx = null, W = 0, H = 0, zbuf = null;
  var ceilGrad = null, floorGrad = null;

  function init(canvas) {
    ctx = canvas.getContext('2d');
    W = canvas.width; H = canvas.height;
    zbuf = new Float32Array(W);
    ctx.imageSmoothingEnabled = false;
    ceilGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
    ceilGrad.addColorStop(0, '#15151d');
    ceilGrad.addColorStop(1, '#050508');
    floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
    floorGrad.addColorStop(0, '#060507');
    floorGrad.addColorStop(1, '#282025');
  }

  function fogA(d) { return clamp((d - FOG_START) / (FOG_END - FOG_START), 0, 1) * FOG_MAX; }
  function fogLevel(d) {
    return clamp(Math.round(fogA(d) / FOG_MAX * (Spr.FOG_LEVELS - 1)), 0, Spr.FOG_LEVELS - 1);
  }

  function drawWalls(G) {
    var p = G.player;
    var dirX = Math.cos(p.ang), dirY = Math.sin(p.ang);
    var planeX = -dirY * PLANE, planeY = dirX * PLANE;
    for (var x = 0; x < W; x++) {
      var camX = 2 * x / W - 1;
      var rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      var mapX = Math.floor(p.x), mapY = Math.floor(p.y);
      var ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      var stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (p.x - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - p.x) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (p.y - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - p.y) * ddy; }
      var side = 0, cell = 0;
      for (var i = 0; i < 128; i++) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
        else { sdy += ddy; mapY += stepY; side = 1; }
        cell = Level.wallAt(mapX, mapY);
        if (cell > 0) break;
      }
      var perp = Math.max(0.02, side === 0 ? sdx - ddx : sdy - ddy);
      zbuf[x] = perp;

      var lineH = H / perp;
      var y0 = H / 2 - lineH / 2;
      var wallX = side === 0 ? p.y + perp * rdy : p.x + perp * rdx;
      wallX -= Math.floor(wallX);
      var texX = (wallX * Tex.SIZE) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = Tex.SIZE - 1 - texX;
      var tex = Tex.walls[cell][side === 1 ? 'dark' : 'light'];
      ctx.drawImage(tex, texX, 0, 1, Tex.SIZE, x, y0, 1, lineH);

      var fa = fogA(perp);
      if (fa > 0.02) {
        ctx.fillStyle = 'rgba(6,5,10,' + fa.toFixed(3) + ')';
        ctx.fillRect(x, y0, 1, lineH);
      }
    }
  }

  function drawDecals(G) {
    var p = G.player;
    var dirX = Math.cos(p.ang), dirY = Math.sin(p.ang);
    var planeX = -dirY * PLANE, planeY = dirX * PLANE;
    var invDet = 1 / (planeX * dirY - dirX * planeY);
    for (var i = 0; i < G.decals.length; i++) {
      var d = G.decals[i];
      var rx = d.x - p.x, ry = d.y - p.y;
      var tx = invDet * (dirY * rx - dirX * ry);
      var ty = invDet * (-planeY * rx + planeX * ry);
      if (ty < 0.25) continue;
      var sx = (W / 2) * (1 + tx / ty);
      if (sx < -60 || sx > W + 60) continue;
      var mid = clamp(Math.round(sx), 0, W - 1);
      if (zbuf[mid] < ty) continue;
      var ppu = H / ty;
      var floorY = H / 2 + ppu * 0.5;
      var rxp = d.r * ppu, ryp = rxp * 0.45;
      var a = (d.dark ? 0.5 : 0.62) * (1 - fogA(ty) / FOG_MAX);
      if (a < 0.03) continue;
      ctx.fillStyle = d.dark ? 'rgba(20,16,14,' + a.toFixed(3) + ')' : 'rgba(118,8,12,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(sx, floorY - ryp * 0.4, rxp, ryp, 0, 0, TAU);
      ctx.fill();
    }
  }

  function drawSpriteImage(img, ty, sx, topY, sh, sw) {
    var left = sx - sw / 2;
    var x0 = Math.max(0, Math.ceil(left));
    var x1 = Math.min(W - 1, Math.floor(left + sw));
    if (x1 < x0) return;
    var run = -1;
    for (var x = x0; x <= x1 + 1; x++) {
      var vis = x <= x1 && zbuf[x] > ty;
      if (vis && run < 0) run = x;
      else if (!vis && run >= 0) {
        var dstW = x - run;
        var srcX = (run - left) / sw * img.width;
        var srcW = dstW / sw * img.width;
        ctx.drawImage(img, srcX, 0, srcW, img.height, run, topY, dstW, sh);
        run = -1;
      }
    }
  }

  function drawSprites(G) {
    var p = G.player;
    var dirX = Math.cos(p.ang), dirY = Math.sin(p.ang);
    var planeX = -dirY * PLANE, planeY = dirX * PLANE;
    var invDet = 1 / (planeX * dirY - dirX * planeY);
    var list = [];

    for (var i = 0; i < G.monsters.length; i++) {
      var m = G.monsters[i];
      list.push({ e: m, d2: dist2(m.x, m.y, p.x, p.y), kind: 'monster' });
    }
    for (i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (!it.taken) list.push({ e: it, d2: dist2(it.x, it.y, p.x, p.y), kind: 'item' });
    }
    for (i = 0; i < G.projs.length; i++) {
      var pr = G.projs[i];
      list.push({ e: pr, d2: dist2(pr.x, pr.y, p.x, p.y), kind: 'proj' });
    }
    list.sort(function (a, b) { return b.d2 - a.d2; });

    for (i = 0; i < list.length; i++) {
      var o = list[i], e = o.e;
      var rx = e.x - p.x, ry = e.y - p.y;
      var tx = invDet * (dirY * rx - dirX * ry);
      var ty = invDet * (-planeY * rx + planeX * ry);
      if (ty < 0.25) continue;
      var sx = (W / 2) * (1 + tx / ty);
      if (sx < -140 || sx > W + 140) continue;
      var ppu = H / ty;
      var fl = fogLevel(ty);
      var fr, worldH, zAir = 0;
      if (o.kind === 'monster') {
        fr = Ent.monsterFrame(e);
        worldH = e.def.worldH;
      } else if (o.kind === 'item') {
        fr = Spr[e.kind === 'medkit' ? 'medkit' : 'ammo'];
        worldH = e.kind === 'medkit' ? 0.3 : 0.26;
      } else {
        fr = Spr.fireball[Math.floor(e.t / 0.09) % 2];
        worldH = e.big ? 0.4 : 0.3;
        zAir = 0.5 - worldH / 2;
      }
      var img = fr.c[fl];
      var sh = worldH * ppu;
      var sw = sh * (fr.w / fr.h);
      var feetY = H / 2 + ppu * 0.5;
      var topY = feetY - sh - zAir * ppu;
      drawSpriteImage(img, ty, sx, topY, sh, sw);
    }
  }

  function drawParticles(G) {
    var p = G.player;
    var dirX = Math.cos(p.ang), dirY = Math.sin(p.ang);
    var planeX = -dirY * PLANE, planeY = dirX * PLANE;
    var invDet = 1 / (planeX * dirY - dirX * planeY);
    for (var i = 0; i < G.particles.length; i++) {
      var pt = G.particles[i];
      var rx = pt.x - p.x, ry = pt.y - p.y;
      var tx = invDet * (dirY * rx - dirX * ry);
      var ty = invDet * (-planeY * rx + planeX * ry);
      if (ty < 0.25) continue;
      var sx = (W / 2) * (1 + tx / ty);
      var xi = clamp(Math.round(sx), 0, W - 1);
      if (zbuf[xi] < ty) continue;
      var ppu = H / ty;
      var sy = H / 2 + ppu * (0.5 - pt.z);
      var r = Math.max(0.7, pt.r * ppu);
      var a = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.globalCompositeOperation = pt.kind === 'spark' ? 'lighter' : 'source-over';
      ctx.globalAlpha = pt.kind === 'blood' ? 0.55 + 0.45 * a : a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(G) {
    var p = G.player;
    var shx = 0, shy = 0;
    if (G.shake > 0.01) {
      var m = G.shake * 7;
      shx = rand(-m, m); shy = rand(-m, m);
    }
    var bobY = Math.abs(Math.cos(p.bobT)) * 4 * p.bobAmt;
    ctx.save();
    ctx.translate(shx | 0, (shy + bobY) | 0);

    // ceiling & floor
    ctx.fillStyle = ceilGrad; ctx.fillRect(-8, -8, W + 16, H / 2 + 8);
    ctx.fillStyle = floorGrad; ctx.fillRect(-8, H / 2, W + 16, H / 2 + 8);

    drawDecals(G);
    drawWalls(G);
    drawSprites(G);

    // muzzle flash lights up the room
    if (p.flash > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(W / 2, H * 0.7, 10, W / 2, H * 0.7, H * 0.85);
      g.addColorStop(0, 'rgba(255,190,90,' + (0.16 * p.flash) + ')');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    drawParticles(G);
    Weapon.draw(ctx, G);
    ctx.restore();
  }

  return { init: init, frame: frame };
})();
