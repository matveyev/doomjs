'use strict';
/* Game state, input, cheat codes, level progression and the main loop. */
var G = {
  state: 'title', t: 0, playT: 0, W: 640, H: 400,
  player: null, monsters: [], items: [], projs: [],
  particles: [], decals: [], splats: [], msgs: [],
  input: { keys: {}, fire: false },
  kills: 0, total: 0, shots: 0, hits: 0,
  levelIdx: 0, totKills: 0, totTime: 0,
  god: false, noclip: false,
  shake: 0, dmgFlash: 0, pickFlash: 0, grinT: 0, painT: 0,
  winDelay: -1, showMap: true, canvas: null, ctx: null
};

(function () {
  var SPEED = 4.1, TURN = 2.8, SENS = 0.0023, RADIUS = 0.26;
  var last = 0;

  function defaultLoadout() {
    return { hp: 100, ammo: 24, rifle: 90, rockets: 6, weapon: 'shotgun' };
  }

  function newPlayer(carry) {
    var d = defaultLoadout();
    if (carry) {
      d.hp = carry.hp; d.ammo = carry.ammo; d.rifle = carry.rifle;
      d.rockets = carry.rockets; d.weapon = carry.weapon;
    }
    return {
      x: Level.start.x, y: Level.start.y, ang: Level.start.ang,
      hp: d.hp, ammo: d.ammo, rifle: d.rifle, rockets: d.rockets, weapon: d.weapon,
      cd: 0, flash: 0, recoil: 0, recoilK: 1, pumpT: 1, akHeat: 0,
      bobT: 0, bobAmt: 0, moving: false
    };
  }

  function newGame(carry) {
    G.player = newPlayer(carry);
    G.monsters = []; G.items = []; G.projs = [];
    G.particles = []; G.decals = []; G.splats = []; G.msgs = [];
    G.kills = 0; G.shots = 0; G.hits = 0; G.playT = 0;
    G.shake = 0; G.dmgFlash = 0; G.pickFlash = 0; G.grinT = 0; G.painT = 0;
    G.winDelay = -1;
    G.input.fire = false;
    Ent.spawn(G);
    HUD.buildMinimap();
    G.addMsg('Level ' + (G.levelIdx + 1) + ': ' + Level.name + ' — ' + G.total + ' demons.');
  }

  function loadLevel(idx, carry) {
    G.levelIdx = idx;
    Level.load(idx);
    newGame(carry);
  }

  G.addMsg = function (text) {
    G.msgs.unshift({ text: text, t: 3.5 });
    if (G.msgs.length > 5) G.msgs.pop();
  };

  G.playerDamage = function (d) {
    var p = G.player;
    if (p.hp <= 0 || G.god) return;
    p.hp = Math.max(0, Math.round(p.hp - d));
    G.dmgFlash = Math.min(1, G.dmgFlash + 0.55);
    G.shake = Math.min(1, G.shake + 0.35);
    G.painT = 0.9;
    Snd.hurt();
    if (p.hp <= 0) {
      G.state = 'dead';
      G.input.fire = false;
      G.dmgFlash = 1;
      if (document.exitPointerLock) document.exitPointerLock();
    }
  };

  function requestLock() {
    try {
      var r = G.canvas.requestPointerLock();
      if (r && r.catch) r.catch(function () {});
    } catch (e) { /* pointer lock unavailable — keyboard turning still works */ }
  }

  function startGame() {           // fresh run from the title screen
    Snd.init(); Snd.resume(); Snd.startDrone();
    loadLevel(0, null);
    G.totKills = 0; G.totTime = 0;
    G.state = 'play';
    requestLock();
  }
  function retryLevel() {          // death: same level, fresh loadout
    loadLevel(G.levelIdx, null);
    G.state = 'play';
    requestLock();
  }
  function nextLevel() {           // carry weapons, ammo and health downward
    G.totKills += G.kills; G.totTime += G.playT;
    var p = G.player;
    loadLevel(G.levelIdx + 1,
      { hp: p.hp, ammo: p.ammo, rifle: p.rifle, rockets: p.rockets, weapon: p.weapon });
    G.state = 'play';
    requestLock();
  }
  function finishRun() {           // after the last level: back to the title
    G.totKills += G.kills; G.totTime += G.playT;
    loadLevel(0, null);
    G.totKills = 0; G.totTime = 0;
    G.state = 'title';
  }

  /* ---------------- cheat codes: iddqd / idkfa / idclip ---------------- */
  var cheatBuf = '';
  function tryCheat(letter) {
    cheatBuf = (cheatBuf + letter).slice(-10);
    var p = G.player;
    if (!p) return;
    var fire = false;
    if (cheatBuf.slice(-5) === 'iddqd') {
      G.god = !G.god;
      if (G.god) p.hp = 100;
      G.addMsg(G.god ? 'Degreelessness mode ON' : 'Degreelessness mode OFF');
      fire = true;
    } else if (cheatBuf.slice(-5) === 'idkfa') {
      p.ammo = 50; p.rifle = 240; p.rockets = 30;
      G.addMsg('Very happy ammo added: full arsenal');
      fire = true;
    } else if (cheatBuf.slice(-6) === 'idclip') {
      G.noclip = !G.noclip;
      G.addMsg(G.noclip ? 'No clipping mode ON' : 'No clipping mode OFF');
      fire = true;
    }
    if (fire) { cheatBuf = ''; Snd.pickup(); }
  }

  /* ---------------- input ---------------- */
  function onKey(e, down) {
    var k = e.code;
    G.input.keys[k] = down;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft'].indexOf(k) >= 0) {
      e.preventDefault();
    }
    if (!down) return;
    if (k === 'Tab') G.showMap = !G.showMap;
    if (k === 'KeyM') { Snd.setMute(!Snd.isMuted()); G.addMsg(Snd.isMuted() ? 'Sound muted' : 'Sound on'); }
    if (/^Key[A-Z]$/.test(k)) tryCheat(k.slice(3).toLowerCase());
    if (G.state === 'play') {
      if (k === 'Digit1') Weapon.switchWeapon(G, 'pistol');
      if (k === 'Digit2') Weapon.switchWeapon(G, 'shotgun');
      if (k === 'Digit3') Weapon.switchWeapon(G, 'ak');
      if (k === 'Digit4') Weapon.switchWeapon(G, 'bazooka');
      if (k === 'Escape' && !document.pointerLockElement) G.state = 'pause';
    } else if (k === 'Enter') {
      if (G.state === 'dead') retryLevel();
      else if (G.state === 'win') {
        if (G.levelIdx >= Level.count - 1) finishRun(); else nextLevel();
      }
    }
  }
  window.addEventListener('keydown', function (e) { onKey(e, true); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });

  window.addEventListener('mousemove', function (e) {
    if (G.state === 'play' && document.pointerLockElement === G.canvas) {
      G.player.ang += e.movementX * SENS;
    }
  });
  window.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    Snd.init(); Snd.resume();
    if (G.state === 'title') { startGame(); return; }
    if (G.state === 'dead') { retryLevel(); return; }
    if (G.state === 'win') {
      if (G.levelIdx >= Level.count - 1) finishRun(); else nextLevel();
      return;
    }
    if (G.state === 'pause') { G.state = 'play'; requestLock(); return; }
    G.input.fire = true;
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) G.input.fire = false; });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () {
    G.input.keys = {}; G.input.fire = false;
    if (G.state === 'play') G.state = 'pause';
  });
  window.addEventListener('wheel', function (e) {
    if (G.state !== 'play') return;
    Weapon.cycle(G, e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('pointerlockchange', function () {
    if (!document.pointerLockElement && G.state === 'play') G.state = 'pause';
    if (document.pointerLockElement && G.state === 'pause') G.state = 'play';
  });

  /* ---------------- update ---------------- */
  function movePlayer(dt) {
    var p = G.player, k = G.input.keys;
    if (p.hp <= 0) { p.moving = false; p.bobAmt = Math.max(0, p.bobAmt - dt * 4); return; }
    if (k['ArrowLeft']) p.ang -= TURN * dt;
    if (k['ArrowRight']) p.ang += TURN * dt;

    var fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    var str = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
    var len = Math.hypot(fwd, str);
    if (len > 0) { fwd /= len; str /= len; }
    var ca = Math.cos(p.ang), sa = Math.sin(p.ang);
    var dx = (ca * fwd - sa * str) * SPEED * dt;
    var dy = (sa * fwd + ca * str) * SPEED * dt;
    if (G.noclip) {
      p.x += dx; p.y += dy;
      p.moving = len > 0;
    } else {
      if (Ent.circleFits(p.x + dx, p.y, RADIUS)) p.x += dx;
      if (Ent.circleFits(p.x, p.y + dy, RADIUS)) p.y += dy;
      Ent.pushFromMonsters(G);
      p.moving = len > 0;
    }
    p.bobAmt += ((p.moving ? 1 : 0) - p.bobAmt) * Math.min(1, dt * 8);
    if (p.moving) p.bobT += dt * 10;
  }

  function update(dt) {
    G.t += dt;
    if (G.state === 'title') {
      G.player.ang += dt * 0.09;   // slow pan behind the title
      return;
    }
    if (G.state === 'pause') return;

    if (G.state === 'play') movePlayer(dt);
    Ent.updateMonsters(G, dt);
    Ent.updateProjs(G, dt);
    Ent.updateItems(G, dt);
    FX.update(G, dt);
    Weapon.update(G, dt);

    G.shake = Math.max(0, G.shake - dt * 2.6);
    G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.3);
    G.pickFlash = Math.max(0, G.pickFlash - dt * 2);
    G.grinT = Math.max(0, G.grinT - dt);
    G.painT = Math.max(0, G.painT - dt);
    G.msgs.forEach(function (m) { m.t -= dt; });
    G.msgs = G.msgs.filter(function (m) { return m.t > 0; });

    if (G.state === 'play') {
      G.playT += dt;
      if (G.kills >= G.total) {
        if (G.winDelay < 0) G.winDelay = 1.3;
        G.winDelay -= dt;
        if (G.winDelay <= 0) {
          G.state = 'win';
          G.input.fire = false;
          if (document.exitPointerLock) document.exitPointerLock();
        }
      }
    }
  }

  function loop(ts) {
    var dt = clamp((ts - last) / 1000, 0, 0.05);
    last = ts;
    try {
      update(dt);
      Render.frame(G);
      HUD.draw(G.ctx, G);
    } catch (e) {
      // never let one bad frame kill the loop silently
      if (console && console.error) console.error(e);
    }
    requestAnimationFrame(loop);
  }

  /* ---------------- boot ---------------- */
  window.addEventListener('load', function () {
    G.canvas = document.getElementById('game');
    G.ctx = G.canvas.getContext('2d');
    Level.load(0);
    Tex.gen();
    Spr.gen();
    Render.init(G.canvas);
    HUD.init();
    newGame(null);       // world also serves as the animated title backdrop
    G.state = 'title';
    requestAnimationFrame(loop);
  });

  // for debugging / automated testing: skip the title screen without pointer lock
  G.debugStart = function () { loadLevel(0, null); G.state = 'play'; };
  G.step = function (dt) { update(dt); };   // test hook: run world update once
  window.G = G;
})();
