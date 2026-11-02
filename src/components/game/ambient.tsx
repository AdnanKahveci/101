"use client";
/**
 * Kıraathane radyosu: arka planda YouTube'dan istasyon çalar (ortam sesi, lofi, kullanıcının eklediği bağlantılar).
 * Ses dosyası barındırılmaz; resmi YouTube IFrame oynatıcısı küçük, görünür bir pencerede kullanılır.
 * Tarayıcılar sesli otomatik oynatmayı ilk dokunuşa kadar engellediği için gerekirse ilk tıklamada başlatılır.
 */
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { ChevronDown, Minus, Pause, Play, Plus, Radio, SkipBack, SkipForward, Trash2, Volume1, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

export interface Station {
  id: string;
  name: string;
  /** Tek video (canlı yayın da olabilir) */
  videoId?: string;
  /** YouTube oynatma listesi */
  listId?: string;
  custom?: boolean;
}

export const PRESET_STATIONS: Station[] = [
  { id: "kahve", name: "Kıraathane sesi", videoId: "YTe2xJY94_E" },
  { id: "ebru-slow", name: "Ebru Gündeş · Slow (2,5 saat)", videoId: "cYIODy9Rh2Q" },
  { id: "ebru-hits", name: "Ebru Gündeş · En iyiler (1,5 saat)", videoId: "oX7xMstNTm4" },
  { id: "ebru-mix", name: "Ebru Gündeş · Karışık liste", listId: "PL6t7KovGyC7OzKbRmP0DKcoe6XdICXSl2" },
  { id: "lofi", name: "Lofi (canlı)", videoId: "jfKfPfyJRdk" },
  { id: "synth", name: "Synthwave (canlı)", videoId: "4xDzrJKXOOY" },
];

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getPlayerState(): number;
  loadVideoById(id: string): void;
  loadPlaylist(opts: { list: string; listType: "playlist" }): void;
  setLoop(loop: boolean): void;
  getVideoData?: () => { title?: string };
  destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { PLAYING: number; ENDED: number } };
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

/** YouTube bağlantısından video / liste kimliğini çıkarır. Çıplak 11 karakterlik kimliği de kabul eder. */
export function parseYouTube(input: string): { videoId?: string; listId?: string } | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return { videoId: s };
  if (/^(PL|UU|OL|RD)[\w-]{10,}$/.test(s)) return { listId: s };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host !== "youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") return null;
  const listId = url.searchParams.get("list") ?? undefined;
  let videoId = url.searchParams.get("v") ?? undefined;
  if (host === "youtu.be") videoId = url.pathname.slice(1).split("/")[0];
  const m = url.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/);
  if (m) videoId = m[1];
  if (videoId && !/^[\w-]{11}$/.test(videoId)) videoId = undefined;
  // Liste varsa liste olarak çal (radyo gibi sırayla ilerler)
  if (listId) return { listId };
  return videoId ? { videoId } : null;
}

interface AmbientState {
  on: boolean;
  volume: number;
  mini: boolean;
  stationId: string;
  custom: Station[];
  init: () => void;
  setOn: (on: boolean) => void;
  setVolume: (v: number) => void;
  setMini: (m: boolean) => void;
  setStation: (id: string) => void;
  addCustom: (s: Omit<Station, "id" | "custom">) => Station;
  removeCustom: (id: string) => void;
}

export const useAmbient = create<AmbientState>((set, get) => ({
  on: false,
  volume: 30,
  mini: false,
  stationId: PRESET_STATIONS[0].id,
  custom: [],
  init: () =>
    set({
      on: readPref("okey:ambient", true),
      volume: readPref("okey:ambientVol", 30),
      mini: readPref("okey:ambientMini", false),
      stationId: readPref("okey:radioStation", PRESET_STATIONS[0].id),
      custom: readPref<Station[]>("okey:radioCustom", []).filter((s) => s && typeof s.id === "string" && (s.videoId || s.listId)),
    }),
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
  setStation: (stationId) => {
    writePref("okey:radioStation", stationId);
    set({ stationId, on: true });
    writePref("okey:ambient", true);
  },
  addCustom: (s) => {
    const station: Station = { ...s, id: `c${Date.now().toString(36)}`, custom: true };
    const custom = [...get().custom, station].slice(-12);
    writePref("okey:radioCustom", custom);
    set({ custom });
    return station;
  },
  removeCustom: (id) => {
    const custom = get().custom.filter((s) => s.id !== id);
    writePref("okey:radioCustom", custom);
    const patch: Partial<AmbientState> = { custom };
    if (get().stationId === id) {
      patch.stationId = PRESET_STATIONS[0].id;
      writePref("okey:radioStation", patch.stationId);
    }
    set(patch);
  },
}));

