'use strict';
/* Gore: 3D blood particles with gravity that leave permanent floor decals,
 * wall puffs, sparks, and screen-space splatter when kills happen up close. */
var FX = (function () {
  var MAX_PARTICLES = 320, MAX_DECALS = 240;
  var BLOOD_COLORS = ['#a00e0e', '#c11616', '#7a0a0a', '#d42222'];

  function blood(G, x, y, z, dx, dy, count, power) {
    for (var i = 0; i < count; i++) {
      if (G.particles.length >= MAX_PARTICLES) G.particles.shift();
      var sp = rand(0.4, 1) * power;
      var an = Math.atan2(dy, dx) + rand(-1.2, 1.2);
      G.particles.push({
        x: x, y: y, z: z + rand(-0.05, 0.12),
        vx: Math.cos(an) * sp * rand(0.6, 2.4),
        vy: Math.sin(an) * sp * rand(0.6, 2.4),
        vz: rand(0.4, 1) * power * rand(1.2, 3.2),
        r: rand(0.018, 0.05),
        life: rand(0.7, 1.4), maxLife: 1.4,
        color: pick(BLOOD_COLORS), kind: 'blood'
      });
    }
  }

  function puff(G, x, y, z) {
    for (var i = 0; i < 7; i++) {
      G.particles.push({
        x: x, y: y, z: z + rand(-0.08, 0.08),
        vx: rand(-0.7, 0.7), vy: rand(-0.7, 0.7), vz: rand(0.2, 1.1),
        r: rand(0.02, 0.045), life: rand(0.3, 0.6), maxLife: 0.6,
        color: '#9a978c', kind: 'puff'
      });
    }
    for (i = 0; i < 3; i++) {
      G.particles.push({
        x: x, y: y, z: z,
        vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(0.5, 2),
        r: 0.015, life: 0.25, maxLife: 0.25,
        color: '#ffc766', kind: 'spark'
      });
    }
  }

  function explosion(G, x, y) {
    for (var i = 0; i < 12; i++) {
      G.particles.push({
        x: x, y: y, z: 0.5 + rand(-0.1, 0.1),
        vx: rand(-2.4, 2.4), vy: rand(-2.4, 2.4), vz: rand(0.3, 2.4),
        r: rand(0.03, 0.07), life: rand(0.2, 0.45), maxLife: 0.45,
        color: pick(['#ffb040', '#ff8020', '#ffe0a0']), kind: 'spark'
      });
    }
    for (i = 0; i < 5; i++) {
      G.particles.push({
        x: x, y: y, z: 0.5 + rand(-0.05, 0.05),
        vx: rand(-0.8, 0.8), vy: rand(-0.8, 0.8), vz: rand(0.4, 1.2),
        r: rand(0.05, 0.09), life: rand(0.5, 0.9), maxLife: 0.9,
        color: '#555049', kind: 'puff'
      });
    }
    decal(G, x, y, 0.07, 0.12, 0.4, true);   // scorch mark
  }

  function trail(G, x, y) {
    G.particles.push({
      x: x + rand(-0.05, 0.05), y: y + rand(-0.05, 0.05), z: 0.5 + rand(-0.06, 0.06),
      vx: 0, vy: 0, vz: rand(0.1, 0.4),
      r: rand(0.02, 0.045), life: 0.3, maxLife: 0.3,
      color: '#ff9a3a', kind: 'spark'
    });
  }

  function explosionBig(G, x, y) {
    for (var i = 0; i < 22; i++) {
      G.particles.push({
        x: x, y: y, z: 0.5 + rand(-0.15, 0.2),
        vx: rand(-3.6, 3.6), vy: rand(-3.6, 3.6), vz: rand(0.4, 3.4),
        r: rand(0.04, 0.1), life: rand(0.25, 0.55), maxLife: 0.55,
        color: pick(['#ffb040', '#ff8020', '#ffe0a0', '#ff5a10']), kind: 'spark'
      });
    }
    for (i = 0; i < 9; i++) {
      G.particles.push({
        x: x, y: y, z: 0.5 + rand(-0.1, 0.1),
        vx: rand(-1.2, 1.2), vy: rand(-1.2, 1.2), vz: rand(0.5, 1.8),
        r: rand(0.07, 0.13), life: rand(0.6, 1.1), maxLife: 1.1,
        color: '#555049', kind: 'puff'
      });
    }
    decal(G, x, y, 0.1, rand(0.28, 0.38), 0.5, true);
  }

  function rocketTrail(G, x, y) {
    G.particles.push({
      x: x + rand(-0.04, 0.04), y: y + rand(-0.04, 0.04), z: 0.5 + rand(-0.04, 0.04),
      vx: 0, vy: 0, vz: rand(0, 0.2),
      r: rand(0.02, 0.05), life: 0.35, maxLife: 0.35,
      color: pick(['#ffb050', '#ff8028', '#c8c8c0']), kind: 'spark'
    });
  }

  function decal(G, x, y, r0, r1, growT, dark) {
    if (G.decals.length >= MAX_DECALS) G.decals.shift();
    G.decals.push({ x: x, y: y, r: r0, r1: r1, born: G.t, growT: growT, dark: !!dark });
  }

  function screenSplat(G) {
    for (var i = 0; i < 3; i++) {
      G.splats.push({
        x: rand(0.15, 0.85) * G.W, y: rand(0.1, 0.7) * G.H,
        r: rand(14, 44), life: rand(1.6, 2.4), maxLife: 2.4,
        seed: Math.random() * TAU
      });
    }
  }

  function update(G, dt) {
    var ps = G.particles;
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.life -= dt;
      p.vz -= (p.kind === 'spark' ? 2.5 : 6.5) * dt;
      var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (Level.solidAt(nx, ny)) { ps.splice(i, 1); continue; }   // splats on the wall vanish
      p.x = nx; p.y = ny; p.z += p.vz * dt;
      if (p.z <= 0) {
        if (p.kind === 'blood' && Math.random() < 0.6) {
          decal(G, p.x, p.y, 0.02, rand(0.04, 0.12), 0.3);
        }
        ps.splice(i, 1); continue;
      }
      if (p.life <= 0) ps.splice(i, 1);
    }
    var ds = G.decals;
    for (i = ds.length - 1; i >= 0; i--) {
      var d = ds[i];
      if (d.r < d.r1) d.r = Math.min(d.r1, d.r + (d.r1 - d.r) * clamp(dt / Math.max(0.001, d.growT), 0, 1));
    }
    var ss = G.splats;
    for (i = ss.length - 1; i >= 0; i--) {
      ss[i].life -= dt;
      if (ss[i].life <= 0) ss.splice(i, 1);
    }
  }

  return { blood: blood, puff: puff, explosion: explosion, explosionBig: explosionBig,
           trail: trail, rocketTrail: rocketTrail,
           decal: decal, screenSplat: screenSplat, update: update };
})();
