/**
 * Masa sohbeti ve ikramlar (çay, oralet…). Kalıcı değildir: son mesajlar Redis'te kısa süre tutulur,
 * yeni mesajlar maç kanalından yayınlanır. Yalnızca masadaki oyuncular yazabilir.
 */
import { randomUUID } from "node:crypto";
import { CHAT_MAX_LEN, DRINKS, type ChatMessage, type DrinkId } from "@/lib/chat-shared";
import { getInfra, withLock } from "./infra";
import { matchChannel, publish } from "./channels";
import { fail } from "./errors";
import { loadState } from "./game-service";
import { botIdsAmong } from "./bots";
import type { AuthUser } from "./auth";

const HISTORY = 60;
const TTL = 12 * 3600_000;
const key = (matchId: string) => `okey:chat:${matchId}`;

export async function chatHistory(matchId: string): Promise<ChatMessage[]> {
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
  input: { text?: string; drink?: DrinkId; to?: number | null },
): Promise<ChatMessage> {
  const state = await loadState(matchId);
  const me = state.players.find((p) => p.userId === user.id);
  if (!me) return fail("FORBIDDEN", "Sohbete yalnızca masadaki oyuncular yazabilir.");
  const infra = await getInfra();
  if ((await infra.incrWindow(`okey:chatrl:${user.id}`, 10_000)) > 8) fail("RATE_LIMITED", "Biraz yavaş – çok hızlı yazıyorsunuz.");

  let msg: ChatMessage;
  if (input.drink) {
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
  return msg;
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
