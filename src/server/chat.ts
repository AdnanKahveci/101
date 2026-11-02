/**
 * Masa sohbeti ve ikramlar (çay, oralet…). Kalıcı değildir: son mesajlar Redis'te kısa süre tutulur,
 * yeni mesajlar maç kanalından yayınlanır. Yalnızca masadaki oyuncular yazabilir.
 */
import { randomUUID } from "node:crypto";
import { CHAT_MAX_LEN, DRINKS, EMOTES, GESTURES, GESTURE_CATCH_CHANCE, type ChatMessage, type DrinkId, type EmoteId, type GestureId } from "@/lib/chat-shared";
import { getInfra, withLock } from "./infra";
import { matchChannel, publish } from "./channels";
import { fail } from "./errors";
import { loadState } from "./game-service";
import { botIdsAmong } from "./bots";
import type { AuthUser } from "./auth";

const HISTORY = 60;
const TTL = 12 * 3600_000;
const key = (matchId: string) => `okey:chat:${matchId}`;

/** Koltuk bu mesajı görebilir mi? (gizli işaretler yalnızca taraflara gider) */
export function canSee(msg: ChatMessage, seat: number | null): boolean {
  return !msg.visibleTo || (seat !== null && msg.visibleTo.includes(seat));
}

/** `seat` verilirse o koltuğun göremeyeceği gizli mesajlar süzülür. */
export async function chatHistory(matchId: string, seat?: number | null): Promise<ChatMessage[]> {
  if (seat !== undefined) return (await chatHistory(matchId)).filter((m) => canSee(m, seat));
  const infra = await getInfra();
  try {
    const raw = await infra.get(key(matchId));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

async function append(matchId: string, msg: ChatMessage) {
  const infra = await getInfra();
  await withLock(infra, `${key(matchId)}:lock`, async () => {
    const list = await chatHistory(matchId);
    list.push(msg);
    await infra.set(key(matchId), JSON.stringify(list.slice(-HISTORY)), TTL);
  });
  await publish(matchChannel(matchId), { type: "chat", matchId, msg });
}

/** Kontrol / yön karakterlerini temizler, boşlukları sadeleştirir. */
export function cleanChatText(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LEN);
}

export async function sendChat(
  user: AuthUser,
  matchId: string,
  input: { text?: string; drink?: DrinkId; emote?: EmoteId; gesture?: GestureId; secret?: boolean; to?: number | null },
): Promise<ChatMessage> {
  const state = await loadState(matchId);
  const me = state.players.find((p) => p.userId === user.id);
  if (!me) return fail("FORBIDDEN", "Sohbete yalnızca masadaki oyuncular yazabilir.");
  const infra = await getInfra();
  if ((await infra.incrWindow(`okey:chatrl:${user.id}`, 10_000)) > 8) fail("RATE_LIMITED", "Biraz yavaş – çok hızlı yazıyorsunuz.");

  let msg: ChatMessage;
  const target = () => {
    const to = input.to ?? null;
    if (to !== null && (to === me.seat || !state.players.some((p) => p.seat === to))) fail("BAD_REQUEST", "Geçersiz hedef.");
    return to;
  };
  if (input.gesture) {
    if (!(input.gesture in GESTURES)) fail("BAD_REQUEST", "Böyle bir işaret yok.");
    const to = target();
    if (to === null) return fail("BAD_REQUEST", "İşaret kime yapılacak?");
    const secret = !!input.secret;
    const caught = secret && Math.random() < GESTURE_CATCH_CHANCE;
    msg = {
      id: randomUUID(),
      ts: Date.now(),
      seat: me.seat,
      name: me.displayName,
      kind: "gesture",
      gesture: input.gesture,
      to,
      ...(secret ? { secret, caught } : {}),
      ...(secret && !caught ? { visibleTo: [me.seat, to] } : {}),
    };
  } else if (input.emote) {
    if (!(input.emote in EMOTES)) fail("BAD_REQUEST", "Böyle bir emoji yok.");
    msg = { id: randomUUID(), ts: Date.now(), seat: me.seat, name: me.displayName, kind: "emote", emote: input.emote, to: target() };
  } else if (input.drink) {
    if (!(input.drink in DRINKS)) fail("BAD_REQUEST", "Böyle bir ikram yok.");
    const to = input.to ?? null;
    if (to !== null && (to === me.seat || !state.players.some((p) => p.seat === to))) fail("BAD_REQUEST", "Geçersiz ikram hedefi.");
    msg = { id: randomUUID(), ts: Date.now(), seat: me.seat, name: me.displayName, kind: "drink", drink: input.drink, to };
  } else {
    const text = cleanChatText(input.text ?? "");
    if (!text) fail("BAD_REQUEST", "Boş mesaj gönderilemez.");
    msg = { id: randomUUID(), ts: Date.now(), seat: me.seat, name: me.displayName, kind: "text", text };
  }
  await append(matchId, msg);
  if (msg.kind === "drink") void botsThank(matchId, msg).catch(() => {});
  if (msg.kind === "emote" && msg.to != null && Math.random() < 0.6) void botsTease(matchId, msg).catch(() => {});
  if (msg.kind === "gesture") void botsReactGesture(matchId, msg).catch(() => {});
  return msg;
}

const TEASE_BACK = ["Ayıp ayıp 😄", "Sen önce taşını düzgün at", "Bak hele bak", "Sabır… sabır…", "Elin bitince konuşuruz", "Hadi oradan 😏"];

/** Bota atışma emojisi fırlatılırsa laf sokar. */
async function botsTease(matchId: string, e: ChatMessage) {
  const state = await loadState(matchId);
  const t = state.players.find((p) => p.seat === e.to);
  if (!t || !(await botIdsAmong([t.userId])).has(t.userId)) return;
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1200));
  const text = TEASE_BACK[Math.floor(Math.random() * TEASE_BACK.length)];
  await append(matchId, { id: randomUUID(), ts: Date.now(), seat: t.seat, name: t.displayName, kind: "text", text });
}

