"use client";
/**
 * Varlık dosyası gerektirmeyen ses efektleri (WebAudio ile sentezlenir).
 * Taş sesleri: kısa, filtrelenmiş gürültü patlamaları + rezonans → ahşap/bakalit "tık" hissi.
 */
let ctx: AudioContext | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;

export type SoundKind = "tile" | "draw" | "take" | "discard" | "open" | "turn" | "win" | "error" | "select";

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem("okey:sound", v ? "1" : "0");
  } catch {}
}
export function soundEnabled() {
  try {
    const v = localStorage.getItem("okey:sound");
    if (v !== null) enabled = v === "1";
  } catch {}
  return enabled;
}

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Sert yüzeye taş vuruşu. */
function clack(at: number, { freq = 2400, gain = 0.5, decay = 0.05, q = 6 } = {}) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at);
  src.stop(at + decay + 0.02);
  // Gövde rezonansı
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq / 6, at);
  o.frequency.exponentialRampToValueAtTime(freq / 9, at + decay);
  og.gain.setValueAtTime(gain * 0.35, at);
  og.gain.exponentialRampToValueAtTime(0.0001, at + decay * 1.4);
  o.connect(og).connect(c.destination);
  o.start(at);
  o.stop(at + decay * 1.5 + 0.02);
}

/** Keçe üzerinde kayma (hışırtı). */
function slide(at: number, dur = 0.22, gain = 0.12) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(700, at);
  f.frequency.linearRampToValueAtTime(1800, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(at);
  src.stop(at + dur + 0.02);
}

function tone(at: number, freq: number, dur: number, gain = 0.15, type: OscillatorType = "sine", to?: number) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export function play(kind: SoundKind | "tile") {
  if (typeof window === "undefined" || !soundEnabled()) return;
  try {
    const t = audio().currentTime + 0.005;
    switch (kind) {
      case "select":
        clack(t, { freq: 3200, gain: 0.18, decay: 0.03 });
        break;
      case "tile":
        clack(t, { freq: 2600, gain: 0.3, decay: 0.04 });
        break;
      case "draw":
        // Desteden çekip ıstakaya koyma: kayma + iki tık
        slide(t, 0.2, 0.1);
        clack(t + 0.22, { freq: 2200, gain: 0.45, decay: 0.05 });
        clack(t + 0.27, { freq: 3000, gain: 0.2, decay: 0.03 });
        break;
      case "take":
        clack(t, { freq: 2800, gain: 0.35, decay: 0.04 });
        slide(t + 0.03, 0.18, 0.1);
        clack(t + 0.24, { freq: 2100, gain: 0.45, decay: 0.05 });
        break;
      case "discard":
        clack(t, { freq: 1900, gain: 0.6, decay: 0.07, q: 4 });
        clack(t + 0.06, { freq: 2600, gain: 0.15, decay: 0.03 });
        break;
      case "open":
        for (let i = 0; i < 6; i++) clack(t + i * 0.055, { freq: 2000 + (i % 3) * 300, gain: 0.35, decay: 0.045 });
        tone(t + 0.36, 660, 0.18, 0.08, "triangle");
        tone(t + 0.45, 880, 0.25, 0.08, "triangle");
        break;
      case "turn":
        tone(t, 880, 0.12, 0.12);
        tone(t + 0.12, 1175, 0.2, 0.1);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, f, 0.35, 0.12, "triangle"));
        break;
      case "error":
        tone(t, 220, 0.18, 0.15, "square", 160);
        break;
    }
  } catch {}
}
