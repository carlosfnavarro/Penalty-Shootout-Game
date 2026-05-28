import { Platform } from "react-native";

/* ── Web Audio API sound engine (web only) ──────────────────────────────────
   On native the functions are no-ops; haptics in index.tsx cover tactile fb.
   ─────────────────────────────────────────────────────────────────────────── */

type ACtx = {
  sampleRate: number;
  currentTime: number;
  state: string;
  destination: any;
  resume(): Promise<void>;
  createOscillator(): any;
  createGain(): any;
  createBuffer(ch: number, len: number, sr: number): any;
  createBufferSource(): any;
  createDynamicsCompressor(): any;
};

let _ctx: ACtx | null = null;

function ctx(): ACtx | null {
  if (Platform.OS !== "web") return null;
  if (!_ctx) {
    try {
      const W = window as any;
      _ctx = new (W.AudioContext || W.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (_ctx && _ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

// ─── master compressor (prevents clipping) ───────────────────────────────────
let _comp: any = null;
function dest() {
  const c = ctx();
  if (!c) return null;
  if (!_comp) {
    _comp = c.createDynamicsCompressor();
    _comp.threshold.value = -12;
    _comp.ratio.value = 6;
    _comp.connect(c.destination);
  }
  return _comp;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function tone(
  freq: number,
  dur: number,
  vol: number,
  type: string = "sine",
  startOffset = 0
) {
  const c = ctx();
  const d = dest();
  if (!c || !d) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(d);
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffset;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  g.gain.setValueAtTime(vol, t0 + Math.max(0.015, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
}

function noise(dur: number, vol: number, startOffset = 0) {
  const c = ctx();
  const d = dest();
  if (!c || !d) return;
  const sr = c.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / len) * 12) * vol;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  src.connect(g);
  g.connect(d);
  g.gain.value = 1;
  src.start(c.currentTime + startOffset);
}

// ─── crowd ambient (looping) ─────────────────────────────────────────────────
let _crowdSrc: any = null;
let _crowdGain: any = null;

function buildCrowdBuffer(): any {
  const c = ctx();
  if (!c) return null;
  const sr = c.sampleRate;
  const len = Math.floor(sr * 4); // 4-second loop
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const FREQS = [82, 97, 113, 128, 144, 163]; // crowd harmonics
  const BOMBO = 2.18; // beats/sec (Argentine bombo drum)
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let s = 0;
    for (const f of FREQS) {
      s += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 0.27 * t) * 0.6) * 0.07;
    }
    // crowd murmur noise
    s += (Math.random() * 2 - 1) * 0.06;
    // bombo thump
    const bp = (t * BOMBO) % 1;
    if (bp < 0.18) s += Math.exp((-bp / 0.18) * 6) * 0.28;
    // chant rhythm modulation (Ar-gen-ti-na pulse)
    const chantEnv = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
    data[i] = s * chantEnv;
  }
  return buf;
}

export function startCrowd() {
  const c = ctx();
  const d = dest();
  if (!c || !d) return;
  stopCrowd();
  const buf = buildCrowdBuffer();
  if (!buf) return;
  _crowdSrc = c.createBufferSource();
  _crowdSrc.buffer = buf;
  _crowdSrc.loop = true;
  _crowdGain = c.createGain();
  _crowdGain.gain.value = 0;
  _crowdSrc.connect(_crowdGain);
  _crowdGain.connect(d);
  _crowdSrc.start();
  // fade in
  _crowdGain.gain.linearRampToValueAtTime(0.38, c.currentTime + 1.2);
}

export function stopCrowd() {
  if (_crowdSrc) {
    try { _crowdSrc.stop(); } catch {}
    _crowdSrc = null;
  }
  _crowdGain = null;
}

export function bumpCrowd(factor: number, dur = 2.5) {
  const c = ctx();
  if (!c || !_crowdGain) return;
  const base = 0.38;
  _crowdGain.gain.cancelScheduledValues(c.currentTime);
  _crowdGain.gain.setValueAtTime(_crowdGain.gain.value, c.currentTime);
  _crowdGain.gain.linearRampToValueAtTime(base * factor, c.currentTime + 0.25);
  _crowdGain.gain.linearRampToValueAtTime(base, c.currentTime + dur);
}

// ─── kick sound ──────────────────────────────────────────────────────────────
export function playKick() {
  noise(0.12, 1.0);
  tone(65, 0.18, 0.55); // low thud
}

// ─── goal celebration ─────────────────────────────────────────────────────────
export function playGol() {
  // Rising chords
  const chordFreqs = [220, 277, 330, 440, 554, 660];
  chordFreqs.forEach((f, i) => {
    tone(f, 2.2, 0.22, "sawtooth", i * 0.05);
    tone(f * 2, 1.8, 0.1, "square", i * 0.05 + 0.1);
  });
  // Crowd explosion noise
  const c = ctx();
  const d = dest();
  if (c && d) {
    const sr = c.sampleRate;
    const len = Math.floor(sr * 2.5);
    const buf = c.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / (sr * 0.08)) * Math.exp(-i / len * 2.5);
      data[i] = (Math.random() * 2 - 1) * env * 0.7;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    src.connect(g);
    g.connect(d);
    g.gain.value = 1;
    src.start(c.currentTime);
  }
  // Pump crowd volume way up
  bumpCrowd(2.2, 3.5);
}

// ─── saved / miss ─────────────────────────────────────────────────────────────
export function playSaved() {
  const c = ctx();
  const d = dest();
  if (!c || !d) return;
  // Descending "ohhhh"
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(d);
  osc.type = "sine";
  osc.frequency.setValueAtTime(380, c.currentTime);
  osc.frequency.linearRampToValueAtTime(160, c.currentTime + 1.1);
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.3, c.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.3);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 1.4);
  noise(0.2, 0.3);
  bumpCrowd(1.4, 1.8);
}

// ─── whistle (start of game/turn) ────────────────────────────────────────────
export function playWhistle() {
  // Short referee whistle: two blasts
  tone(2700, 0.18, 0.25, "sine", 0);
  tone(2700, 0.22, 0.25, "sine", 0.25);
}

// ─── resume audio context on user gesture ────────────────────────────────────
export function resumeAudio() {
  ctx(); // initialises and resumes if suspended
}
