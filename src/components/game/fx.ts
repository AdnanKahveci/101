"use client";
/**
 * Masa efektleri: taşların desteden/yandan ıstakaya, ıstakadan atma alanına "uçması",
 * masa ortasında kısa açıklama yazısı ve sesler. Sunucudan gelen iki görünüm arasındaki
 * farktan (deste sayısı, atılan taş yığınları, açılışlar) türetilir; ek protokol gerekmez.
 */
import { create } from "zustand";
import { COLOR_LABELS, prevSeat, type Seat, type Tile, type TileId } from "@/engine";
import type { ClientGameView } from "@/server/game-service";
import { play } from "@/lib/sound";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Flight {
  id: number;
  /** null → ters (arkası görünen) taş */
  tile: Tile | null;
  from: Rect;
  to: Rect;
  /** Uçuş sırasında ters taştan yüzüne döner */
  flip: boolean;
  hideId?: TileId;
  duration: number;
}

interface FxStore {
  flights: Flight[];
  hidden: TileId[];
  /** Masaya yeni konan taşlar (kısa süre vurgulanır: "taş buraya işlendi") */
  recent: TileId[];
  flash: (ids: TileId[]) => void;
  caption: { id: number; text: string; tone: "info" | "good" | "warn" } | null;
  add: (f: Omit<Flight, "id">) => void;
  done: (id: number) => void;
  hide: (ids: TileId[]) => void;
  unhide: (ids: TileId[]) => void;
  say: (text: string, tone?: "info" | "good" | "warn") => void;
  clear: () => void;
}

let seq = 1;
let captionTimer: ReturnType<typeof setTimeout> | null = null;

export const useFx = create<FxStore>((set, get) => ({
  flights: [],
  hidden: [],
  recent: [],
  flash: (ids) => {
    set({ recent: [...new Set([...get().recent, ...ids])] });
    setTimeout(() => set({ recent: get().recent.filter((x) => !ids.includes(x)) }), 2200);
  },
  caption: null,
  add: (f) => set({ flights: [...get().flights, { ...f, id: seq++ }] }),
  done: (id) => {
    const f = get().flights.find((x) => x.id === id);
    set({
      flights: get().flights.filter((x) => x.id !== id),
      hidden: f?.hideId ? get().hidden.filter((h) => h !== f.hideId) : get().hidden,
    });
  },
  hide: (ids) => set({ hidden: [...new Set([...get().hidden, ...ids])] }),
  unhide: (ids) => set({ hidden: get().hidden.filter((h) => !ids.includes(h)) }),
  say: (text, tone = "info") => {
    const id = seq++;
    set({ caption: { id, text, tone } });
    if (captionTimer) clearTimeout(captionTimer);
    captionTimer = setTimeout(() => {
      if (get().caption?.id === id) set({ caption: null });
    }, 2600);
  },
  clear: () => set({ flights: [], hidden: [], recent: [], caption: null }),
}));

