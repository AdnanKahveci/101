"use client";
/**
 * Kıraathane masası sohbeti: yan panelde yazışma, hızlı laflar ve ikram (çay, oralet, kahve…).
 * İkramlar gönderenin koltuğundan alanın koltuğuna uçar ve bir süre alanın yanında durur.
 * Yeni yazılar panel kapalıyken de oyuncunun yanında konuşma balonu olarak görünür.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircle, Send, X } from "lucide-react";
import { CHAT_MAX_LEN, DRINKS, DRINK_IDS, EMOTES, EMOTE_IDS, QUICK_LINES, type ChatMessage, type DrinkId, type EmoteId } from "@/lib/chat-shared";
import { realtime } from "@/lib/realtime";
import { play } from "@/lib/sound";
import { cn } from "@/lib/utils";
import type { ClientGameView } from "@/server/game-service";

interface Served {
  id: string;
  seat: number | null; // null = masanın ortası
  drink: DrinkId;
  from: number;
}
interface Bubble {
  id: string;
  seat: number;
  text: string;
}
interface Flying {
  id: string;
  drink?: DrinkId;
  emote?: EmoteId;
  from: number;
  to: number | null;
}
interface Pop {
  id: string;
  seat: number | null;
  emote: EmoteId;
}

interface ChatState {
  matchId: string | null;
  messages: ChatMessage[];
  open: boolean;
  unread: number;
  served: Served[];
  bubbles: Bubble[];
  flying: Flying[];
  pops: Pop[];
  /** Atışma emojilerini göster (kapatan oyuncuya uçmaz, yalnızca sohbette yazar) */
  showEmotes: boolean;
  setShowEmotes: (v: boolean) => void;
  setOpen: (o: boolean) => void;
  history: (matchId: string, m: ChatMessage[]) => void;
  receive: (matchId: string, m: ChatMessage, mySeat: number | null) => void;
  landed: (id: string) => void;
  reset: () => void;
}

const SERVED_MS = 90_000;
const BUBBLE_MS = 4500;

export const useChat = create<ChatState>((set, get) => ({
  matchId: null,
  messages: [],
  open: false,
  unread: 0,
  served: [],
  bubbles: [],
  flying: [],
  pops: [],
  showEmotes: (() => {
    try {
      return typeof window === "undefined" || localStorage.getItem("okey:emotes") !== "0";
    } catch {
      return true;
    }
  })(),
  setShowEmotes: (v) => {
    try {
      localStorage.setItem("okey:emotes", v ? "1" : "0");
    } catch {}
    set({ showEmotes: v });
  },
  setOpen: (open) => set({ open, unread: open ? 0 : get().unread }),
  history: (matchId, messages) => {
    const recent = messages.filter((m) => m.kind === "drink" && Date.now() - m.ts < SERVED_MS);
    set({
      matchId,
      messages,
      // Yeniden bağlanınca masada hâlâ duran ikramlar
      served: recent.map((m) => ({ id: m.id, seat: m.to ?? null, drink: m.drink!, from: m.seat })),
    });
    for (const m of recent) setTimeout(() => set({ served: get().served.filter((s) => s.id !== m.id) }), SERVED_MS - (Date.now() - m.ts));
  },
  receive: (matchId, m, mySeat) => {
    const s = get();
    if (s.matchId !== matchId || s.messages.some((x) => x.id === m.id)) return;
    const mine = m.seat === mySeat;
    set({ messages: [...s.messages, m].slice(-80), unread: s.open || mine ? s.unread : s.unread + 1 });
    if (m.kind === "emote" && m.emote) {
      if (get().showEmotes) {
        set({ flying: [...get().flying, { id: m.id, emote: m.emote, from: m.seat, to: m.to ?? null }] });
        play("whoosh");
      }
    } else if (m.kind === "drink" && m.drink) {
      set({ flying: [...get().flying, { id: m.id, drink: m.drink, from: m.seat, to: m.to ?? null }] });
      play("pour");
    } else if (m.text) {
      set({ bubbles: [...get().bubbles.filter((b) => b.seat !== m.seat), { id: m.id, seat: m.seat, text: m.text }] });
      setTimeout(() => set({ bubbles: get().bubbles.filter((b) => b.id !== m.id) }), BUBBLE_MS);
      if (!mine) play("chat");
    }
  },
  landed: (id) => {
    const f = get().flying.find((x) => x.id === id);
    if (!f) return;
    if (f.emote) {
      const emote = f.emote;
      set({ flying: get().flying.filter((x) => x.id !== id), pops: [...get().pops, { id, seat: f.to, emote }] });
      play("pop");
      setTimeout(() => set({ pops: get().pops.filter((p) => p.id !== id) }), 2600);
      return;
    }
    if (!f.drink) return;
    const drink = f.drink;
    set({ flying: get().flying.filter((x) => x.id !== id), served: [...get().served.filter((s) => s.seat !== f.to), { id, seat: f.to, drink, from: f.from }] });
    play("clink");
    setTimeout(() => set({ served: get().served.filter((s) => s.id !== id) }), SERVED_MS);
  },
  reset: () => set({ matchId: null, messages: [], open: false, unread: 0, served: [], bubbles: [], flying: [], pops: [] }),
}));

