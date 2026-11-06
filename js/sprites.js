'use strict';
/* All game sprites are drawn here with canvas vector primitives and baked into
 * offscreen frames. Every frame is pre-baked at several darkness levels so the
 * renderer can apply distance fog for free. */
var Spr = (function () {
  var FOG_LEVELS = 6, FOG_MAX = 0.86;

  function cv(w, h, fn) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    return c;
  }
  function fogVersions(c) {
    var arr = [c];
    for (var i = 1; i < FOG_LEVELS; i++) {
      arr.push(cv(c.width, c.height, function (x) {
        x.drawImage(c, 0, 0);
        x.fillStyle = 'rgba(6,5,10,' + (i / (FOG_LEVELS - 1) * FOG_MAX).toFixed(3) + ')';
        x.fillRect(0, 0, c.width, c.height);
      }));
    }
    return arr;
  }
  function frame(w, h, fn) {
    var c = cv(w, h, fn);
    return { c: fogVersions(c), w: w, h: h };
  }

  function es(x, cx, cy, rx, ry, fill, stroke, lw) {
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    x.fillStyle = fill; x.fill();
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 1.5; x.stroke(); }
  }
  function rc(x, rx, ry, rw, rh, fill, stroke, lw) {
    x.fillStyle = fill; x.fillRect(rx, ry, rw, rh);
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 1.5; x.strokeRect(rx, ry, rw, rh); }
  }
  function shadow(x, cx, rx) {
    es(x, cx, 91, rx, 4, 'rgba(0,0,0,0.38)');
  }
  function bloodStains(x, pts, color) {
    pts.forEach(function (p) { es(x, p[0], p[1], p[2], p[2] * 0.7, color || 'rgba(90,10,12,0.7)'); });
  }

  /* ---------------- GRUNT — zombified soldier, hitscan ---------------- */
  var palGrunt = {
    skin: '#8fa27c', skinD: '#6b7d5a', armor: '#42593f', armorD: '#2e402d',
    pants: '#4a3b2b', boot: '#26201b', eye: '#ff3826', gun: '#1d2126', hair: '#3a3b32'
  };

  function gruntLegs(x, p, s0, s1) {
    rc(x, 34 + s0, 62, 9, 24, p.pants); rc(x, 30 + s0, 84, 14, 8, p.boot);
    rc(x, 53 + s1, 62, 9, 24, p.pants); rc(x, 50 + s1, 84, 14, 8, p.boot);
  }
  function gruntTorso(x, p, dy) {
    // legs
    gruntLegs(x, p, 0, 0);
    // torso armor
    x.beginPath();
    x.moveTo(30, 36 + dy); x.lineTo(66, 36 + dy); x.lineTo(61, 66 + dy); x.lineTo(35, 66 + dy);
    x.closePath(); x.fillStyle = p.armor; x.fill(); x.strokeStyle = p.armorD; x.lineWidth = 2; x.stroke();
    rc(x, 36, 40 + dy, 24, 12, p.armorD);                 // chest plate
    rc(x, 33, 61 + dy, 30, 4, '#20261f');                 // belt
    es(x, 31, 38 + dy, 7, 6, p.armorD); es(x, 65, 38 + dy, 7, 6, p.armorD); // shoulder pads
    bloodStains(x, [[44, 48 + dy, 4], [56, 55 + dy, 3]]);
  }
  function gruntHead(x, p, dy, mouthOpen, pain) {
    rc(x, 44, 30 + dy, 8, 6, p.skinD);                    // neck
    es(x, 48, 22 + dy, 11, 12.5, p.skin, p.skinD, 1.5);   // head
    // messy hair
    x.fillStyle = p.hair;
    x.beginPath(); x.ellipse(48, 13 + dy, 11, 5, 0, Math.PI, 0); x.fill();
    // eyes
    if (pain) { es(x, 43.5, 21 + dy, 2.6, 2.9, '#fff'); es(x, 52.5, 21 + dy, 2.6, 2.9, '#fff');
      x.fillStyle = '#111'; x.fillRect(41, 20 + dy, 5, 1.6); x.fillRect(50, 20 + dy, 5, 1.6); }
    else { es(x, 43.5, 21 + dy, 2, 2, p.eye); es(x, 52.5, 21 + dy, 2, 2, p.eye);
      x.fillStyle = 'rgba(255,60,40,0.35)'; es(x, 43.5, 21 + dy, 4, 4, 'rgba(255,60,40,0.3)'); es(x, 52.5, 21 + dy, 4, 4, 'rgba(255,60,40,0.3)'); }
    // mouth
    if (mouthOpen) es(x, 48, 29 + dy, 3.4, 2.8, '#1c0f0c');
    else rc(x, 44, 28 + dy, 8, 1.8, '#1c0f0c');
  }

  function genGrunt() {
    var p = palGrunt;
    return {
      walk: [
        frame(96, 96, function (x) { shadow(x, 48, 26); gruntTorso(x, p, 0); gruntHead(x, p, 0, false, false);
          // left arm hangs, right arm holds gun low
          rc(x, 22, 40, 8, 20, p.skinD); es(x, 26, 61, 4, 4, p.skin);
          rc(x, 66, 42, 8, 18, p.skinD); rc(x, 65, 58, 8, 12, p.gun); es(x, 70, 72, 3.4, 3.4, p.skin);
        }),
        frame(96, 96, function (x) { shadow(x, 48, 26);
          rc(x, 36, 62, 9, 24, p.pants); rc(x, 33, 84, 14, 8, p.boot);
          rc(x, 52, 62, 9, 24, p.pants); rc(x, 50, 84, 14, 8, p.boot);
          gruntTorso(x, p, -1); gruntHead(x, p, -1, false, false);
          rc(x, 23, 39, 8, 20, p.skinD); es(x, 27, 60, 4, 4, p.skin);
          rc(x, 66, 41, 8, 18, p.skinD); rc(x, 65, 57, 8, 12, p.gun); es(x, 70, 71, 3.4, 3.4, p.skin);
        })
      ],
      attack: frame(96, 96, function (x) { shadow(x, 48, 26); gruntTorso(x, p, 0); gruntHead(x, p, 0, true, false);
          // gun raised toward the viewer
          rc(x, 22, 42, 8, 18, p.skinD);
          es(x, 48, 50, 9, 8, p.skinD);                    // fist
          rc(x, 42, 30, 12, 20, p.gun);                    // pistol
          es(x, 48, 31, 3.4, 3.4, '#000');                 // muzzle
          var g = x.createRadialGradient(48, 30, 1, 48, 30, 9);
          g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(1, 'rgba(255,150,40,0)');
          x.fillStyle = g; x.beginPath(); x.arc(48, 30, 9, 0, TAU); x.fill();
        }),
      pain: frame(96, 96, function (x) { shadow(x, 48, 26);
          x.save(); x.translate(-4, 0); gruntTorso(x, p, -2); gruntHead(x, p, -2, true, true); x.restore();
          rc(x, 20, 38, 8, 16, p.skinD); rc(x, 68, 38, 8, 16, p.skinD);
          bloodStains(x, [[46, 44, 5], [38, 54, 3.4]]);
        }),
      die: [
        frame(96, 96, function (x) { shadow(x, 48, 28); // knees buckle
          rc(x, 32, 68, 9, 18, p.pants); rc(x, 29, 84, 14, 8, p.boot);
          rc(x, 55, 68, 9, 18, p.pants); rc(x, 52, 84, 14, 8, p.boot);
          x.save(); x.translate(0, 8); gruntTorso(x, p, 0); gruntHead(x, p, 0, true, true); x.restore();
          rc(x, 18, 46, 16, 7, p.skinD); rc(x, 64, 46, 16, 7, p.skinD);
        }),
        frame(96, 96, function (x) { shadow(x, 48, 28);
          x.save(); x.translate(48, 92); x.rotate(0.5); x.translate(-48, -92);
          gruntTorso(x, p, 6); gruntHead(x, p, 6, true, true); x.restore();
        }),
        frame(96, 96, function (x) { shadow(x, 48, 28);
          x.save(); x.translate(48, 92); x.rotate(1.15); x.translate(-48, -92);
          gruntTorso(x, p, 8); gruntHead(x, p, 8, true, true); x.restore();
        })
      ],
      corpse: frame(96, 96, function (x) {
        es(x, 48, 84, 30, 7, 'rgba(96,8,12,0.85)');       // blood pool
        es(x, 48, 80, 24, 8, p.armorD, '#1a2418', 1.5);   // body mound
        rc(x, 22, 78, 18, 6, p.pants);
        es(x, 72, 78, 8, 7, p.skin, p.skinD, 1.5);        // head
        rc(x, 68, 74, 7, 2, '#1c0f0c');
        rc(x, 30, 86, 14, 4, p.gun);                      // dropped gun
        bloodStains(x, [[40, 84, 5], [58, 86, 4]]);
      })
    };
  }

  /* ---------------- IMP — fireball-throwing demon ---------------- */
  function makeImpPalette(skin, skinD, eye) {
    return { skin: skin, skinD: skinD, horn: '#d8c8a0', hornD: '#a3926c', eye: eye,
             claw: '#e8dcc8', mouth: '#2a0c08', teeth: '#e8e2d0' };
  }
  var palImp = makeImpPalette('#9c4a2c', '#6f2f1b', '#ffd23a');
  var palElite = makeImpPalette('#4d8f3d', '#33642a', '#ff4a2a');
  var palBaron = makeImpPalette('#6b2430', '#471520', '#7cff4a');

  function impLegs(x, p, s) {
    // digitigrade legs: thick angled strokes
    x.strokeStyle = p.skinD; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath(); x.moveTo(38, 58); x.lineTo(33 + s, 74); x.lineTo(38 + s, 88); x.stroke();
    x.beginPath(); x.moveTo(58, 58); x.lineTo(63 - s, 74); x.lineTo(58 - s, 88); x.stroke();
    // claws on feet
    x.fillStyle = p.claw;
    [[38 + s, 90], [58 - s, 90]].forEach(function (f) {
      for (var i = -1; i <= 1; i++) {
        x.beginPath(); x.moveTo(f[0] + i * 3 - 1.5, f[1]); x.lineTo(f[0] + i * 3, f[1] + 4); x.lineTo(f[0] + i * 3 + 1.5, f[1]); x.fill();
      }
    });
  }
  function impTorso(x, p, dy) {
    impLegs(x, p, 0);
    // torso
    es(x, 48, 44 + dy, 17, 15, p.skin, p.skinD, 2);
    // abs shading
    x.strokeStyle = p.skinD; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(43, 38 + dy); x.lineTo(43, 52 + dy); x.moveTo(53, 38 + dy); x.lineTo(53, 52 + dy); x.stroke();
    // shoulder spikes
    x.fillStyle = p.horn;
    [[31, 32 + dy], [65, 32 + dy]].forEach(function (s) {
      x.beginPath(); x.moveTo(s[0] - 4, s[1] + 4); x.lineTo(s[0], s[1] - 7); x.lineTo(s[0] + 4, s[1] + 4); x.fill();
    });
  }
  function impArms(x, p, dy, up) {
    x.strokeStyle = p.skin; x.lineWidth = 6.5; x.lineCap = 'round';
    function claws(hx, hy) {
      x.fillStyle = p.claw;
      for (var i = -1; i <= 1; i++) {
        x.beginPath(); x.moveTo(hx - 3, hy + i * 3);
        x.lineTo(hx + (up ? 5 : 7), hy + i * 3 - (up ? 2 : 0));
        x.lineTo(hx - 2, hy + i * 3 + 2); x.fill();
      }
    }
    if (up) {
      x.beginPath(); x.moveTo(33, 40 + dy); x.quadraticCurveTo(18, 28 + dy, 30, 16 + dy); x.stroke();
      x.beginPath(); x.moveTo(63, 40 + dy); x.quadraticCurveTo(78, 28 + dy, 66, 16 + dy); x.stroke();
      claws(30, 16 + dy); claws(66, 16 + dy);
    } else {
      x.beginPath(); x.moveTo(33, 40 + dy); x.quadraticCurveTo(24, 50 + dy, 28, 60 + dy); x.stroke();
      x.beginPath(); x.moveTo(63, 40 + dy); x.quadraticCurveTo(72, 50 + dy, 68, 60 + dy); x.stroke();
      claws(28, 60 + dy); claws(68, 60 + dy);
    }
  }
  function impHead(x, p, dy, mouthOpen) {
    es(x, 48, 18 + dy, 10, 9.5, p.skin, p.skinD, 1.5);
    // horns
    x.strokeStyle = p.horn; x.lineWidth = 3.4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(41, 12 + dy); x.quadraticCurveTo(34, 4 + dy, 38, -2 + dy + 6); x.stroke();
    x.beginPath(); x.moveTo(55, 12 + dy); x.quadraticCurveTo(62, 4 + dy, 58, -2 + dy + 6); x.stroke();
    // eyes
    x.fillStyle = p.eye;
    es(x, 44, 17 + dy, 2.3, 1.7, p.eye); es(x, 52, 17 + dy, 2.3, 1.7, p.eye);
    // mouth + teeth
    if (mouthOpen) {
      es(x, 48, 23 + dy, 4.4, 3.2, p.mouth);
      x.fillStyle = p.teeth;
      x.fillRect(44.6, 21 + dy, 1.4, 2); x.fillRect(47.3, 21 + dy, 1.4, 2); x.fillRect(50, 21 + dy, 1.4, 2);
    } else rc(x, 44, 22 + dy, 8, 1.6, p.mouth);
  }

  function genImp(pal) {
    var p = pal;
    return {
      walk: [
        frame(96, 96, function (x) { shadow(x, 48, 24); impTorso(x, p, 0); impArms(x, p, 0, false); impHead(x, p, 0, false); }),
        frame(96, 96, function (x) { shadow(x, 48, 24); impLegs(x, p, 4); impTorso(x, p, -1); impArms(x, p, -1, false); impHead(x, p, -1, false); })
      ],
      attack: frame(96, 96, function (x) { shadow(x, 48, 24); impTorso(x, p, 0); impArms(x, p, 0, true); impHead(x, p, 0, true);
          // fireball charging between the claws
          var g = x.createRadialGradient(48, 22, 2, 48, 22, 14);
          g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.4, 'rgba(255,150,40,0.9)');
          g.addColorStop(1, 'rgba(255,80,10,0)');
          x.fillStyle = g; x.beginPath(); x.arc(48, 22, 14, 0, TAU); x.fill();
        }),
      pain: frame(96, 96, function (x) { shadow(x, 48, 24);
          x.save(); x.translate(-4, -2); impTorso(x, p, 0); impArms(x, p, 0, false); impHead(x, p, 0, true); x.restore();
          bloodStains(x, [[46, 42, 5], [56, 50, 3.5]]);
        }),
      die: [
        frame(96, 96, function (x) { shadow(x, 48, 26);
          x.save(); x.translate(0, 10); impTorso(x, p, 0); impArms(x, p, 0, true); impHead(x, p, 0, true); x.restore();
          bloodStains(x, [[42, 70, 5], [56, 72, 4]]);
        }),
        frame(96, 96, function (x) { shadow(x, 48, 26);
          x.save(); x.translate(48, 92); x.rotate(0.55); x.translate(-48, -92);
          impTorso(x, p, 8); impArms(x, p, 8, true); impHead(x, p, 8, true); x.restore();
        }),
        frame(96, 96, function (x) { shadow(x, 48, 26);
          x.save(); x.translate(48, 92); x.rotate(1.2); x.translate(-48, -92);
          impTorso(x, p, 10); impHead(x, p, 10, true); x.restore();
        })
      ],
      corpse: frame(96, 96, function (x) {
        es(x, 48, 84, 28, 7, 'rgba(96,8,12,0.85)');
        es(x, 46, 80, 20, 8, p.skinD, '#241008', 1.5);
        es(x, 68, 79, 7, 6, p.skin, p.skinD, 1.5);        // head
        // horns sticking out
        x.strokeStyle = p.horn; x.lineWidth = 3; x.lineCap = 'round';
        x.beginPath(); x.moveTo(72, 76); x.quadraticCurveTo(79, 70, 77, 65); x.stroke();
        rc(x, 22, 80, 14, 5, p.skinD);
        bloodStains(x, [[40, 85, 5], [54, 87, 4]]);
      })
    };
  }

  /* ---------------- PINKY — bulky melee demon ---------------- */
  var palPinky = {
    skin: '#c9737f', skinD: '#9c4d5c', horn: '#b9b9c2', hornD: '#84848e',
    teeth: '#f0ead8', mouth: '#33101a', mouthIn: '#7c1224', eye: '#ffdf2a'
  };

  function pinkyBody(x, p, mouth) {
    var mw = mouth ? 34 : 26, mh = mouth ? 20 : 13;
    // legs
    rc(x, 36, 66, 12, 20, p.skinD); rc(x, 33, 84, 17, 8, '#3a2028');
    rc(x, 68, 66, 12, 20, p.skinD); rc(x, 66, 84, 17, 8, '#3a2028');
    // huge torso-head mass
    es(x, 58, 44, 34, 27, p.skin, p.skinD, 2.5);
    // back ridge
    x.fillStyle = p.skinD;
    for (var i = 0; i < 4; i++) {
      x.beginPath(); x.moveTo(26 + i * 9, 26 + Math.abs(i - 1.5) * 2);
      x.lineTo(30 + i * 9, 16 + Math.abs(i - 1.5) * 3); x.lineTo(34 + i * 9, 26 + Math.abs(i - 1.5) * 2); x.fill();
    }
    // eyes
    es(x, 44, 32, 2.6, 2.2, p.eye); es(x, 72, 32, 2.6, 2.2, p.eye);
    // giant maw
    es(x, 58, 50, mw, mh, p.mouthIn);
    es(x, 58, 50, mw * 0.78, mh * 0.78, p.mouth);
    // teeth top and bottom
    x.fillStyle = p.teeth;
    for (var t = -3; t <= 3; t++) {
      var tx = 58 + t * (mw / 3.6);
      x.beginPath(); x.moveTo(tx - 2.4, 50 - mh + 1); x.lineTo(tx, 50 - mh + 7); x.lineTo(tx + 2.4, 50 - mh + 1); x.fill();
      x.beginPath(); x.moveTo(tx - 2.4, 50 + mh - 1); x.lineTo(tx, 50 + mh - 7); x.lineTo(tx + 2.4, 50 + mh - 1); x.fill();
    }
    // horns curving down beside the maw
    x.strokeStyle = p.horn; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath(); x.moveTo(30, 30); x.quadraticCurveTo(20, 42, 30, 54); x.stroke();
    x.beginPath(); x.moveTo(86, 30); x.quadraticCurveTo(96, 42, 86, 54); x.stroke();
    x.strokeStyle = p.hornD; x.lineWidth = 2;
    x.beginPath(); x.moveTo(30, 30); x.quadraticCurveTo(20, 42, 30, 54); x.stroke();
    x.beginPath(); x.moveTo(86, 30); x.quadraticCurveTo(96, 42, 86, 54); x.stroke();
  }

  function genPinky() {
    var p = palPinky;
    return {
      walk: [
        frame(128, 96, function (x) { shadow(x, 62, 36); pinkyBody(x, p, false); }),
        frame(128, 96, function (x) { shadow(x, 62, 36);
          rc(x, 38, 70, 12, 16, p.skinD); rc(x, 35, 84, 17, 8, '#3a2028');
          rc(x, 68, 70, 12, 16, p.skinD); rc(x, 66, 84, 17, 8, '#3a2028');
          x.save(); x.translate(0, -3); pinkyBody(x, p, false); x.restore();
        })
      ],
      attack: frame(128, 96, function (x) { shadow(x, 62, 36); pinkyBody(x, p, true); }),
      pain: frame(128, 96, function (x) { shadow(x, 62, 36);
        x.save(); x.translate(-5, -3); pinkyBody(x, p, true); x.restore();
        bloodStains(x, [[58, 40, 6], [70, 52, 4]]);
      }),
      die: [
        frame(128, 96, function (x) { shadow(x, 62, 36);
          x.save(); x.translate(0, 8); pinkyBody(x, p, true); x.restore();
          bloodStains(x, [[50, 66, 5], [70, 68, 4]]);
        }),
        frame(128, 96, function (x) { shadow(x, 62, 36);
          x.save(); x.translate(62, 92); x.rotate(0.5); x.translate(-62, -92); pinkyBody(x, p, false); x.restore();
        }),
        frame(128, 96, function (x) { shadow(x, 62, 36);
          x.save(); x.translate(62, 92); x.rotate(1.1); x.translate(-62, -92); pinkyBody(x, p, false); x.restore();
        })
      ],
      corpse: frame(128, 96, function (x) {
        es(x, 62, 84, 40, 8, 'rgba(96,8,12,0.85)');
        es(x, 60, 79, 32, 10, p.skinD, '#33161e', 2);     // bulk lying
        es(x, 88, 76, 10, 8, p.skin, p.skinD, 1.5);       // head end
        x.strokeStyle = p.horn; x.lineWidth = 4; x.lineCap = 'round';
        x.beginPath(); x.moveTo(92, 72); x.quadraticCurveTo(102, 66, 98, 58); x.stroke();
        rc(x, 26, 82, 18, 6, p.skinD);
        bloodStains(x, [[50, 86, 6], [72, 88, 5]]);
      })
    };
  }

  /* ---------------- projectiles & pickups ---------------- */
  function fireballFrame(r, flick) {
    return frame(64, 64, function (x) {
      var cx = 32 + rand(-flick, flick), cy = 32 + rand(-flick, flick);
      var g = x.createRadialGradient(cx, cy, 2, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,220,1)');
      g.addColorStop(0.35, 'rgba(255,190,60,0.95)');
      g.addColorStop(0.7, 'rgba(255,90,10,0.75)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
      // licking flames
      x.fillStyle = 'rgba(255,140,30,0.6)';
      for (var i = 0; i < 5; i++) {
        var a = rand(0, TAU), d = rand(r * 0.5, r * 0.85);
        x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rand(3, 6), 0, TAU); x.fill();
      }
    });
  }

  function genMedkit() {
    return frame(64, 48, function (x) {
      es(x, 32, 42, 20, 4, 'rgba(0,0,0,0.35)');
      rc(x, 12, 14, 40, 26, '#cfcfc6', '#8f8f86', 2);      // box
      rc(x, 12, 14, 40, 7, '#e8e8e0');                     // lid
      rc(x, 27, 18, 10, 19, '#c22218');                    // cross
      rc(x, 22, 23, 20, 9, '#c22218');
      rc(x, 12, 38, 40, 2, 'rgba(0,0,0,0.3)');
    });
  }
  function genAmmo() {
    return frame(64, 48, function (x) {
      es(x, 32, 42, 20, 4, 'rgba(0,0,0,0.35)');
      rc(x, 12, 20, 40, 20, '#5a5d3a', '#3c3f26', 2);      // box
      rc(x, 12, 20, 40, 6, '#6d7148');
      // shells poking out of the top
      for (var i = 0; i < 4; i++) {
        var sx = 16 + i * 9;
        rc(x, sx, 10, 7, 12, '#b03028', '#7c1c16', 1.5);   // shell
        rc(x, sx, 19, 7, 4, '#c8a23c');                    // brass base
      }
    });
  }

  function genRocketSprite() {
    return frame(64, 32, function (x) {
      // rocket flying left: body, red warhead, fins, exhaust flame
      x.fillStyle = '#8a8f96'; x.fillRect(14, 11, 30, 10);        // body
      x.fillStyle = '#a8adb4'; x.fillRect(14, 11, 30, 3);         // highlight
      x.fillStyle = '#c03028';                                     // warhead cone
      x.beginPath(); x.moveTo(2, 16); x.lineTo(14, 10); x.lineTo(14, 22); x.closePath(); x.fill();
      x.fillStyle = '#5a1410';
      x.beginPath(); x.moveTo(2, 16); x.lineTo(14, 12.5); x.lineTo(14, 19.5); x.closePath(); x.fill();
      x.fillStyle = '#6f747c';                                     // fins
      x.beginPath(); x.moveTo(40, 11); x.lineTo(50, 4); x.lineTo(50, 11); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(40, 21); x.lineTo(50, 28); x.lineTo(50, 21); x.closePath(); x.fill();
      var g = x.createLinearGradient(44, 0, 64, 0);                // exhaust
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(0.4, 'rgba(255,150,40,0.85)');
      g.addColorStop(1, 'rgba(255,80,10,0)');
      x.fillStyle = g; x.fillRect(44, 9, 20, 14);
      x.fillStyle = 'rgba(255,200,90,0.9)';
      x.beginPath(); x.ellipse(45, 16, 5, 5, 0, 0, TAU); x.fill();
    });
  }

  var cache = null;
  function gen() {
    if (cache) return cache;
    cache = {
      grunt: genGrunt(),
      imp: genImp(palImp),
      elite: genImp(palElite),
      baron: genImp(palBaron),
      pinky: genPinky(),
      fireball: [fireballFrame(20, 1.5), fireballFrame(23, 3)],
      rocket: genRocketSprite(),
      medkit: genMedkit(),
      ammo: genAmmo()
    };
    // publish the generated frames on the module itself (Spr.grunt, Spr.medkit, ...)
    for (var k in cache) api[k] = cache[k];
    return cache;
  }

  var api = { gen: gen, FOG_LEVELS: FOG_LEVELS, FOG_MAX: FOG_MAX };
  return api;
})();
