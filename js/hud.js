'use strict';
/* HUD: DOOM-style status bar with a reactive marine face, live minimap,
 * message feed, crosshair, screen blood, and the title/death/win screens. */
var HUD = (function () {
  var BAR_H = 76;
  var mmStatic = null, MM_CELL = 3;

  function init() { buildMinimap(); }
  function buildMinimap() {
    // static minimap backdrop for the CURRENT level (rebuilt on level change)
    var w = Level.W * MM_CELL, h = Level.H * MM_CELL;
    mmStatic = document.createElement('canvas');
    mmStatic.width = w; mmStatic.height = h;
    var x = mmStatic.getContext('2d');
    for (var my = 0; my < Level.H; my++) {
      for (var mx = 0; mx < Level.W; mx++) {
        var cell = Level.grid[my * Level.W + mx];
        if (cell > 0) {
          x.fillStyle = Tex.walls[cell].mapColor;
          x.fillRect(mx * MM_CELL, my * MM_CELL, MM_CELL, MM_CELL);
        }
      }
    }
  }

  function mono(size, bold) {
    return (bold ? '900 ' : '') + size + 'px "Courier New", monospace';
  }

  /* --- the marine face: health bands + pain/grin/dead expressions --- */
  function drawFace(x, cx, cy, s, hp, expr) {
    var skin = hp > 70 ? '#c9a077' : hp > 40 ? '#bf946c' : '#b2865c';
    var dead = expr === 'dead';
    if (dead) skin = '#a5806a';
    // shoulders / armor
    x.fillStyle = '#3f5a43';
    x.beginPath();
    x.moveTo(cx - s * 0.72, cy + s * 0.74);
    x.lineTo(cx + s * 0.72, cy + s * 0.74);
    x.lineTo(cx + s * 0.5, cy + s * 0.34);
    x.lineTo(cx - s * 0.5, cy + s * 0.34);
    x.closePath(); x.fill();
    x.fillStyle = '#2c4030';
    x.fillRect(cx - s * 0.16, cy + s * 0.36, s * 0.32, s * 0.1);
    // neck
    x.fillStyle = dead ? '#8a6a58' : '#a8825f';
    x.fillRect(cx - s * 0.14, cy + s * 0.14, s * 0.28, s * 0.26);
    // ears
    x.fillStyle = skin;
    x.beginPath(); x.ellipse(cx - s * 0.4, cy, s * 0.06, s * 0.1, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(cx + s * 0.4, cy, s * 0.06, s * 0.1, 0, 0, TAU); x.fill();
    // head
    x.beginPath(); x.ellipse(cx, cy, s * 0.4, s * 0.5, 0, 0, TAU); x.fill();
    x.strokeStyle = '#5a4330'; x.lineWidth = 1.4; x.stroke();
    // buzz cut
    x.fillStyle = dead ? '#54402a' : '#6b4f33';
    x.beginPath(); x.ellipse(cx, cy - s * 0.3, s * 0.4, s * 0.2, 0, Math.PI, 0); x.fill();
    x.fillRect(cx - s * 0.4, cy - s * 0.32, s * 0.07, s * 0.2);
    x.fillRect(cx + s * 0.33, cy - s * 0.32, s * 0.07, s * 0.2);
    var ey = cy - s * 0.08, ex = s * 0.16;
    if (dead) {
      // X eyes
      x.strokeStyle = '#7c1010'; x.lineWidth = 2.2;
      [[-1, 0], [1, 0]].forEach(function (e) {
        var ecx = cx + e[0] * ex;
        x.beginPath();
        x.moveTo(ecx - 4, ey - 4); x.lineTo(ecx + 4, ey + 4);
        x.moveTo(ecx + 4, ey - 4); x.lineTo(ecx - 4, ey + 4);
        x.stroke();
      });
    } else if (expr === 'pain') {
      // eyes squeezed shut
      x.strokeStyle = '#3a2a1c'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(cx - ex - 4, ey); x.quadraticCurveTo(cx - ex, ey + 3, cx - ex + 4, ey); x.stroke();
      x.beginPath(); x.moveTo(cx + ex - 4, ey); x.quadraticCurveTo(cx + ex, ey + 3, cx + ex + 4, ey); x.stroke();
    } else {
      x.fillStyle = '#efe9dc';
      x.beginPath(); x.ellipse(cx - ex, ey, s * 0.09, s * 0.06, 0, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(cx + ex, ey, s * 0.09, s * 0.06, 0, 0, TAU); x.fill();
      x.fillStyle = '#23301f';
      x.beginPath(); x.arc(cx - ex + 1, ey, s * 0.035, 0, TAU); x.fill();
      x.beginPath(); x.arc(cx + ex + 1, ey, s * 0.035, 0, TAU); x.fill();
    }
    // angry brows — angrier as health drops, raised in pain
    var tilt = expr === 'pain' ? -0.5 : 0.12 + (1 - hp / 100) * 0.35;
    x.strokeStyle = '#4a3620'; x.lineWidth = 2.6; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx - ex - 6, ey - 8 + tilt * -6); x.lineTo(cx - ex + 5, ey - 8 + tilt * 8); x.stroke();
    x.beginPath(); x.moveTo(cx + ex + 6, ey - 8 + tilt * -6); x.lineTo(cx + ex - 5, ey - 8 + tilt * 8); x.stroke();
    // nose
    x.strokeStyle = '#8a6a4a'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(cx, ey + 2); x.lineTo(cx - 1, cy + s * 0.08); x.stroke();
    // mouth
    var my = cy + s * 0.26;
    x.strokeStyle = '#5a3020'; x.lineWidth = 2;
    if (dead) {
      x.fillStyle = '#3a1410';
      x.beginPath(); x.ellipse(cx, my, s * 0.1, s * 0.07, 0, 0, TAU); x.fill();
      x.fillStyle = '#8a1010';
      x.fillRect(cx + s * 0.06, my, 2.5, s * 0.14);   // blood from the mouth
    } else if (expr === 'pain') {
      x.fillStyle = '#3a1410';
      x.beginPath(); x.ellipse(cx, my, s * 0.09, s * 0.08, 0, 0, TAU); x.fill();
    } else if (expr === 'grin') {
      x.fillStyle = '#efe9dc';
      x.beginPath(); x.moveTo(cx - s * 0.16, my - 3); x.lineTo(cx + s * 0.16, my - 3);
      x.lineTo(cx + s * 0.1, my + 6); x.lineTo(cx - s * 0.1, my + 6);
      x.closePath(); x.fill();
      x.strokeStyle = '#5a3020'; x.stroke();
    } else if (hp < 40) {
      x.fillStyle = '#3a1410';
      x.beginPath(); x.ellipse(cx, my, s * 0.08, s * 0.05, 0, 0, TAU); x.fill();
      x.fillStyle = '#efe9dc';
      x.fillRect(cx - s * 0.07, my - 3, s * 0.14, 2.5);
    } else {
      x.beginPath(); x.moveTo(cx - s * 0.12, my); x.lineTo(cx + s * 0.12, my - (hp > 70 ? 2 : 0)); x.stroke();
    }
    // blood damage tiers
    x.strokeStyle = '#a01212'; x.lineWidth = 2.4; x.lineCap = 'round';
    if (hp < 80 || dead) {
      x.beginPath(); x.moveTo(cx - s * 0.18, cy - s * 0.42); x.lineTo(cx - s * 0.16, cy - s * 0.1); x.stroke();
    }
    if (hp < 60 || dead) {
      x.beginPath(); x.moveTo(cx + s * 0.22, cy - s * 0.46); x.lineTo(cx + s * 0.26, cy + s * 0.02); x.stroke();
      x.beginPath(); x.moveTo(cx - s * 0.34, cy + s * 0.05); x.lineTo(cx - s * 0.3, cy + s * 0.2); x.stroke();
    }
    if (hp < 35 || dead) {
      x.lineWidth = 3.4;
      x.beginPath(); x.moveTo(cx + s * 0.05, cy - s * 0.5); x.lineTo(cx - s * 0.02, cy - s * 0.05); x.stroke();
      x.fillStyle = 'rgba(120,16,16,0.45)';
      x.beginPath(); x.ellipse(cx - ex, ey, s * 0.13, s * 0.08, 0, 0, TAU); x.fill();
    }
  }

  function drawBar(x, G) {
    var p = G.player;
    var y0 = G.H - BAR_H;
    var g = x.createLinearGradient(0, y0, 0, G.H);
    g.addColorStop(0, '#2c2c35'); g.addColorStop(1, '#14141a');
    x.fillStyle = g; x.fillRect(0, y0, G.W, BAR_H);
    x.fillStyle = '#4a4a58'; x.fillRect(0, y0, G.W, 2);
    x.fillStyle = '#1d1d25';
    [6, G.W - 9].forEach(function (bx) {
      [y0 + 6, G.H - 9].forEach(function (by) { x.fillRect(bx, by, 3, 3); });
    });

    // KILLS
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#8a8a98'; x.font = mono(10); x.textAlign = 'left';
    x.fillText('KILLS', 14, y0 + 18);
    x.fillStyle = '#ff5a4a'; x.font = mono(26, true);
    x.fillText(G.kills + '/' + G.total, 14, y0 + 46);

    // AMMO (of the current weapon)
    var def = Weapon.DEFS[p.weapon];
    x.fillStyle = '#8a8a98'; x.font = mono(10); x.textAlign = 'left';
    var ammoLabel = def.ammoKey === 'rifle' ? 'AK ROUNDS' :
                    def.ammoKey === 'ammo' ? 'SHELLS' :
                    def.ammoKey === 'rockets' ? 'ROCKETS' : 'AMMO';
    x.fillText(ammoLabel, 108, y0 + 18);
    x.fillStyle = '#ffd23a'; x.font = mono(26, true);
    x.fillText(def.ammoKey ? String(p[def.ammoKey]) : '∞', 108, y0 + 46);

    // face panel
    x.fillStyle = '#101014'; x.fillRect(G.W / 2 - 52, y0 + 6, 104, BAR_H - 12);
    x.strokeStyle = '#3a3a46'; x.lineWidth = 2; x.strokeRect(G.W / 2 - 52, y0 + 6, 104, BAR_H - 12);
    var expr = p.hp <= 0 ? 'dead' : G.painT > 0 ? 'pain' : G.grinT > 0 ? 'grin' : 'idle';
    drawFace(x, G.W / 2, y0 + 40, 52, p.hp, expr);

    // HEALTH
    x.fillStyle = '#8a8a98'; x.font = mono(10); x.textAlign = 'left';
    x.fillText('HEALTH', 376, y0 + 18);
    x.fillStyle = p.hp > 60 ? '#6ad24a' : p.hp > 30 ? '#ffd23a' : '#ff4a3a';
    x.font = mono(26, true);
    x.fillText(Math.round(p.hp) + '%', 376, y0 + 46);

    // ARMS
    x.fillStyle = '#8a8a98'; x.font = mono(10); x.textAlign = 'left';
    x.fillText('ARMS', 480, y0 + 16);
    x.font = mono(12, true);
    Weapon.ORDER.forEach(function (w, i) {
      var cur = p.weapon === w;
      x.fillStyle = cur ? '#ffd23a' : '#63636f';
      x.fillText((i + 1) + ' ' + Weapon.DEFS[w].label, 480, y0 + 31 + i * 14);
    });
  }

  function drawMinimap(x, G) {
    var p = G.player;
    var w = Level.W * MM_CELL, h = Level.H * MM_CELL;
    var ox = G.W - w - 8, oy = 8;
    x.fillStyle = 'rgba(8,8,14,0.62)';
    x.fillRect(ox - 3, oy - 3, w + 6, h + 6);
    x.drawImage(mmStatic, ox, oy);
    x.strokeStyle = 'rgba(90,90,110,0.7)'; x.lineWidth = 1;
    x.strokeRect(ox - 3.5, oy - 3.5, w + 7, h + 7);
    G.items.forEach(function (it) {
      if (it.taken) return;
      x.fillStyle = '#ffd23a';
      x.fillRect(ox + it.x * MM_CELL - 1.5, oy + it.y * MM_CELL - 1.5, 3, 3);
    });
    G.monsters.forEach(function (m) {
      if (m.state === 'dead') {
        x.fillStyle = 'rgba(120,120,120,0.5)';
      } else if (m.state === 'idle') {
        x.fillStyle = 'rgba(200,60,50,0.45)';
      } else {
        x.fillStyle = '#ff3a2a';
      }
      x.fillRect(ox + m.x * MM_CELL - 1.5, oy + m.y * MM_CELL - 1.5, 3, 3);
    });
    // player arrow
    x.save();
    x.translate(ox + p.x * MM_CELL, oy + p.y * MM_CELL);
    x.rotate(p.ang);
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(4, 0); x.lineTo(-3, -2.6); x.lineTo(-3, 2.6); x.closePath(); x.fill();
    x.restore();
  }

  function drawOverlayText(x, G, main, mainColor, sub, prompt) {
    x.textAlign = 'center';
    x.fillStyle = 'rgba(0,0,0,0.75)';
    x.font = mono(64, true);
    x.fillText(main, G.W / 2 + 3, G.H / 2 - 30 + 3);
    x.fillStyle = mainColor;
    x.fillText(main, G.W / 2, G.H / 2 - 30);
    x.font = mono(14);
    x.fillStyle = '#cfcfda';
    sub.forEach(function (line, i) {
      x.fillText(line, G.W / 2, G.H / 2 + 6 + i * 20);
    });
    x.font = mono(16, true);
    x.fillStyle = 'rgba(255,210,58,' + (0.55 + 0.45 * Math.sin(G.t * 4.5)) + ')';
    x.fillText(prompt, G.W / 2, G.H / 2 + 6 + sub.length * 20 + 28);
    x.textAlign = 'left';
  }

  function drawTitle(x, G) {
    x.fillStyle = 'rgba(4,3,7,0.68)';
    x.fillRect(0, 0, G.W, G.H);
    var cy = 108;
    x.textAlign = 'center';
    x.font = '900 78px Impact, "Arial Black", sans-serif';
    var g = x.createLinearGradient(0, cy - 60, 0, cy + 12);
    g.addColorStop(0, '#8a1210'); g.addColorStop(0.55, '#e03020'); g.addColorStop(1, '#ff8a30');
    x.fillStyle = 'rgba(0,0,0,0.8)';
    x.fillText('DOOM.js', G.W / 2 + 4, cy + 5);
    x.fillStyle = g;
    x.fillText('DOOM.js', G.W / 2, cy);
    x.strokeStyle = '#1a0505'; x.lineWidth = 2;
    x.strokeText('DOOM.js', G.W / 2, cy);
    x.font = mono(13);
    x.fillStyle = '#9a9aa8';
    x.fillText('A TINY VECTOR RAYCASTER — DEMONS · SHOTGUN · AK-47 · BAZOOKA', G.W / 2, cy + 34);
    x.fillStyle = '#cfcfda';
    x.font = mono(14);
    ['WASD move · MOUSE aim · CLICK / CTRL fire',
     '1 pistol · 2 shotgun · 3 AK-47 · 4 bazooka · wheel cycles',
     'TAB map · M mute · ESC pause'].forEach(function (line, i) {
      x.fillText(line, G.W / 2, cy + 78 + i * 22);
    });
    x.fillStyle = '#ff5a4a';
    x.fillText(Level.count + ' levels · ' + G.total + ' demons in Level 1: ' + Level.name, G.W / 2, cy + 160);
    x.font = mono(20, true);
    x.fillStyle = 'rgba(255,210,58,' + (0.55 + 0.45 * Math.sin(G.t * 4)) + ')';
    x.fillText('CLICK TO ENTER HELL', G.W / 2, cy + 202);
    x.textAlign = 'left';
  }

  function draw(ctx, G) {
    var p = G.player;

    if (G.state === 'title') { drawTitle(ctx, G); return; }

    // ---- in-world overlays ----
    // screen blood splatter
    G.splats.forEach(function (s) {
      var a = clamp(s.life / s.maxLife, 0, 1) * 0.7;
      ctx.fillStyle = 'rgba(150,10,16,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.8, s.seed, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s.x + s.r * 0.7, s.y + s.r * 0.4, s.r * 0.4, s.r * 0.3, s.seed + 1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s.x - s.r * 0.6, s.y - s.r * 0.5, s.r * 0.3, s.r * 0.25, s.seed + 2, 0, TAU); ctx.fill();
    });

    if (G.state === 'play' || G.state === 'pause' || G.state === 'win' || G.state === 'dead') {
      // damage / pickup flashes
      if (G.dmgFlash > 0.01) {
        ctx.fillStyle = 'rgba(255,32,20,' + (G.dmgFlash * 0.4).toFixed(3) + ')';
        ctx.fillRect(0, 0, G.W, G.H);
      }
      if (G.pickFlash > 0.01) {
        ctx.fillStyle = 'rgba(255,220,120,' + (G.pickFlash * 0.22).toFixed(3) + ')';
        ctx.fillRect(0, 0, G.W, G.H);
      }
      // low-health pulse
      if (p.hp > 0 && p.hp < 35) {
        ctx.fillStyle = 'rgba(255,16,8,' + (0.06 + 0.05 * Math.sin(G.t * 6)).toFixed(3) + ')';
        ctx.fillRect(0, 0, G.W, G.H);
      }
      // message feed
      ctx.font = mono(12, true);
      G.msgs.forEach(function (m, i) {
        ctx.fillStyle = 'rgba(255,210,58,' + clamp(m.t / 0.7, 0, 1).toFixed(3) + ')';
        ctx.fillText(m.text, 12, 22 + i * 16);
      });
      // crosshair
      if (G.state === 'play' || G.state === 'pause') {
        var c = G.W / 2, cyy = G.H / 2;
        var gap = 4 + p.akHeat * 5 + (p.flash > 0 ? 3 : 0);
        ctx.strokeStyle = 'rgba(235,235,245,0.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(c - gap - 5, cyy); ctx.lineTo(c - gap, cyy);
        ctx.moveTo(c + gap, cyy); ctx.lineTo(c + gap + 5, cyy);
        ctx.moveTo(c, cyy - gap - 5); ctx.lineTo(c, cyy - gap);
        ctx.moveTo(c, cyy + gap); ctx.lineTo(c, cyy + gap + 5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(235,235,245,0.9)';
        ctx.fillRect(c - 0.7, cyy - 0.7, 1.4, 1.4);
      }
      drawBar(ctx, G);
      if (G.showMap) drawMinimap(ctx, G);
    }

    if (G.state === 'pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, G.W, G.H);
      drawOverlayText(ctx, G, 'PAUSED', '#cfcfda', [], 'CLICK TO RESUME');
    } else if (G.state === 'dead') {
      ctx.fillStyle = 'rgba(46,0,0,0.5)';
      ctx.fillRect(0, 0, G.W, G.H);
      drawOverlayText(ctx, G, 'YOU DIED', '#ff3a2a',
        ['Demons slain: ' + G.kills + ' / ' + G.total],
        'CLICK OR PRESS ENTER TO RISE AGAIN');
    } else if (G.state === 'win') {
      ctx.fillStyle = 'rgba(10,8,2,0.55)';
      ctx.fillRect(0, 0, G.W, G.H);
      var mm = Math.floor(G.playT / 60), ss = Math.floor(G.playT % 60);
      var acc = G.shots ? Math.round(100 * G.hits / G.shots) : 0;
      var last = G.levelIdx >= Level.count - 1;
      if (last) {
        var tm = Math.floor(G.totTime / 60), ts = Math.floor(G.totTime % 60);
        drawOverlayText(ctx, G, 'HELL CLEARED', '#ffcf3a',
          ['You slaughtered ' + G.totKills + ' demons through all ' + Level.count + ' levels' +
           ' in ' + tm + ':' + (ts < 10 ? '0' : '') + ts,
           'Final level: ' + G.kills + '/' + G.total + ' · Accuracy ' + acc + '%'],
          'CLICK TO PLAY AGAIN');
      } else {
        drawOverlayText(ctx, G, 'AREA CLEARED', '#ffcf3a',
          ['Level ' + (G.levelIdx + 1) + ' · ' + Level.name + ' — Time ' + mm + ':' + (ss < 10 ? '0' : '') + ss +
           ' · Kills ' + G.kills + '/' + G.total + ' · Accuracy ' + acc + '%',
           'Next: ' + (G.levelIdx + 2) + ' · ' + Level.MAPS[G.levelIdx + 1].name],
          'CLICK TO DESCEND DEEPER');
      }
    }
  }

  return { init: init, buildMinimap: buildMinimap, draw: draw, BAR_H: BAR_H };
})();