export function sendChatText(matchId: string, text: string) {
  return realtime.chat({ matchId, text });
}

// ------------------------------------------------------------------ Konumlar

type Rect = { x: number; y: number; w: number; h: number };

function anchorRect(seat: number | null): Rect | null {
  const sel = seat === null ? '[data-anchor="deck"]' : `[data-anchor="seat-${seat}"]`;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Pencere boyutu değişince yeniden hesaplanan çapa konumu. */
function useAnchor(seat: number | null) {
  const [r, setR] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    const upd = () => setR(anchorRect(seat));
    upd();
    const t = setInterval(upd, 1000);
    window.addEventListener("resize", upd);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", upd);
    };
  }, [seat]);
  return r;
}

// ---------------------------------------------------------- Masadaki katman

/** İkram uçuşları, masada duran bardaklar ve konuşma balonları. */
export function ChatTableLayer() {
  const served = useChat((s) => s.served);
  const bubbles = useChat((s) => s.bubbles);
  const flying = useChat((s) => s.flying);
  const pops = useChat((s) => s.pops);
  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden>
      {flying.map((f) => (
        <FlyingDrink key={f.id} f={f} />
      ))}
      <AnimatePresence>
        {served.map((s) => (
          <ServedDrink key={s.id} s={s} />
        ))}
        {bubbles.map((b) => (
          <SpeechBubble key={b.id} b={b} />
        ))}
        {pops.map((p) => (
          <EmotePop key={p.id} p={p} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function FlyingDrink({ f }: { f: Flying }) {
  const landed = useChat((s) => s.landed);
  const [path] = useState(() => {
    const a = anchorRect(f.from);
    const b = anchorRect(f.to);
    if (!a || !b) return null;
    return { x0: a.x + a.w / 2 - 20, y0: a.y + a.h / 2 - 20, x1: b.x + b.w / 2 - 20, y1: b.y + b.h / 2 - 20 };
  });
  useEffect(() => {
    if (!path) landed(f.id);
  }, [path, f.id, landed]);
  if (!path) return null;
  const lift = Math.min(120, Math.hypot(path.x1 - path.x0, path.y1 - path.y0) * 0.3);
  return (
    <motion.div
      className="absolute left-0 top-0 grid h-10 w-10 place-items-center"
      initial={{ x: path.x0, y: path.y0, scale: 0.6, rotate: 0 }}
      animate={{
        x: [path.x0, (path.x0 + path.x1) / 2, path.x1],
        y: [path.y0, (path.y0 + path.y1) / 2 - lift, path.y1],
        scale: [0.6, 1.5, 1],
        rotate: [0, -10, 0],
      }}
      transition={{ duration: 1.1, ease: [0.3, 0.7, 0.4, 1] }}
      onAnimationComplete={() => landed(f.id)}
    >
      <span className={cn("drink-glass", f.emote ? "text-4xl" : "text-3xl")}>{f.emote ? EMOTES[f.emote].emoji : DRINKS[f.drink!].emoji}</span>
    </motion.div>
  );
}

/** Hedefe çarpan atışma emojisi: büyür, sallanır, kaybolur. */
function EmotePop({ p }: { p: Pop }) {
  const r = useAnchor(p.seat);
  if (!r) return null;
  const x = r.x + r.w / 2 - 32;
  const y = r.y + r.h / 2 - 32;
  return (
    <motion.div
      className="absolute left-0 top-0 grid h-16 w-16 place-items-center"
      initial={{ x, y, scale: 0.3, rotate: 0, opacity: 1 }}
      animate={{ x, y, scale: [0.3, 1.8, 1.4, 1.6], rotate: [0, -18, 14, -8, 0], opacity: 1 }}
      exit={{ x, y, scale: 0.2, opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <span className="emote-pop text-5xl">{EMOTES[p.emote].emoji}</span>
    </motion.div>
  );
}

function ServedDrink({ s }: { s: Served }) {
  const r = useAnchor(s.seat);
  if (!r) return null;
  // Koltuk rozetinin sağ üst köşesi; masaya ikramda destenin yanı
  const x = s.seat === null ? r.x - 44 : r.x + r.w - 14;
  const y = s.seat === null ? r.y + r.h / 2 - 18 : r.y - 22;
  return (
    <motion.div
      className="absolute left-0 top-0"
      initial={{ x, y, scale: 0.4, opacity: 0 }}
      animate={{ x, y, scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
      title={DRINKS[s.drink].label}
    >
      <span className="drink-served relative grid h-9 w-9 place-items-center rounded-full text-2xl">
        {DRINKS[s.drink].emoji}
        {(s.drink === "cay" || s.drink === "kahve" || s.drink === "sahlep" || s.drink === "adacayi") && <span className="steam" />}
      </span>
    </motion.div>
  );
}

function SpeechBubble({ b }: { b: Bubble }) {
  const r = useAnchor(b.seat);
  if (!r) return null;
  const below = r.y < 140; // üstteki oyuncunun balonu altta
  const x = Math.max(8, Math.min(window.innerWidth - 228, r.x + r.w / 2 - 110));
  const y = below ? r.y + r.h + 8 : r.y - 8;
  return (
    <motion.div
      className="absolute left-0 top-0 w-[220px]"
      style={{ x, y }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <div className={cn("flex", below ? "items-start" : "-translate-y-full items-end")}>
        <p className="speech-bubble mx-auto max-w-full break-words rounded-2xl px-3 py-1.5 text-center text-xs font-semibold text-wood-900 sm:text-sm">{b.text}</p>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ Panel

export function ChatButton() {
  const open = useChat((s) => s.open);
  const unread = useChat((s) => s.unread);
  const setOpen = useChat((s) => s.setOpen);
  return (
    <button
      className={cn("relative rounded-lg p-1.5 text-white/80 hover:bg-white/10", open && "bg-white/15")}
      aria-label={open ? "Sohbeti kapat" : "Sohbeti aç"}
      data-testid="chat-toggle"
      onClick={() => setOpen(!open)}
    >
      <MessageCircle className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{unread > 9 ? "9+" : unread}</span>
      )}
    </button>
  );
}

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function ChatPanel({ view }: { view: ClientGameView }) {
  const open = useChat((s) => s.open);
  const messages = useChat((s) => s.messages);
  const setOpen = useChat((s) => s.setOpen);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const canWrite = view.mySeat !== null;
  const others = view.players.filter((p) => p.seat !== view.mySeat);
  const nameOf = (seat: number) => view.players.find((p) => p.seat === seat)?.displayName ?? "?";

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const submit = (t: string) => {
    const v = t.trim();
    if (!v) return;
    if (sendChatText(view.matchId, v)) setText("");
  };
  const treat = (drink: DrinkId) => realtime.chat({ matchId: view.matchId, drink, to: target });
  const tease = (emote: EmoteId) => realtime.chat({ matchId: view.matchId, emote, to: target });
  const showEmotes = useChat((s) => s.showEmotes);
  const setShowEmotes = useChat((s) => s.setShowEmotes);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="chat-panel fixed bottom-2 right-2 top-12 z-50 flex w-[min(340px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl"
          aria-label="Masa sohbeti"
          data-testid="chat-panel"
        >
          <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="text-lg">☕</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-gold">Kıraathane Sohbeti</p>
              <p className="text-[10px] text-white/50">Masadakilerle yazış, ikramda bulun</p>
            </div>
            <button className="rounded-lg p-1 text-white/70 hover:bg-white/10" aria-label="Sohbeti kapat" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2" data-testid="chat-messages">
            {messages.length === 0 && <p className="mt-6 text-center text-xs text-white/40">Henüz kimse bir şey demedi. Bir çay ısmarlayarak başla!</p>}
            {messages.map((m) => {
              const mine = m.seat === view.mySeat;
              if (m.kind === "emote" && m.emote) {
                const to = m.to == null ? "masaya" : m.to === view.mySeat ? "sana" : nameOf(m.to);
                return (
                  <p key={m.id} className="rounded-lg bg-rose-900/25 px-2 py-1 text-center text-[11px] text-rose-100/90">
                    <b>{mine ? "Sen" : m.name}</b> → {to} <span className="text-lg">{EMOTES[m.emote].emoji}</span>
                    <span className="ml-1 text-white/30">{fmtTime(m.ts)}</span>
                  </p>
                );
              }
              if (m.kind === "drink" && m.drink) {
                const d = DRINKS[m.drink];
                const to = m.to == null ? "masaya" : m.to === view.mySeat ? "senin için" : `${nameOf(m.to)} için`;
                return (
                  <p key={m.id} className="rounded-lg bg-amber-900/30 px-2 py-1 text-center text-[11px] text-amber-100/90">
                    <span className="mr-1 text-base">{d.emoji}</span>
                    <b>{mine ? "Sen" : m.name}</b> {to} {d.line}
                    <span className="ml-1 text-white/30">{fmtTime(m.ts)}</span>
                  </p>
                );
              }
              return (
                <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  {!mine && <span className="px-1 text-[10px] font-bold text-gold/80">{m.name}</span>}
                  <p className={cn("max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm", mine ? "rounded-br-sm bg-emerald-700/80" : "rounded-bl-sm bg-white/10")}>
                    {m.text}
                    <span className="ml-2 align-bottom text-[9px] text-white/40">{fmtTime(m.ts)}</span>
                  </p>
                </div>
              );
            })}
          </div>

          {canWrite ? (
            <div className="space-y-2 border-t border-white/10 p-2">
              <div>
                <div className="mb-1 flex items-center gap-1 text-[10px] text-white/60">
                  <span className="font-bold">Kime:</span>
                  <select
                    className="rounded bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
                    value={target === null ? "" : String(target)}
                    onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))}
                    aria-label="İkram / atışma kime"
                    data-testid="drink-target"
                  >
                    <option value="">Masaya (herkese)</option>
                    {others.map((p) => (
                      <option key={p.seat} value={p.seat}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {DRINK_IDS.map((id) => (
                    <button
                      key={id}
                      className="drink-btn grid aspect-square place-items-center rounded-lg text-xl"
                      title={DRINKS[id].label}
                      aria-label={`${DRINKS[id].label} ısmarla`}
                      data-testid={`drink-${id}`}
                      onClick={() => treat(id)}
                    >
                      {DRINKS[id].emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-white/60">
                  <span className="font-bold">Atışma:</span>
                  <label className="flex cursor-pointer items-center gap-1">
                    <input type="checkbox" className="accent-[#f2c14e]" checked={showEmotes} onChange={(e) => setShowEmotes(e.target.checked)} data-testid="emotes-toggle" />
                    Animasyonları göster
                  </label>
                </div>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
                  {EMOTE_IDS.map((id) => (
                    <button
                      key={id}
                      className="drink-btn grid aspect-square place-items-center rounded-lg text-lg"
                      title={EMOTES[id].label}
                      aria-label={`${EMOTES[id].label} gönder`}
                      data-testid={`emote-${id}`}
                      onClick={() => tease(id)}
                    >
                      {EMOTES[id].emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {QUICK_LINES.map((q) => (
                  <button key={q} className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/20" onClick={() => submit(q)}>
                    {q}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(text);
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={CHAT_MAX_LEN}
                  placeholder="Bir şey yaz…"
                  className="min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-1.5 text-sm text-white outline-none ring-gold/50 placeholder:text-white/30 focus:ring-2"
                  aria-label="Mesaj"
                  data-testid="chat-input"
                />
                <button type="submit" className="rounded-lg bg-gold px-3 text-felt-950 disabled:opacity-40" disabled={!text.trim()} aria-label="Gönder" data-testid="chat-send">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <p className="border-t border-white/10 p-3 text-center text-xs text-white/50">Seyirciler sohbete yazamaz.</p>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
