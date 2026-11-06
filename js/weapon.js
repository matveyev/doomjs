'use strict';
/* Weapons: 1 pistol (infinite), 2 shotgun (7 pellets, pump), 3 AK-47 (full auto,
 * heat bloom). All hitscan; pellets check monsters against the wall distance. */
var Weapon = (function () {
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
  var ORDER = ['pistol', 'shotgun', 'ak', 'bazooka'];

  function tryFire(G) {
    var p = G.player;
    var def = DEFS[p.weapon];
    if (p.cd > 0 || p.hp <= 0) return;
    if (def.ammoKey && p[def.ammoKey] <= 0) {
      G.addMsg('Out of ammo — switching to pistol');
      p.weapon = 'pistol';
      Snd.click();
      return;
    }
    if (def.ammoKey) p[def.ammoKey]--;
    p.cd = def.cd; p.flash = 1; p.recoil = 1; p.pumpT = 0;
    p.recoilK = def.kick;
    G.shots++;
    G.shake = Math.min(1, G.shake + def.kick * 0.5);
    if (p.weapon === 'shotgun') {
      Snd.shotgun();
      setTimeout(function () { Snd.pump(); }, 320);
    } else if (p.weapon === 'ak') {
      p.akHeat = Math.min(1, p.akHeat + 0.14);
      Snd.rifle();
    } else if (p.weapon === 'bazooka') {
      Snd.rocket();
      G.projs.push({
        x: p.x + Math.cos(p.ang) * 0.55, y: p.y + Math.sin(p.ang) * 0.55,
        vx: Math.cos(p.ang) * 9.5, vy: Math.sin(p.ang) * 9.5,
        player: true, dmg: rand(70, 95), t: 0
      });
    } else Snd.pistol();

    // gunfire wakes nearby demons
    for (var i = 0; i < G.monsters.length; i++) {
      var m = G.monsters[i];
      if (m.state === 'idle' && dist2(m.x, m.y, p.x, p.y) < 9 * 9) Ent.wake(G, m);
    }

    var spread = (def.spread || 0) + (def.bloom ? p.akHeat * def.bloom : 0);
    var anyHit = false;
    for (var k = 0; k < def.pellets; k++) {
      var an = p.ang + rand(-1, 1) * spread;
      var dx = Math.cos(an), dy = Math.sin(an);
      var wall = castRay(p.x, p.y, dx, dy, 20);
      var wallD = wall.hit ? wall.dist : 20;
      var best = null, bestT = 1e9;
      for (i = 0; i < G.monsters.length; i++) {
        var mo = G.monsters[i];
        if (mo.state === 'dead') continue;
        var rx = mo.x - p.x, ry = mo.y - p.y;
        var t = rx * dx + ry * dy;
        if (t < 0.15 || t > wallD) continue;
        var lat = Math.abs(-rx * dy + ry * dx);
        if (lat < mo.def.hitR + 0.05 && t < bestT) { best = mo; bestT = t; }
      }
      if (best) {
        anyHit = true;
        Ent.hurtMonster(G, best, rand(def.dmg[0], def.dmg[1]),
                        p.x + dx * bestT, p.y + dy * bestT, dx, dy);
      } else if (wall.hit) {
        FX.puff(G, p.x + dx * (wallD - 0.03), p.y + dy * (wallD - 0.03), 0.5);
      }
    }
    if (anyHit) G.hits++;
  }

  function switchWeapon(G, w) {
    var p = G.player;
    if (p.weapon === w) return;
    p.weapon = w; p.cd = Math.max(p.cd, 0.25); p.flash = 0; p.recoil = 0;
    G.addMsg(DEFS[w].label + ' equipped');
    Snd.click();
  }
  function cycle(G, dir) {
    var p = G.player;
    var idx = ORDER.indexOf(p.weapon);
    switchWeapon(G, ORDER[(idx + dir + ORDER.length) % ORDER.length]);
  }

  function update(G, dt) {
    var p = G.player;
    p.cd = Math.max(0, p.cd - dt);
    p.flash = Math.max(0, p.flash - dt * 9);
    p.recoil = Math.max(0, p.recoil - dt * 5);
    p.akHeat = Math.max(0, p.akHeat - dt * 0.75);
    p.pumpT += dt;
    if (G.input.fire && G.state === 'play') tryFire(G);
  }

  /* ---------------- vector art ---------------- */
  function drawFlash(x, cx, cy, size, strength) {
    x.save();
    x.globalCompositeOperation = 'lighter';
    var g = x.createRadialGradient(cx, cy, 1, cx, cy, size);
    g.addColorStop(0, 'rgba(255,255,230,' + (0.95 * strength) + ')');
    g.addColorStop(0.4, 'rgba(255,190,70,' + (0.8 * strength) + ')');
    g.addColorStop(1, 'rgba(255,110,20,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, size, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,220,120,' + (0.85 * strength) + ')';
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * TAU + rand(0, 0.6);
      var r1 = size * rand(0.7, 1.15), r2 = size * 0.22;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      x.lineTo(cx + Math.cos(a + 0.35) * r2, cy + Math.sin(a + 0.35) * r2);
      x.lineTo(cx + Math.cos(a - 0.35) * r2, cy + Math.sin(a - 0.35) * r2);
      x.fill();
    }
    x.restore();
  }

  function drawShotgun(x, G) {
    var p = G.player;
    var bobX = Math.sin(p.bobT) * 7 * p.bobAmt;
    var bobY = Math.abs(Math.cos(p.bobT)) * 5 * p.bobAmt;
    var rec = p.recoil * (p.recoilK || 1);
    var pumpPhase = clamp((p.pumpT - 0.3) / 0.35, 0, 1);
    var pumpOff = Math.sin(pumpPhase * Math.PI) * 24;
    var baseX = G.W / 2 + 34 + bobX + rec * 8;
    var baseY = G.H - 76 + bobY + rec * 22;
    x.save();
    x.translate(baseX, baseY);
    x.rotate(-0.07 + rec * 0.1);
    x.strokeStyle = '#3f5a43'; x.lineWidth = 17; x.lineCap = 'round';
    x.beginPath(); x.moveTo(-95, 95); x.lineTo(-8, -40 + pumpOff); x.stroke();
    x.fillStyle = '#33373d'; x.fillRect(4, -156, 9, 138);
    x.fillStyle = '#3d434b'; x.fillRect(-11, -166, 16, 148);
    x.fillStyle = '#4c535d'; x.fillRect(-11, -166, 4, 148);
    x.fillStyle = '#101317';
    x.beginPath(); x.ellipse(-3, -166, 7.5, 3, 0, 0, TAU); x.fill();
    x.fillStyle = '#6d4a2a'; x.fillRect(-17, -66 + pumpOff, 31, 36);
    x.fillStyle = '#7f5a35'; x.fillRect(-17, -66 + pumpOff, 31, 6);
    x.fillStyle = '#54371c';
    for (var i = 0; i < 3; i++) x.fillRect(-17, -56 + pumpOff + i * 9, 31, 3);
    x.fillStyle = '#c99b72';
    x.beginPath(); x.ellipse(-4, -50 + pumpOff, 11, 8, 0.2, 0, TAU); x.fill();
    x.fillStyle = '#26292f'; x.fillRect(-19, -32, 37, 46);
    x.fillStyle = '#3c4148'; x.fillRect(-19, -32, 37, 6);
    x.fillStyle = '#15171b'; x.fillRect(-6, -26, 12, 10);
    x.restore();
    if (p.flash > 0) drawFlash(x, baseX - 3, baseY - 172 + bobY, 34, p.flash);
  }

  function drawPistol(x, G) {
    var p = G.player;
    var bobX = Math.sin(p.bobT) * 7 * p.bobAmt;
    var bobY = Math.abs(Math.cos(p.bobT)) * 5 * p.bobAmt;
    var rec = p.recoil * (p.recoilK || 1);
    var baseX = G.W / 2 + 8 + bobX + rec * 6;
    var baseY = G.H - 74 + bobY + rec * 16;
    x.save();
    x.translate(baseX, baseY);
    x.rotate(-0.05 + rec * 0.12);
    x.strokeStyle = '#3f5a43'; x.lineWidth = 19; x.lineCap = 'round';
    x.beginPath(); x.moveTo(4, 110); x.lineTo(2, -6); x.stroke();
    x.fillStyle = '#c99b72';
    x.beginPath(); x.ellipse(0, -10, 13, 15, 0, 0, TAU); x.fill();
    x.fillStyle = '#3d4148'; x.fillRect(-9, -62 - rec * 6, 18, 42);
    x.fillStyle = '#4c525a'; x.fillRect(-9, -62 - rec * 6, 18, 5);
    x.fillStyle = '#101317';
    x.beginPath(); x.ellipse(0, -62 - rec * 6, 4.5, 2, 0, 0, TAU); x.fill();
    x.restore();
    if (p.flash > 0) drawFlash(x, baseX, baseY - 72 + bobY, 22, p.flash);
  }

  function drawAK(x, G) {
    var p = G.player;
    var bobX = Math.sin(p.bobT) * 7 * p.bobAmt;
    var bobY = Math.abs(Math.cos(p.bobT)) * 5 * p.bobAmt;
    var heat = p.akHeat;
    var rec = p.recoil * (p.recoilK || 1);
    // full-auto chatter: the rifle jitters and climbs as it heats up
    var jitX = Math.sin(G.t * 47) * 2.4 * heat;
    var jitY = Math.cos(G.t * 53) * 1.8 * heat;
    var baseX = G.W / 2 + 52 + bobX + jitX + rec * 5;
    var baseY = G.H - 74 + bobY + jitY + rec * 13 - heat * 12;
    x.save();
    x.translate(baseX, baseY);
    x.rotate(-0.1 + rec * 0.07 + heat * 0.05);
    // wooden stock sweeping off to the lower right
    x.fillStyle = '#7d4e26';
    x.beginPath();
    x.moveTo(11, -50); x.lineTo(64, 46); x.lineTo(46, 56); x.lineTo(0, -40);
    x.closePath(); x.fill();
    x.fillStyle = '#8f5e31';
    x.beginPath();
    x.moveTo(11, -50); x.lineTo(64, 46); x.lineTo(58, 49); x.lineTo(9, -44);
    x.closePath(); x.fill();
    // left forearm to the handguard
    x.strokeStyle = '#3f5a43'; x.lineWidth = 17; x.lineCap = 'round';
    x.beginPath(); x.moveTo(-110, 100); x.lineTo(-6, -74); x.stroke();
    // barrel + gas tube
    x.fillStyle = '#3b4046'; x.fillRect(-4, -168, 9, 74);
    x.fillStyle = '#4c525a'; x.fillRect(-5, -172, 4, 80);
    x.fillStyle = '#26292f'; x.fillRect(-7, -176, 15, 9);          // muzzle brake
    x.fillStyle = '#15171b'; x.fillRect(-4, -174, 9, 5);
    // front sight post
    x.fillStyle = '#26292f';
    x.fillRect(-2, -186, 4, 10);
    x.fillRect(-8, -186, 3, 5); x.fillRect(3, -186, 3, 5);
    // wooden handguard
    x.fillStyle = '#8a5a2c'; x.fillRect(-12, -98, 25, 36);
    x.fillStyle = '#9c6c3a'; x.fillRect(-12, -98, 25, 6);
    x.fillStyle = '#6d441f';
    for (var i = 0; i < 3; i++) x.fillRect(-12, -88 + i * 10, 25, 3);
    // receiver
    x.fillStyle = '#2b2e34'; x.fillRect(-14, -64, 28, 38);
    x.fillStyle = '#3c4148'; x.fillRect(-14, -64, 28, 5);
    x.fillStyle = '#15171b'; x.fillRect(-2, -56, 10, 8);           // ejection port
    // the signature curved magazine
    x.fillStyle = '#4a4433';
    x.beginPath();
    x.moveTo(0, -28);
    x.quadraticCurveTo(26, -6, 22, 30);
    x.lineTo(6, 30);
    x.quadraticCurveTo(12, -2, -12, -24);
    x.closePath(); x.fill();
    x.strokeStyle = '#332e22'; x.lineWidth = 2;
    for (i = 0; i < 3; i++) {
      x.beginPath();
      var mg = -18 + i * 14;
      x.moveTo(mg * 0.4, mg); x.quadraticCurveTo(mg * 0.4 + 8, mg + 8, mg * 0.4 + 6, mg + 14);
      x.stroke();
    }
    // pistol grip + hands
    x.save();
    x.translate(-12, -26); x.rotate(0.45);
    x.fillStyle = '#7a4a22'; x.fillRect(-6, 0, 12, 22);
    x.restore();
    x.fillStyle = '#c99b72';
    x.beginPath(); x.ellipse(-12, -16, 9, 11, 0.4, 0, TAU); x.fill();  // right hand
    x.beginPath(); x.ellipse(-2, -80, 10, 8, 0.15, 0, TAU); x.fill();  // left hand
    x.restore();
    if (p.flash > 0) drawFlash(x, baseX - 1, baseY - 182 + bobY, 26, p.flash);
  }

  function drawBazooka(x, G) {
    var p = G.player;
    var bobX = Math.sin(p.bobT) * 7 * p.bobAmt;
    var bobY = Math.abs(Math.cos(p.bobT)) * 5 * p.bobAmt;
    var rec = p.recoil * (p.recoilK || 1);
    var baseX = G.W / 2 + 56 + bobX + rec * 10;
    var baseY = G.H - 70 + bobY + rec * 26;
    x.save();
    x.translate(baseX, baseY);
    x.rotate(-0.11 + rec * 0.13);
    // left forearm bracing the tube
    x.strokeStyle = '#3f5a43'; x.lineWidth = 17; x.lineCap = 'round';
    x.beginPath(); x.moveTo(-116, 108); x.lineTo(-4, -66); x.stroke();
    // rear exhaust cone
    x.fillStyle = '#3a3f46';
    x.beginPath(); x.moveTo(-13, 6); x.lineTo(13, 6); x.lineTo(24, 58); x.lineTo(-24, 58); x.closePath(); x.fill();
    // main tube
    x.fillStyle = '#4a5058'; x.fillRect(-13, -182, 26, 190);
    x.fillStyle = '#5c636c'; x.fillRect(-13, -182, 6, 190);
    x.fillStyle = '#2c3036'; x.fillRect(-13, -182, 26, 8); x.fillRect(-13, -10, 26, 8);
    // front aperture
    x.fillStyle = '#101317';
    x.beginPath(); x.ellipse(0, -182, 12.5, 5, 0, 0, TAU); x.fill();
    x.strokeStyle = '#6a727c'; x.lineWidth = 2.5;
    x.beginPath(); x.ellipse(0, -182, 12.5, 5, 0, 0, TAU); x.stroke();
    // side sight
    x.fillStyle = '#2c3036'; x.fillRect(11, -150, 7, 16);
    x.fillRect(11, -150, 14, 4);
    // grip + hands
    x.save();
    x.translate(-4, -8); x.rotate(0.4);
    x.fillStyle = '#7a4a22'; x.fillRect(-5, 0, 11, 20);
    x.restore();
    x.fillStyle = '#c99b72';
    x.beginPath(); x.ellipse(-6, 2, 9, 11, 0.4, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(-4, -70, 11, 9, 0.15, 0, TAU); x.fill();
    x.restore();
    if (p.flash > 0) drawFlash(x, baseX, baseY - 190 + bobY, 44, p.flash);
  }

  function draw(ctx, G) {
    if (G.state === 'title') return;
    if (G.player.weapon === 'shotgun') drawShotgun(ctx, G);
    else if (G.player.weapon === 'ak') drawAK(ctx, G);
    else if (G.player.weapon === 'bazooka') drawBazooka(ctx, G);
    else drawPistol(ctx, G);
  }

  return { DEFS: DEFS, ORDER: ORDER, tryFire: tryFire, switchWeapon: switchWeapon,
           cycle: cycle, update: update, draw: draw };
})();
