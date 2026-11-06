'use strict';
/* Monsters, projectiles and pickups. The ray below is the euclidean-distance
 * DDA used for line of sight, bullet hitscan and projectile wall tests. */

function castRay(px, py, dx, dy, maxDist) {
  var mapX = Math.floor(px), mapY = Math.floor(py);
  var ddx = Math.abs(1 / dx), ddy = Math.abs(1 / dy); // Infinity is fine
  var stepX, stepY, sdx, sdy;
  if (dx < 0) { stepX = -1; sdx = (px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
  if (dy < 0) { stepY = -1; sdy = (py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }
  var side = 0, dist = 0;
  for (var i = 0; i < 200; i++) {
    if (sdx < sdy) { dist = sdx; sdx += ddx; mapX += stepX; side = 0; }
    else { dist = sdy; sdy += ddy; mapY += stepY; side = 1; }
    if (dist > maxDist) return { dist: maxDist, hit: false };
    if (Level.wallAt(mapX, mapY) > 0) return { dist: dist, hit: true, mapX: mapX, mapY: mapY };
  }
  return { dist: maxDist, hit: false };
}

var MDEF = {
  grunt: { spr: 'grunt', hp: 30, speed: 1.7, rad: 0.28, hitR: 0.34, worldH: 0.72,
           attack: 'hitscan', range: 10, holdDist: 5, windup: 0.5, cd: [1.2, 2.0],
           dmg: [4, 9], pain: 0.7, label: 'grunt' },
  imp:   { spr: 'imp', hp: 60, speed: 2.0, rad: 0.30, hitR: 0.36, worldH: 0.78,
           attack: 'fireball', range: 11, holdDist: 3.5, windup: 0.55, cd: [1.4, 2.4],
           dmg: [10, 16], pain: 0.55, projSpeed: 5.5, label: 'imp' },
  elite: { spr: 'elite', hp: 160, speed: 2.3, rad: 0.34, hitR: 0.42, worldH: 0.98,
           attack: 'fireball', range: 13, holdDist: 4, windup: 0.6, cd: [1.1, 1.8],
           dmg: [14, 22], pain: 0.35, projSpeed: 6.5, label: 'elite' },
  pinky: { spr: 'pinky', hp: 150, speed: 3.2, rad: 0.34, hitR: 0.44, worldH: 0.75,
           attack: 'melee', range: 1.3, holdDist: 0, windup: 0.35, cd: [0.8, 1.2],
           dmg: [8, 16], pain: 0.45, label: 'pinky' },
  baron: { spr: 'baron', hp: 500, speed: 1.9, rad: 0.4, hitR: 0.5, worldH: 1.35,
           attack: 'fireball', range: 14, holdDist: 3, windup: 0.65, cd: [1.2, 1.8],
           dmg: [18, 26], pain: 0.12, projSpeed: 7, burst: 3, label: 'baron' }
};

var Ent = (function () {

  function spawn(G) {
    Level.spawns.forEach(function (s) {
      if (s.kind === 'monster') {
        var def = MDEF[s.type];
        G.monsters.push({
          type: s.type, def: def, x: s.x, y: s.y, hp: def.hp,
          state: 'idle', st: 0, animT: 0, walkT: 0, moving: false,
          cd: rand(0.3, 1.2), fired: false,
          seenX: s.x, seenY: s.y, wanderA: rand(0, TAU), wanderT: 0
        });
      } else {
        G.items.push({ kind: s.type, x: s.x, y: s.y, taken: false, seed: Math.random() * TAU });
      }
    });
    G.total = G.monsters.length;
  }

  function circleFits(x, y, r) {
    return !Level.solidAt(x - r, y - r) && !Level.solidAt(x + r, y - r) &&
           !Level.solidAt(x - r, y + r) && !Level.solidAt(x + r, y + r);
  }
  function tryMove(m, dx, dy) {
    var r = m.def.rad;
    if (circleFits(m.x + dx, m.y, r)) m.x += dx;
    if (circleFits(m.x, m.y + dy, r)) m.y += dy;
  }
  function canSee(m, px, py) {
    var dx = px - m.x, dy = py - m.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > 14 || d < 0.001) return d < 14;
    var hit = castRay(m.x, m.y, dx / d, dy / d, d);
    return !hit.hit || hit.dist >= d - 0.05;
  }

  function hurtMonster(G, m, dmg, hx, hy, sdx, sdy) {
    if (m.state === 'dead') return;
    var overkill = dmg - m.hp;
    m.hp -= dmg;
    FX.blood(G, hx, hy, 0.5, sdx, sdy, clamp(4 + dmg * 0.6, 5, 16), 1);
    if (m.state === 'idle') wake(G, m);
    if (m.hp <= 0) {
      m.state = 'dead'; m.st = 0; m.animT = 0;
      G.kills++; G.grinT = 1.3;
      Snd.growl(m.type, 'die');
      FX.blood(G, m.x, m.y, 0.55, sdx, sdy, 18, 1.5);
      FX.decal(G, m.x, m.y, 0.05, rand(0.3, 0.42), 3.5);
      if (overkill >= 30) {
        Snd.gib();
        FX.blood(G, m.x, m.y, 0.6, sdx, sdy, 26, 2.2);
        if (dist2(m.x, m.y, G.player.x, G.player.y) < 2.5 * 2.5) FX.screenSplat(G);
      }
      return;
    }
    if (Math.random() < m.def.pain) { m.state = 'pain'; m.st = 0; }
    Snd.growl(m.type, 'pain');
  }

  function wake(G, m) {
    if (m.state !== 'idle') return;
    m.state = 'chase'; m.st = 0;
    Snd.growl(m.type, 'alert');
  }

  function fireballAttack(G, m) {
    var p = G.player;
    var d = Math.sqrt(dist2(m.x, m.y, p.x, p.y)) || 0.001;
    var an = Math.atan2(p.y - m.y, p.x - m.x) + rand(-1, 1) * (0.03 + d * 0.004);
    var sp = m.def.projSpeed;
    G.projs.push({
      x: m.x + Math.cos(an) * 0.5, y: m.y + Math.sin(an) * 0.5,
      vx: Math.cos(an) * sp, vy: Math.sin(an) * sp,
      dmg: rand(m.def.dmg[0], m.def.dmg[1]),
      big: m.type === 'elite' || m.type === 'baron', t: 0
    });
    Snd.fire();
  }

  /* rocket detonation: radial damage to monsters, splash on the player */
  function explodeAt(G, x, y, dmg, radius, selfSafe) {
    FX.explosionBig(G, x, y);
    Snd.rocketBoom();
    for (var i = 0; i < G.monsters.length; i++) {
      var m = G.monsters[i];
      if (m.state === 'dead') continue;
      var d = Math.sqrt(dist2(m.x, m.y, x, y));
      if (d > radius) continue;
      var dd = Math.max(dmg * (1 - d / radius), 10);
      var an = Math.atan2(m.y - y, m.x - x);
      Ent.hurtMonster(G, m, dd, m.x, m.y, Math.cos(an), Math.sin(an));
    }
    var p = G.player;
    var pd = Math.sqrt(dist2(p.x, p.y, x, y));
    if (pd < radius + 0.4) {
      G.shake = Math.min(1, G.shake + 0.7 * (1 - pd / (radius + 0.4)));
      if (!selfSafe && !G.god && p.hp > 0) {
        G.playerDamage(Math.max(dmg * 0.55 * (1 - pd / (radius + 0.4)), 4));
      }
    }
  }

  function hitscanAttack(G, m) {
    var p = G.player;
    var d = Math.sqrt(dist2(m.x, m.y, p.x, p.y));
    Snd.pistol();
    if (Math.random() < clamp(0.85 - d * 0.055, 0.2, 0.8)) {
      G.playerDamage(rand(m.def.dmg[0], m.def.dmg[1]));
    }
  }

  function updateMonsters(G, dt) {
    var p = G.player;
    for (var i = 0; i < G.monsters.length; i++) {
      var m = G.monsters[i];
      m.st += dt;
      if (m.state === 'dead') { m.animT += dt; continue; }
      m.cd -= dt;

      if (m.state === 'pain') {
        if (m.st > 0.28) { m.state = 'chase'; m.st = 0; }
        continue;
      }

      var sees = canSee(m, p.x, p.y);
      var d = Math.sqrt(dist2(m.x, m.y, p.x, p.y));

      if (m.state === 'idle') {
        if (sees && d < 13) wake(G, m);
        continue;
      }

      if (m.state === 'attack') {
        var burst = m.def.burst || 1;
        if (m.st >= m.def.windup && !m.fired) {
          m.fired = true;
          m.burstLeft = burst - 1;
          m.nextBurst = m.def.windup + 0.16;
          if (m.def.attack === 'fireball') fireballAttack(G, m);
          else if (m.def.attack === 'hitscan') hitscanAttack(G, m);
          else if (m.def.attack === 'melee' && d < 1.7 && p.hp > 0) G.playerDamage(rand(m.def.dmg[0], m.def.dmg[1]));
        }
        // baron triples: extra fireballs in quick succession
        if (m.burstLeft > 0 && m.st >= m.nextBurst) {
          m.burstLeft--; m.nextBurst += 0.16;
          if (m.def.attack === 'fireball') fireballAttack(G, m);
        }
        if (m.st > m.def.windup + 0.3 + (burst - 1) * 0.16) {
          m.state = 'chase'; m.st = 0; m.fired = false;
          m.cd = rand(m.def.cd[0], m.def.cd[1]);
        }
        continue;
      }

      // chase
      if (sees) { m.seenX = p.x; m.seenY = p.y; m.wanderT = 0; }
      var tx = m.seenX, ty = m.seenY;
      var dSee = Math.sqrt(dist2(m.x, m.y, tx, ty));

      if (sees && d <= m.def.range && m.cd <= 0 &&
          (m.def.attack !== 'melee' ? d > 0.8 : true)) {
        m.state = 'attack'; m.st = 0; m.fired = false;
        continue;
      }

      // hold position while shooting from range
      var hold = m.def.holdDist;
      if (sees && hold > 0 && d < hold) {
        m.moving = false;
        if (m.cd <= 0) { m.state = 'attack'; m.st = 0; m.fired = false; }
        continue;
      }

      if (dSee < 0.5 && !sees) {
        // lost the trail — wander
        m.wanderT -= dt;
        if (m.wanderT <= 0) { m.wanderA = rand(0, TAU); m.wanderT = rand(0.6, 1.8); }
        tx = m.x + Math.cos(m.wanderA); ty = m.y + Math.sin(m.wanderA);
      }

      var ma = Math.atan2(ty - m.y, tx - m.x);
      var spd = m.def.speed * dt;
      var mx = Math.cos(ma) * spd, my = Math.sin(ma) * spd;
      var ox = m.x, oy = m.y;
      if (d > (m.def.attack === 'melee' ? 0.9 : 0.6) || !sees) tryMove(m, mx, my);
      // wall-hug avoidance: if fully blocked, veer
      if (Math.abs(m.x - ox) < 0.001 && Math.abs(m.y - oy) < 0.001 && (mx || my)) {
        var veer = (m.vd || (m.vd = Math.random() < 0.5 ? 1 : -1));
        var va = ma + veer * 1.1;
        tryMove(m, Math.cos(va) * spd, Math.sin(va) * spd);
      }
      m.moving = Math.abs(m.x - ox) > 0.0005 || Math.abs(m.y - oy) > 0.0005;
      if (m.moving) m.walkT += dt;
    }

    // keep monsters from stacking
    for (i = 0; i < G.monsters.length; i++) {
      var a = G.monsters[i];
      if (a.state === 'dead' || a.state === 'idle') continue;
      for (var j = i + 1; j < G.monsters.length; j++) {
        var b = G.monsters[j];
        if (b.state === 'dead') continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var rr = a.def.rad + b.def.rad;
        var d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          var d1 = Math.sqrt(d2), push = (rr - d1) / 2;
          dx /= d1; dy /= d1;
          if (circleFits(a.x - dx * push, a.y - dy * push, a.def.rad)) { a.x -= dx * push; a.y -= dy * push; }
          if (circleFits(b.x + dx * push, b.y + dy * push, b.def.rad)) { b.x += dx * push; b.y += dy * push; }
        }
      }
    }
  }

  function updateProjs(G, dt) {
    var p = G.player;
    for (var i = G.projs.length - 1; i >= 0; i--) {
      var pr = G.projs[i];
      pr.t += dt;
      var nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;

      if (pr.player) {
        // player rocket: direct monster hits, walls, splash on both
        var hit = false;
        for (var j = 0; j < G.monsters.length; j++) {
          var mo = G.monsters[j];
          if (mo.state === 'dead') continue;
          var rr = mo.def.hitR + 0.2;
          if (dist2(mo.x, mo.y, nx, ny) < rr * rr) {
            explodeAt(G, nx, ny, pr.dmg, 2.6, true);
            hit = true;
            break;
          }
        }
        if (!hit && Level.solidAt(nx, ny)) {
          explodeAt(G, pr.x, pr.y, pr.dmg, 2.6, false);
          hit = true;
        }
        if (hit) { G.projs.splice(i, 1); continue; }
        pr.x = nx; pr.y = ny;
        FX.rocketTrail(G, pr.x - pr.vx * dt * 0.4, pr.y - pr.vy * dt * 0.4);
        continue;
      }

      // monster fireball
      if (Level.solidAt(nx, ny)) {
        FX.explosion(G, pr.x, pr.y);
        Snd.boom();
        G.projs.splice(i, 1);
        continue;
      }
      pr.x = nx; pr.y = ny;
      if (Math.random() < 0.7) FX.trail(G, pr.x, pr.y);
      if (p.hp > 0 && !G.god && dist2(pr.x, pr.y, p.x, p.y) < 0.42 * 0.42) {
        G.playerDamage(pr.dmg);
        FX.explosion(G, pr.x, pr.y);
        Snd.boom();
        G.projs.splice(i, 1);
      }
    }
  }

  function updateItems(G, dt) {
    var p = G.player;
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.taken || dist2(it.x, it.y, p.x, p.y) > 0.55 * 0.55) continue;
      if (it.kind === 'medkit') {
        if (p.hp >= 100) continue;
        p.hp = Math.min(100, p.hp + 25);
        G.addMsg('Picked up a stimpack (+25)');
      } else {
        if (p.ammo >= 50 && p.rifle >= 240 && p.rockets >= 30) continue;
        p.ammo = Math.min(50, p.ammo + 4);
        p.rifle = Math.min(240, p.rifle + 20);
        p.rockets = Math.min(30, p.rockets + 2);
        G.addMsg('Picked up ammo (+4 shells, +20 rounds, +2 rockets)');
      }
      it.taken = true;
      G.pickFlash = 0.3;
      Snd.pickup();
    }
  }

  function pushFromMonsters(G) {
    var p = G.player;
    for (var i = 0; i < G.monsters.length; i++) {
      var m = G.monsters[i];
      if (m.state === 'dead') continue;
      var dx = p.x - m.x, dy = p.y - m.y;
      var rr = m.def.rad + 0.26;
      var d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.0001) {
        var d = Math.sqrt(d2);
        var push = rr - d;
        var nx = p.x + (dx / d) * push, ny = p.y + (dy / d) * push;
        if (circleFits(nx, ny, 0.26)) { p.x = nx; p.y = ny; }
      }
    }
  }

  function monsterFrame(m) {
    var set = Spr[m.def.spr];
    if (m.state === 'dead') {
      if (m.animT < 0.14) return set.die[0];
      if (m.animT < 0.3) return set.die[1];
      if (m.animT < 0.46) return set.die[2];
      return set.corpse;
    }
    if (m.state === 'pain') return set.pain;
    if (m.state === 'attack') return set.attack;
    if (m.moving) return set.walk[Math.floor(m.walkT / 0.28) % 2];
    return set.walk[0];
  }

  return { spawn: spawn, updateMonsters: updateMonsters, updateProjs: updateProjs,
           updateItems: updateItems, pushFromMonsters: pushFromMonsters,
           hurtMonster: hurtMonster, monsterFrame: monsterFrame, wake: wake,
           circleFits: circleFits };
})();
