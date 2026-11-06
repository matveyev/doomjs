'use strict';
/* Procedural sound — everything synthesized with WebAudio, no samples.
 * Audio context is created on the first user gesture (click). */
var Snd = (function () {
  var ctx = null, master = null, noiseBuf = null, droneNodes = null, muted = false;

  function init() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 8;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp);
    // 1s of white noise, reused by every noise-based sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function osc(type, f0, f1, dur, vol, when, dest) {
    var t = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, fType, f0, f1, when, q) {
    var t = ctx.currentTime + (when || 0);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var fl = ctx.createBiquadFilter();
    fl.type = fType; fl.Q.value = q || 0.8;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function ok() { return ctx && !muted; }

  var growlBase = { grunt: [170, 110], imp: [130, 70], elite: [80, 44], pinky: [95, 55] };

  return {
    init: init,
    resume: resume,
    setMute: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; },
    isMuted: function () { return muted; },

    shotgun: function () { if (!ok()) return;
      noise(0.32, 0.9, 'lowpass', 4200, 320);
      osc('sine', 110, 50, 0.16, 0.8);
      noise(0.1, 0.35, 'highpass', 2500, 4000);          // crack
    },
    pump: function () { if (!ok()) return;
      noise(0.04, 0.3, 'bandpass', 900, 900, 0);
      noise(0.05, 0.35, 'bandpass', 620, 620, 0.13);
    },
    pistol: function () { if (!ok()) return;
      noise(0.09, 0.55, 'lowpass', 3200, 700);
      osc('sine', 150, 80, 0.07, 0.5);
    },
    rifle: function () { if (!ok()) return;
      noise(0.05, 0.42, 'highpass', 1800, 3600);
      osc('square', 260, 105, 0.045, 0.22);
    },
    rocket: function () { if (!ok()) return;               // launch "thoomp"
      osc('sine', 150, 55, 0.3, 0.7);
      noise(0.3, 0.5, 'lowpass', 1400, 250);
      noise(0.08, 0.3, 'highpass', 1500, 3000);
    },
    rocketBoom: function () { if (!ok()) return;           // big impact
      noise(0.5, 0.75, 'lowpass', 800, 90);
      osc('sine', 95, 28, 0.45, 0.75);
      osc('sine', 50, 24, 0.5, 0.5, 0.05);
    },
    click: function () { if (!ok()) return;
      osc('square', 900, 500, 0.03, 0.15);
      noise(0.02, 0.15, 'highpass', 3000, 3000);
    },
    fire: function () { if (!ok()) return;               // fireball thrown
      noise(0.28, 0.3, 'bandpass', 380, 1100, 0, 2);
    },
    boom: function () { if (!ok()) return;               // fireball impact
      noise(0.34, 0.5, 'lowpass', 900, 140);
      osc('sine', 75, 38, 0.3, 0.6);
    },
    growl: function (type, mode) { if (!ok()) return;
      var b = growlBase[type] || growlBase.imp;
      if (mode === 'die') {
        osc('sawtooth', b[0], b[1] * 0.55, 0.55, 0.4);
        osc('sawtooth', b[0] * 1.02, b[1] * 0.5, 0.55, 0.3);
        noise(0.22, 0.4, 'lowpass', 800, 200, 0.35);     // wet splat
      } else if (mode === 'pain') {
        osc('sawtooth', b[0] * 1.4, b[0] * 1.8, 0.12, 0.3);
      } else {                                           // alert
        osc('sawtooth', b[0], b[1], 0.4, 0.42);
        osc('sawtooth', b[0] * 1.03, b[1] * 1.05, 0.4, 0.3);
      }
    },
    hurt: function () { if (!ok()) return;
      osc('square', 200, 95, 0.2, 0.35);
      noise(0.12, 0.25, 'lowpass', 1200, 400);
    },
    gib: function () { if (!ok()) return;
      noise(0.3, 0.5, 'lowpass', 600, 150);
      osc('sine', 160, 45, 0.25, 0.4);
    },
    pickup: function () { if (!ok()) return;
      osc('triangle', 520, 520, 0.07, 0.3);
      osc('triangle', 780, 780, 0.1, 0.3, 0.08);
    },
    startDrone: function () {
      if (!ctx || droneNodes) return;
      var g = ctx.createGain(); g.gain.value = 0.045;
      var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 220;
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      var o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.8;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      var lfoG = ctx.createGain(); lfoG.gain.value = 90;
      lfo.connect(lfoG); lfoG.connect(fl.frequency);
      o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(master);
      o1.start(); o2.start(); lfo.start();
      droneNodes = [o1, o2, lfo, g];
    }
  };
})();
