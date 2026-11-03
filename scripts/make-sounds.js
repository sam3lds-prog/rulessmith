// Synthesizes the feedback sounds (original, generated here). Run: node scripts-make-sounds.js
const fs = require('fs');
const RATE = 22050;
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-1, Math.min(1, v)) * 32767 | 0, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
// A soft bell-like tone: sine plus a quiet octave, quick attack, exponential decay.
function tone(freq, ms, { amp = 0.35, decay = 6, glideTo } = {}) {
  const n = Math.round((RATE * ms) / 1000);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = glideTo ? freq + (glideTo - freq) * t : freq;
    phase += (2 * Math.PI * f) / RATE;
    const env = Math.min(1, i / (RATE * 0.004)) * Math.exp(-decay * t);
    out[i] = amp * env * (Math.sin(phase) + 0.25 * Math.sin(2 * phase));
  }
  return out;
}
function seq(parts, gapMs = 0) {
  const gap = Math.round((RATE * gapMs) / 1000);
  const len = parts.reduce((n, p, i) => Math.max(n, i * gap + p.length), 0);
  const out = new Float32Array(len);
  parts.forEach((p, i) => p.forEach((v, j) => (out[i * gap + j] += v)));
  return out;
}
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, F4 = 349.23;
const sounds = {
  tick: tone(1760, 45, { amp: 0.18, decay: 9 }),
  pop: tone(620, 110, { amp: 0.28, decay: 7, glideTo: 880 }),
  rise: seq([tone(C5, 220, { amp: 0.26 }), tone(G5, 320, { amp: 0.26 })], 110),
  note: seq([tone(A4, 260, { amp: 0.2, decay: 5 }), tone(F4, 300, { amp: 0.16, decay: 5 })], 120),
  chime: seq([tone(C5, 420), tone(E5, 420), tone(G5, 420), tone(C6, 700, { decay: 4 })], 140),
};
for (const [name, s] of Object.entries(sounds)) fs.writeFileSync(`assets/sounds/${name}.wav`, wav(Array.from(s)));
console.log(Object.keys(sounds).map((k) => `${k}: ${fs.statSync(`assets/sounds/${k}.wav`).size} bytes`).join('\n'));