const GESTURE_BACK = ["Anladım ortak 😉", "Tamam tamam, gördüm", "Bana bırak", "Sakin, her şey kontrol altında", "Ayağımı kırdın be! 🦶", "Hı hı… 🤫"];
const CAUGHT_LINES = ["Hop hop! İşaretleşmek yok!", "Gördük gördük 👀", "Burun kaşımalar, kulak çekmeler… ayıp!", "Kahveci, şu masaya bak!", "Hakem! Hakeeem!"];

/** İşarete botların tepkisi: eş bot cevap verir; yakalanan gizli işarete rakip bot laf sokar. */
async function botsReactGesture(matchId: string, g: ChatMessage) {
  const state = await loadState(matchId);
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  let speaker: (typeof state.players)[number] | undefined;
  let text: string;
  if (g.caught) {
    const others = state.players.filter((p) => p.seat !== g.seat && p.seat !== g.to);
    const bots = await botIdsAmong(others.map((p) => p.userId));
    speaker = others.find((p) => bots.has(p.userId));
    text = pick(CAUGHT_LINES);
  } else {
    if (Math.random() > 0.6) return;
    const t = state.players.find((p) => p.seat === g.to);
    if (t && (await botIdsAmong([t.userId])).has(t.userId)) speaker = t;
    text = pick(GESTURE_BACK);
  }
  if (!speaker) return;
  await new Promise((r) => setTimeout(r, 1300 + Math.random() * 1200));
  // Gizli işarete cevap da gizli kalır
  await append(matchId, { id: randomUUID(), ts: Date.now(), seat: speaker.seat, name: speaker.displayName, kind: "text", text, ...(g.visibleTo ? { visibleTo: g.visibleTo } : {}) });
}

const THANKS = ["eyvallah, sağ ol!", "ellerine sağlık 🙏", "sağ olasın, ocağına bereket", "çok makbule geçti", "afiyetle içeriz, sağ ol"];

/** Bot oyunculara ikram edilirse teşekkür ederler (kıraathane adabı). Masaya ikramda bir bot cevap verir. */
async function botsThank(matchId: string, drink: ChatMessage) {
  const state = await loadState(matchId);
  const targets = state.players.filter((p) => p.seat !== drink.seat && (drink.to == null || p.seat === drink.to));
  const bots = await botIdsAmong(targets.map((p) => p.userId));
  const thanker = targets.find((p) => bots.has(p.userId));
  if (!thanker) return;
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  const text = THANKS[Math.floor(Math.random() * THANKS.length)];
  await append(matchId, { id: randomUUID(), ts: Date.now(), seat: thanker.seat, name: thanker.displayName, kind: "text", text: `${drink.name}, ${text}` });
}