export function rectOf(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Bir dikdörtgenin merkezine yerleştirilmiş, verilen boyutta dikdörtgen. */
function centered(r: Rect, w: number, h: number): Rect {
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}

const tileRect = (sel: string) => rectOf(`[data-tile-id="${sel}"]`);
const name = (v: ClientGameView, s: Seat) => (s === v.mySeat ? "Siz" : (v.players.find((p) => p.seat === s)?.displayName ?? "Oyuncu"));
export const describe = (t: Tile) => (t.isFakeJoker ? "Sahte okey" : `${COLOR_LABELS[t.color!]} ${t.value}`);

/**
 * İki görünüm arasındaki farkı canlandırır. setView içinde, yeni görünüm React'e verilmeden ÖNCE çağrılır
 * (ıstakadan atılan taşın eski konumu DOM'dan okunabilsin diye); hedef konumlar bir kare sonra ölçülür.
 * `opts.skipDrawFlight`: oyuncu taşı sürükleyerek ıstakaya koyduysa uçuş gösterilmez.
 */
export function animateTransition(prev: ClientGameView, v: ClientGameView, opts: { skipDrawFlight?: boolean } = {}) {
  const fx = useFx.getState();
  if (prev.matchId !== v.matchId || prev.hand.handNumber !== v.hand.handNumber) {
    fx.clear();
    return;
  }
  if (v.version <= prev.version) return;
  const big = v.version - prev.version > 4; // yeniden bağlanma vb. – yalnızca ses, uçuş yok
  const me = v.mySeat;
  const actor = prev.hand.currentTurn;
  const pending: (() => void)[] = [];
  const toHide: TileId[] = [];
  const TILE_W = 44;
  const TILE_H = 60;

  // 1) Desteden çekme
  if (v.hand.drawPileCount < prev.hand.drawPileCount && prev.phase === "playing") {
    play("draw");
    if (actor === me) {
      fx.say("Ortadan taş çektiniz");
      const id = v.hand.myDrawnTileId;
      const tile = id ? v.myHand.find((t) => t.id === id) : null;
      if (tile && !big && !opts.skipDrawFlight) {
        toHide.push(tile.id);
        pending.push(() => {
          const from = rectOf('[data-anchor="deck"]');
          const to = tileRect(tile.id) ?? rectOf(`[data-slot]`);
          if (from && to) fx.add({ tile, from: centered(from, to.w, to.h), to, flip: true, hideId: tile.id, duration: 0.6 });
          else fx.unhide([tile.id]);
        });
      }
    } else {
      fx.say(`${name(v, actor)} ortadan çekti`);
      if (!big)
        pending.push(() => {
          const from = rectOf('[data-anchor="deck"]');
          const to = rectOf(`[data-anchor="seat-${actor}"]`);
          if (from && to) fx.add({ tile: null, from: centered(from, TILE_W * 0.8, TILE_H * 0.8), to: centered(to, TILE_W * 0.6, TILE_H * 0.6), flip: false, duration: 0.55 });
        });
    }
  }

  // 2) Yandan alma
  const src = prevSeat(actor);
  if (v.hand.discards[src].length < prev.hand.discards[src].length) {
    const tile = prev.hand.discards[src][prev.hand.discards[src].length - 1];
    play("take");
    fx.say(actor === me ? `Yandan aldınız: ${describe(tile)}` : `${name(v, actor)} yandan aldı: ${describe(tile)}`, "warn");
    if (!big) {
      const from = rectOf(`[data-anchor="discard-${src}"] [data-tile-id="${tile.id}"]`) ?? rectOf(`[data-anchor="discard-${src}"]`);
      if (actor === me && !opts.skipDrawFlight) {
        toHide.push(tile.id);
        pending.push(() => {
          const to = tileRect(tile.id);
          if (from && to) fx.add({ tile, from, to, flip: false, hideId: tile.id, duration: 0.5 });
          else fx.unhide([tile.id]);
        });
      } else if (actor !== me) {
        pending.push(() => {
          const to = rectOf(`[data-anchor="seat-${actor}"]`);
          if (from && to) fx.add({ tile, from, to: centered(to, from.w * 0.7, from.h * 0.7), flip: false, duration: 0.5 });
        });
      }
    }
  }

  // 3) Taş atma / geri bırakma (yığın büyüdü)
  for (const s of [0, 1, 2, 3] as Seat[]) {
    const before = prev.hand.discards[s].length;
    const after = v.hand.discards[s];
    if (after.length <= before) continue;
    const tile = after[after.length - 1];
    play("discard");
    if (big) continue;
    // Atan oyuncu: kendi yığını s; geri bırakmada yığının sahibi s ama taşı bırakan "actor".
    const thrower = s === actor ? s : actor;
    const from = thrower === me ? tileRect(tile.id) : null; // eski DOM'dan, React güncellemeden önce
    toHide.push(tile.id);
    pending.push(() => {
      const to = rectOf(`[data-anchor="discard-${s}"] [data-tile-id="${tile.id}"]`) ?? rectOf(`[data-anchor="discard-${s}"]`);
      const start = from ?? (() => {
        const seat = rectOf(`[data-anchor="seat-${thrower}"]`);
        return seat && to ? centered(seat, to.w * 0.7, to.h * 0.7) : null;
      })();
      if (start && to) fx.add({ tile, from: start, to, flip: thrower !== me, hideId: tile.id, duration: 0.45 });
      else fx.unhide([tile.id]);
    });
  }

  // 4) Açılış / per işleme
  for (const p of v.players) {
    const was = prev.players.find((x) => x.seat === p.seat)?.opened;
    if (!was && p.opened) {
      play("open");
      const n = name(v, p.seat);
      fx.say(
        p.opened.kind === "pairs" ? `${n} ${p.opened.value} çiftle açtı!` : `${n} ${p.opened.value} puanla seri açtı!`,
        "good",
      );
    }
  }
  // Masaya yeni giren taşları vurgula (işleme/açılış/okey değiştirme)
  const tableIds = (x: ClientGameView) => new Set([...x.hand.melds.flatMap((m) => m.cells.map((c) => c.tileId)), ...x.hand.pairs.flatMap((p) => p.tileIds)]);
  const beforeIds = tableIds(prev);
  const added = [...tableIds(v)].filter((id) => !beforeIds.has(id));
  if (added.length && added.length <= 4) fx.flash(added);
  const meldTiles = (x: ClientGameView) => x.hand.melds.reduce((n, m) => n + m.cells.length, 0) + x.hand.pairs.length * 2;
  if (meldTiles(v) > meldTiles(prev) && v.players.every((p) => !!p.opened === !!prev.players.find((x) => x.seat === p.seat)?.opened)) play("tile");

  if (v.hand.indicatorTakenBy !== null && prev.hand.indicatorTakenBy === null) {
    play("take");
    fx.say(v.hand.indicatorTakenBy === me ? "Göstergeyi aldınız" : `${name(v, v.hand.indicatorTakenBy)} göstergeyi çift için aldı`, "warn");
  } else if (v.hand.indicatorTakenBy === null && prev.hand.indicatorTakenBy !== null) {
    play("discard");
    fx.say(`${name(v, prev.hand.indicatorTakenBy)} göstergeyi geri bıraktı`);
  }

  // Cezalar (işlek taş, okey atma, yandan alınan taşın kullanılması, geri bırakma)
  if (v.hand.penalties.length > prev.hand.penalties.length) {
    const p = v.hand.penalties[v.hand.penalties.length - 1];
    const who = p.seat === me ? "Size" : `${name(v, p.seat)} oyuncusuna`;
    setTimeout(() => {
      play("error");
      useFx.getState().say(`${who} +${p.amount} ceza: ${p.reason}`, "warn");
    }, 900);
  }

  if (v.phase === "handResult" && prev.phase === "playing") play("win");
  if (v.hand.currentTurn !== prev.hand.currentTurn && v.hand.currentTurn === me && v.phase === "playing") setTimeout(() => play("turn"), 350);

  if (toHide.length) fx.hide(toHide);
  if (pending.length) requestAnimationFrame(() => requestAnimationFrame(() => pending.forEach((f) => f())));
}
