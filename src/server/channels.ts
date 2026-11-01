import { getInfra } from "./infra";

/** Instance'lar arası yayın kanalları (Redis pub/sub). Mesajlar gizli bilgi içermez; yalnızca "değişti" sinyalidir. */
export const roomChannel = (roomId: string) => `okey:room:${roomId}`;
export const matchChannel = (matchId: string) => `okey:match:${matchId}`;
export const userChannel = (userId: string) => `okey:user:${userId}`;

export type BusMessage =
  | { type: "room"; roomId: string; navigateToMatch?: string }
  | { type: "match"; matchId: string; version: number; force?: boolean }
  | { type: "notify"; kind: "invitation" | "friendRequest" | "friendAccepted"; data: Record<string, unknown> };

export async function publish(channel: string, msg: BusMessage) {
  const infra = await getInfra();
  await infra.publish(channel, JSON.stringify(msg));
}

// ------------------------------------------------------------- Çevrimiçi durum

const PRESENCE_TTL = 35_000;
export const presenceKey = (userId: string) => `okey:presence:${userId}`;

export async function touchPresence(userId: string) {
  const infra = await getInfra();
  await infra.set(presenceKey(userId), String(Date.now()), PRESENCE_TTL);
}

export async function onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
  if (userIds.length === 0) return {};
  const infra = await getInfra();
  const vals = await infra.mget(userIds.map(presenceKey));
  return Object.fromEntries(userIds.map((id, i) => [id, vals[i] !== null]));
}
