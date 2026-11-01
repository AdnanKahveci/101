"use client";
/**
 * Kıraathane ortam sesi: arka planda YouTube'daki "Kahve sesi" kaydı döngüde çalar.
 * Ses dosyası barındırılmaz; resmi YouTube IFrame oynatıcısı küçük, görünür bir pencerede kullanılır.
 * Tarayıcılar sesli otomatik oynatmayı ilk dokunuşa kadar engellediği için ilk tıklamada başlatılır.
 */
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Coffee, Minus, Volume1, X } from "lucide-react";
import { cn } from "@/lib/utils";

const VIDEO_ID = "YTe2xJY94_E";

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(v: number): void;
  getPlayerState(): number;
  destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { PLAYING: number } };
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

interface AmbientState {
  on: boolean;
  volume: number;
  mini: boolean;
  init: () => void;
  setOn: (on: boolean) => void;
  setVolume: (v: number) => void;
  setMini: (m: boolean) => void;
}

export const useAmbient = create<AmbientState>((set) => ({
  on: false,
  volume: 30,
  mini: false,
  init: () => set({ on: readPref("okey:ambient", true), volume: readPref("okey:ambientVol", 30), mini: readPref("okey:ambientMini", false) }),
  setOn: (on) => {
    writePref("okey:ambient", on);
    set({ on });
  },
  setVolume: (volume) => {
    writePref("okey:ambientVol", volume);
    set({ volume });
  },
  setMini: (mini) => {
    writePref("okey:ambientMini", mini);
    set({ mini });
  },
}));

let apiPromise: Promise<YTNamespace> | null = null;
function loadYT(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Üst çubuktaki aç/kapa düğmesi. */
export function AmbientButton() {
  const on = useAmbient((s) => s.on);
  const setOn = useAmbient((s) => s.setOn);
  return (
    <button
      className={cn("rounded-lg p-1.5 hover:bg-white/10", on ? "text-gold" : "text-white/50")}
      aria-label={on ? "Kıraathane ortam sesini kapat" : "Kıraathane ortam sesini aç"}
      title="Kıraathane ortam sesi"
      data-testid="ambient-toggle"
      onClick={() => setOn(!on)}
    >
      <Coffee className="h-4 w-4" />
    </button>
  );
}

/** Oynatıcı penceresi. `muted` = oyun sesleri kapalıyken ortam sesi de susar. */
export function AmbientPlayer({ muted }: { muted: boolean }) {
  const { on, volume, mini, init, setOn, setVolume, setMini } = useAmbient();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const active = on && !muted;

  useEffect(() => init(), [init]);

  // Oynatıcıyı yalnızca ilk açılışta oluştur
  useEffect(() => {
    if (!active || player.current || !host.current) return;
    let cancelled = false;
    const el = document.createElement("div");
    host.current.appendChild(el);
    void loadYT().then((YT) => {
      if (cancelled) return;
      player.current = new YT.Player(el, {
        videoId: VIDEO_ID,
        width: 200,
        height: 113,
        playerVars: { autoplay: 1, loop: 1, playlist: VIDEO_ID, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            setReady(true);
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => () => player.current?.destroy(), []);

  // Oynat / duraklat / ses düzeyi
  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    p.setVolume(volume);
    if (!active) {
      p.pauseVideo();
      setBlocked(false);
      return;
    }
    p.playVideo();
    // Otomatik oynatma engellendiyse ilk dokunuşta başlat
    const t = setTimeout(() => {
      if (p.getPlayerState() !== window.YT?.PlayerState.PLAYING) setBlocked(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [ready, active, volume]);

  useEffect(() => {
    if (!blocked) return;
    const start = () => {
      player.current?.playVideo();
      setBlocked(false);
    };
    window.addEventListener("pointerdown", start, { once: true });
    return () => window.removeEventListener("pointerdown", start);
  }, [blocked]);

  return (
    <div
      className={cn(
        "ambient-card fixed bottom-2 left-2 z-40 overflow-hidden rounded-xl transition-opacity",
        active ? "opacity-100" : "pointer-events-none -z-10 opacity-0",
      )}
      aria-label="Kıraathane ortam sesi"
      data-testid="ambient-player"
    >
      <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-white/80">
        <Coffee className="h-3 w-3 text-gold" />
        <span className="flex-1 font-bold">{blocked ? "Başlatmak için dokunun" : "Kıraathane sesi"}</span>
        <Volume1 className="h-3 w-3 text-white/50" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1 w-14 accent-[#f2c14e]"
          aria-label="Ortam sesi düzeyi"
        />
        <button className="rounded p-0.5 hover:bg-white/10" aria-label={mini ? "Büyüt" : "Küçült"} onClick={() => setMini(!mini)}>
          <Minus className="h-3 w-3" />
        </button>
        <button className="rounded p-0.5 hover:bg-white/10" aria-label="Ortam sesini kapat" onClick={() => setOn(false)}>
          <X className="h-3 w-3" />
        </button>
      </div>
      <div ref={host} className={cn("origin-top-left overflow-hidden transition-[height]", mini ? "h-[56px] w-[200px]" : "h-[113px] w-[200px]")} />
    </div>
  );
}