function allStations(custom: Station[]) {
  return [...PRESET_STATIONS, ...custom];
}

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

function loadStation(p: YTPlayer, st: Station) {
  if (st.listId) {
    p.loadPlaylist({ list: st.listId, listType: "playlist" });
    p.setLoop(true);
  } else if (st.videoId) {
    p.loadVideoById(st.videoId);
  }
}

/** Üst çubuktaki aç/kapa düğmesi. */
export function AmbientButton() {
  const on = useAmbient((s) => s.on);
  const setOn = useAmbient((s) => s.setOn);
  return (
    <button
      className={cn("rounded-lg p-1.5 hover:bg-white/10", on ? "text-gold" : "text-white/50")}
      aria-label={on ? "Radyoyu kapat" : "Radyoyu aç"}
      title="Kıraathane radyosu"
      data-testid="ambient-toggle"
      onClick={() => setOn(!on)}
    >
      <Radio className="h-4 w-4" />
    </button>
  );
}

/** Radyo penceresi. `muted` = oyun sesleri kapalıyken radyo da susar. */
export function AmbientPlayer({ muted }: { muted: boolean }) {
  const { on, volume, mini, stationId, custom, init, setOn, setVolume, setMini, setStation, addCustom, removeCustom } = useAmbient();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [title, setTitle] = useState("");
  const [menu, setMenu] = useState(false);
  const [link, setLink] = useState("");
  const active = on && !muted;
  const stations = allStations(custom);
  const station = stations.find((s) => s.id === stationId) ?? stations[0];
  const stationRef = useRef(station);
  stationRef.current = station;

  useEffect(() => init(), [init]);

  const step = (dir: 1 | -1) => {
    const i = stations.findIndex((s) => s.id === station.id);
    setStation(stations[(i + dir + stations.length) % stations.length].id);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // Oynatıcıyı yalnızca ilk açılışta oluştur
  useEffect(() => {
    if (!active || player.current || !host.current) return;
    let cancelled = false;
    const el = document.createElement("div");
    host.current.appendChild(el);
    const first = stationRef.current;
    void loadYT().then((YT) => {
      if (cancelled) return;
      loaded.current = first.id;
      player.current = new YT.Player(el, {
        videoId: first.videoId,
        width: 220,
        height: 124,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          ...(first.listId ? { listType: "playlist", list: first.listId, loop: 1 } : {}),
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: { data: number }) => {
            const p = player.current;
            if (!p) return;
            if (e.data === YT.PlayerState.PLAYING) {
              setTitle(p.getVideoData?.()?.title ?? "");
              setBlocked(false);
            }
            // Tek video bitince başa sar (döngü)
            if (e.data === YT.PlayerState.ENDED && !stationRef.current.listId) {
              p.seekTo(0, true);
              p.playVideo();
            }
          },
          onError: () => {
            toast.error(`"${stationRef.current.name}" çalınamadı, sonraki istasyona geçiliyor.`);
            stepRef.current(1);
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => () => player.current?.destroy(), []);

  // İstasyon değişti
  useEffect(() => {
    const p = player.current;
    if (!ready || !p || loaded.current === station.id) return;
    loaded.current = station.id;
    setTitle("");
    setPaused(false);
    loadStation(p, station);
  }, [ready, station]);

  // Oynat / duraklat / ses düzeyi
  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    p.setVolume(volume);
  }, [ready, volume]);

  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    if (!active || paused) {
      p.pauseVideo();
      setBlocked(false);
      return;
    }
    p.playVideo();
    // Otomatik oynatma engellendiyse ilk dokunuşta başlat
    const t = setTimeout(() => {
      if (p.getPlayerState() !== window.YT?.PlayerState.PLAYING) setBlocked(true);
    }, 2000);
    return () => clearTimeout(t);
  }, [ready, active, paused, station.id]);

  useEffect(() => {
    if (!blocked) return;
    const start = () => {
      player.current?.playVideo();
      setBlocked(false);
    };
    window.addEventListener("pointerdown", start, { once: true });
    return () => window.removeEventListener("pointerdown", start);
  }, [blocked]);

  const submitLink = () => {
    const parsed = parseYouTube(link);
    if (!parsed) {
      toast.error("Geçerli bir YouTube video ya da oynatma listesi bağlantısı girin.");
      return;
    }
    const name = parsed.listId ? `Liste ${custom.length + 1}` : `Kanal ${custom.length + 1}`;
    const st = addCustom({ name, ...parsed });
    setStation(st.id);
    setLink("");
    setMenu(false);
  };

  const iconBtn = "rounded p-1 hover:bg-white/10 disabled:opacity-40";

  return (
    <div
      className={cn(
        "ambient-card fixed bottom-2 left-2 z-40 w-[220px] overflow-hidden rounded-xl transition-opacity",
        active ? "opacity-100" : "pointer-events-none -z-10 opacity-0",
      )}
      aria-label="Kıraathane radyosu"
      data-testid="ambient-player"
    >
      <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px] text-white/80">
        <span className={cn("radio-led", active && !paused && !blocked && "radio-led-on")} aria-hidden />
        <button
          className="flex min-w-0 flex-1 items-center gap-0.5 rounded px-0.5 text-left font-bold hover:bg-white/10"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label="İstasyon seç"
          data-testid="radio-station"
        >
          <span className="truncate">{blocked ? "Başlatmak için dokunun" : station.name}</span>
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", menu && "rotate-180")} />
        </button>
        <button className={iconBtn} aria-label={mini ? "Büyüt" : "Küçült"} onClick={() => setMini(!mini)}>
          <Minus className="h-3 w-3" />
        </button>
        <button className={iconBtn} aria-label="Radyoyu kapat" onClick={() => setOn(false)}>
          <X className="h-3 w-3" />
        </button>
      </div>
      {title && !menu && !mini && <div className="truncate px-2 text-[9px] text-white/45" title={title}>{title}</div>}

      {menu && (
        <div className="mx-1.5 mt-1 max-h-48 overflow-y-auto rounded-lg bg-black/40 p-1 text-[11px]" role="listbox" aria-label="İstasyonlar">
          {stations.map((s) => (
            <div key={s.id} className="flex items-center">
              <button
                role="option"
                aria-selected={s.id === station.id}
                className={cn("flex-1 truncate rounded px-1.5 py-1 text-left hover:bg-white/10", s.id === station.id ? "font-bold text-gold" : "text-white/80")}
                onClick={() => {
                  setStation(s.id);
                  setMenu(false);
                }}
              >
                {s.name}
              </button>
              {s.custom && (
                <button className={iconBtn} aria-label={`${s.name} istasyonunu sil`} onClick={() => removeCustom(s.id)}>
                  <Trash2 className="h-3 w-3 text-white/50" />
                </button>
              )}
            </div>
          ))}
          <form
            className="mt-1 flex items-center gap-1 border-t border-white/10 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              submitLink();
            }}
          >
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="YouTube bağlantısı yapıştır"
              className="min-w-0 flex-1 rounded bg-white/10 px-1.5 py-1 text-[10px] text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-gold/60"
              aria-label="YouTube bağlantısı"
              data-testid="radio-link"
            />
            <button type="submit" className={iconBtn} aria-label="İstasyon ekle" disabled={!link.trim()}>
              <Plus className="h-3.5 w-3.5 text-gold" />
            </button>
          </form>
        </div>
      )}

      <div className="flex items-center gap-1 px-1.5 py-1 text-white/80">
        <button className={iconBtn} aria-label="Önceki istasyon" onClick={() => step(-1)}>
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          className="grid h-6 w-6 place-items-center rounded-full bg-gold/90 text-felt-950 hover:bg-gold"
          aria-label={paused ? "Çal" : "Duraklat"}
          onClick={() => (blocked ? (player.current?.playVideo(), setBlocked(false)) : setPaused(!paused))}
        >
          {paused || blocked ? <Play className="h-3.5 w-3.5 translate-x-px" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button className={iconBtn} aria-label="Sonraki istasyon" onClick={() => step(1)}>
          <SkipForward className="h-3.5 w-3.5" />
        </button>
        <Volume1 className="ml-auto h-3 w-3 text-white/50" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1 w-16 accent-[#f2c14e]"
          aria-label="Radyo ses düzeyi"
        />
      </div>
      <div ref={host} className={cn("overflow-hidden transition-[height]", mini ? "h-[36px]" : "h-[124px]")} />
    </div>
  );
}
