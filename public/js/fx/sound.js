// Festive sound effects synthesized with Web Audio (no audio files, no licensing).
import { storage } from '../util.js';

let ctx = null;
let enabled = storage('xmas-sound') === 'on';

export const soundEnabled = () => enabled;
export function setSound(on) {
  enabled = on;
  storage('xmas-sound', on ? 'on' : 'off');
  if (on) audio();
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function bell(freq, start, dur = 0.9, gain = 0.18) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + start;
  [1, 2.76, 5.4].forEach((mult, i) => {
    const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain / (i + 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (i + 1));
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur);
  });
}

const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5 };

export function playJingle() {
  if (!enabled) return;
  // Public-domain melody: "Jingle Bells" (James Lord Pierpont, 1857).
  const seq = [['E5', 0], ['E5', 0.2], ['E5', 0.4], ['E5', 0.75], ['E5', 0.95], ['E5', 1.15], ['E5', 1.5], ['G5', 1.7], ['C5', 1.9], ['D5', 2.1], ['E5', 2.3]];
  seq.forEach(([n, t]) => bell(N[n], t, 0.6));
}

export function playDrumroll(seconds = 1.6) {
  if (!enabled) return;
  const a = audio(); if (!a) return;
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) {
    const hit = (i % Math.floor(a.sampleRate / 28)) / (a.sampleRate / 28);
    d[i] = (Math.random() * 2 - 1) * Math.exp(-hit * 6) * (0.35 + 0.65 * (i / len));
  }
  const src = a.createBufferSource(); const f = a.createBiquadFilter(); const g = a.createGain();
  f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.5;
  src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start();
}

export function playDing() { if (enabled) { bell(N.C6, 0, 1.2, 0.2); bell(N.G5, 0.12, 1.2, 0.14); } }
export function playPop() { if (enabled) bell(N.A5, 0, 0.3, 0.12); }
export function playTada() { if (enabled) [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => bell(f, i * 0.09, 1.1, 0.16)); }
