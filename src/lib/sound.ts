"use client";
/** Varlık dosyası gerektirmeyen küçük ses efektleri (WebAudio). */
let ctx: AudioContext | null = null;
let enabled = true;

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

export function play(kind: "tile" | "turn" | "win" | "error") {
  if (!soundEnabled() || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const freq = { tile: 520, turn: 780, win: 990, error: 180 }[kind];
    o.type = kind === "tile" ? "triangle" : "sine";
    o.frequency.setValueAtTime(freq, t);
    if (kind === "win") o.frequency.exponentialRampToValueAtTime(1480, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "win" ? 0.5 : 0.12));
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.6);
  } catch {}
}
