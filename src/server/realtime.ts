/**
 * WebSocket bağlantı yöneticisi. Taşıma katmanından bağımsızdır:
 * üretimde Vercel Functions `upgradeWebSocket` ile, geliştirme/testte `ws` sunucusuyla aynı fonksiyon kullanılır.
 *
 * Bağlantı yalnızca bir "görünüm boru hattı"dır: kalıcı state asla bu bellekte tutulmaz.
 * Her değişiklik Redis pub/sub ile duyurulur, görünüm Postgres/Redis'teki yetkili state'ten üretilir.
 */
import type { WebSocket } from "ws";
import { z } from "zod";
import { SESSION_COOKIE, readCookie, userFromToken, type AuthUser } from "./auth";
import { getInfra, type Unsubscribe } from "./infra";
import { matchChannel, onlineMap, publish, roomChannel, touchPresence, userChannel, type BusMessage } from "./channels";
import { AppError } from "./errors";
import { checkTimeout, loadState, processCommand, viewFor } from "./game-service";
import { runBots } from "./bots";
import { getRoom } from "./rooms";
import { commandSchema } from "./validation";
import { chatHistory, sendChat } from "./chat";
import { CHAT_MAX_LEN, DRINK_IDS, type ChatMessage } from "@/lib/chat-shared";

const clientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("ping") }),
  z.object({ t: z.literal("room"), code: z.string().min(4).max(8), token: z.string().max(64).optional() }),
  z.object({ t: z.literal("watch"), matchId: z.string().uuid() }),
  z.object({ t: z.literal("sync"), matchId: z.string().uuid() }),
  z.object({ t: z.literal("cmd"), cmd: commandSchema }),
  z.object({
    t: z.literal("chat"),
    matchId: z.string().uuid(),
    text: z.string().max(CHAT_MAX_LEN * 2).optional(),
    drink: z.enum(DRINK_IDS).optional(),
    to: z.number().int().min(0).max(3).nullable().optional(),
  }),
]);

export type ServerMessage =
  | { t: "welcome"; userId: string; serverTime: number }
  | { t: "pong"; serverTime: number; presence?: Record<number, boolean> }
  | { t: "room"; room: unknown; navigateToMatch?: string }
  | { t: "state"; view: unknown }
  | { t: "ack"; commandId: string; version: number; duplicate?: boolean }
  | { t: "nack"; commandId: string; code: string; error: string }
  | { t: "notify"; kind: string; data: Record<string, unknown> }
  | { t: "chat"; matchId: string; msg: ChatMessage }
  | { t: "chatHistory"; matchId: string; messages: ChatMessage[] }
  | { t: "error"; code: string; error: string };

export interface UpgradeInfo {
  cookie: string | null;
  origin: string | null;
  host: string | null;
}

function sameOrigin(info: UpgradeInfo): boolean {
  if (!info.origin) return true; // tarayıcı dışı istemciler (testler) — kimlik çerezle doğrulanır
  try {
    const o = new URL(info.origin);
    const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return o.host === info.host || allowed.includes(o.origin);
  } catch {
    return false;
  }
}

export async function handleConnection(ws: WebSocket, info: UpgradeInfo): Promise<void> {
  const send = (m: ServerMessage) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(m));
  };
  if (!sameOrigin(info)) {
    ws.close(4003, "origin");
    return;
  }
  // Bağlantı kurulur kurulmaz mesajları tamponla (kimlik doğrulama asenkron).
  const early: string[] = [];
  const earlyListener = (data: unknown) => early.push(String(data));
  ws.on("message", earlyListener);

  const user = await userFromToken(readCookie(info.cookie, SESSION_COOKIE)).catch(() => null);
  if (!user) {
    send({ t: "error", code: "UNAUTHORIZED", error: "Oturum bulunamadı." });
    ws.close(4001, "unauthorized");
    return;
  }
  const conn = new Connection(ws, user, send);
  ws.off("message", earlyListener);
  ws.on("message", (data) => conn.onMessage(String(data)));
  ws.on("close", () => void conn.dispose());
  ws.on("error", () => void conn.dispose());
  await conn.start();
  for (const m of early) await conn.onMessage(m);
}

class Connection {
  private subs = new Map<string, Unsubscribe>();
  private watchedMatch: string | null = null;
  private lastSentVersion = -1;
  private roomCode: string | null = null;
  private roomToken: string | undefined;
  private disposed = false;
  private sending: Promise<void> = Promise.resolve();
  private msgCount = 0;
  private msgWindow = Date.now();

  constructor(
    private ws: WebSocket,
    private user: AuthUser,
    private send: (m: ServerMessage) => void,
  ) {}

  async start() {
    await touchPresence(this.user.id);
    await this.subscribe(userChannel(this.user.id), (msg) => {
      if (msg.type === "notify") this.send({ t: "notify", kind: msg.kind, data: msg.data });
    });
    this.send({ t: "welcome", userId: this.user.id, serverTime: Date.now() });
  }

  private async subscribe(channel: string, handler: (m: BusMessage) => void) {
    if (this.subs.has(channel)) return;
    const infra = await getInfra();
    const unsub = await infra.subscribe(channel, (raw) => {
      if (this.disposed) return;
      try {
        handler(JSON.parse(raw) as BusMessage);
      } catch {
        /* bozuk mesaj yok sayılır */
      }
    });
    this.subs.set(channel, unsub);
  }

  private async unsubscribe(channel: string) {
    const u = this.subs.get(channel);
    if (u) {
      this.subs.delete(channel);
      await u();
    }
  }

  private queue: Promise<void> = Promise.resolve();

  /** Mesajlar geliş sırasıyla, tek tek işlenir (sıralı ve tekil işleme). */
  onMessage(raw: string): Promise<void> {
    this.queue = this.queue.then(() => this.handle(raw)).catch((e) => console.error("[realtime]", e));
    return this.queue;
  }

  private async handle(raw: string) {
    // Bağlantı başına basit hız sınırı
    if (Date.now() - this.msgWindow > 5000) {
      this.msgWindow = Date.now();
      this.msgCount = 0;
    }
    if (++this.msgCount > Number(process.env.OKEY_WS_MSG_LIMIT ?? 80)) {
      this.send({ t: "error", code: "RATE_LIMITED", error: "Çok fazla mesaj." });
      return;
    }
    let parsed: z.infer<typeof clientMessage>;
    try {
      const r = clientMessage.safeParse(JSON.parse(raw));
      if (!r.success) {
        const maybeCmd = (() => {
          try {
            return JSON.parse(raw)?.cmd?.commandId as string | undefined;
          } catch {
            return undefined;
          }
        })();
        if (maybeCmd) this.send({ t: "nack", commandId: String(maybeCmd), code: "BAD_REQUEST", error: "Geçersiz komut biçimi." });
        else this.send({ t: "error", code: "BAD_REQUEST", error: "Geçersiz mesaj." });
        return;
      }
      parsed = r.data;
    } catch {
      this.send({ t: "error", code: "BAD_REQUEST", error: "Geçersiz JSON." });
      return;
    }
    try {
      switch (parsed.t) {
        case "ping":
          return await this.onPing();
        case "room":
          return await this.watchRoom(parsed.code, parsed.token);
        case "watch":
          return await this.watchMatch(parsed.matchId);
        case "sync":
          return await this.pushState(parsed.matchId, true);
        case "cmd":
          return await this.onCommand(parsed.cmd);
        case "chat":
          await sendChat(this.user, parsed.matchId, { text: parsed.text, drink: parsed.drink, to: parsed.to });
          return;
      }
    } catch (e) {
      const err = e instanceof AppError ? e : null;
      if (!err) console.error("[realtime]", e);
      this.send({ t: "error", code: err?.code ?? "INTERNAL", error: err?.message ?? "Sunucu hatası." });
    }
  }

  private async onPing() {
    await touchPresence(this.user.id);
    let presence: Record<number, boolean> | undefined;
    if (this.watchedMatch) {
      const matchId = this.watchedMatch;
      await checkTimeout(matchId).catch((e) => console.error("[timeout]", e));
      void runBots(matchId).catch((e) => console.error("[bots]", e));
      const state = await loadState(matchId);
      const online = await onlineMap(state.players.map((p) => p.userId));
      presence = Object.fromEntries(state.players.map((p) => [p.seat, online[p.userId] ?? false]));
    }
    this.send({ t: "pong", serverTime: Date.now(), presence });
  }

  private async watchRoom(code: string, token?: string) {
    const res = await getRoom(code, this.user, token);
    if (res.access !== "full") throw new AppError("FORBIDDEN", "Bu odayı görüntüleme yetkiniz yok.");
    if (this.roomCode && this.roomCode !== code) {
      const old = await getRoom(this.roomCode, this.user, this.roomToken).catch(() => null);
      if (old?.access === "full") await this.unsubscribe(roomChannel(old.room.id));
    }
    this.roomCode = code;
    this.roomToken = token;
    await this.subscribe(roomChannel(res.room.id), (msg) => {
      if (msg.type !== "room") return;
      void this.pushRoom(msg.navigateToMatch);
    });
    this.send({ t: "room", room: res.room });
  }

  private async pushRoom(navigateToMatch?: string) {
    if (!this.roomCode) return;
    const res = await getRoom(this.roomCode, this.user, this.roomToken).catch(() => null);
    if (res?.access === "full") this.send({ t: "room", room: res.room, navigateToMatch });
  }

  private async watchMatch(matchId: string) {
    const view = await viewFor(this.user.id, matchId); // yetki kontrolü
    if (this.watchedMatch && this.watchedMatch !== matchId) await this.unsubscribe(matchChannel(this.watchedMatch));
    this.watchedMatch = matchId;
    this.lastSentVersion = view.version;
    await this.subscribe(matchChannel(matchId), (msg) => {
      if (msg.type === "chat") {
        if (msg.matchId === matchId) this.send({ t: "chat", matchId, msg: msg.msg });
        return;
      }
      if (msg.type !== "match") return;
      if (msg.version > this.lastSentVersion || msg.force) void this.pushState(matchId, !!msg.force);
    });
    this.send({ t: "state", view });
    this.send({ t: "chatHistory", matchId, messages: await chatHistory(matchId) });
    // Diğer oyunculara bağlantı durumunu bildir.
    await publish(matchChannel(matchId), { type: "match", matchId, version: view.version, force: true });
  }

  /** Görünümleri sırayla gönderir; eski sürüm yeni sürümün üzerine yazılmaz. */
  private pushState(matchId: string, force: boolean) {
    this.sending = this.sending.then(async () => {
      if (this.disposed) return;
      const view = await viewFor(this.user.id, matchId);
      if (!force && view.version <= this.lastSentVersion) return;
      this.lastSentVersion = Math.max(this.lastSentVersion, view.version);
      this.send({ t: "state", view });
    }).catch((e) => {
      const err = e instanceof AppError ? e : null;
      this.send({ t: "error", code: err?.code ?? "INTERNAL", error: err?.message ?? "Durum alınamadı." });
    });
    return this.sending;
  }

  private async onCommand(cmd: z.infer<typeof commandSchema>) {
    try {
      const r = await processCommand(this.user, cmd);
      this.send({ t: "ack", commandId: cmd.commandId, version: r.version, duplicate: r.duplicate });
      await this.pushState(cmd.matchId, false);
      void runBots(cmd.matchId).catch((e) => console.error("[bots]", e));
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError("INTERNAL", "Sunucu hatası.");
      if (!(e instanceof AppError)) console.error("[command]", e);
      this.send({ t: "nack", commandId: cmd.commandId, code: err.code, error: err.message });
      if (err.code === "STALE_VERSION") await this.pushState(cmd.matchId, true);
    }
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const subs = [...this.subs.values()];
    this.subs.clear();
    await Promise.allSettled(subs.map((u) => u()));
    if (this.watchedMatch) {
      const infra = await getInfra();
      // Bu kullanıcının başka açık bağlantısı yoksa çevrimdışı görünmesi için presence kısa süre sonra düşer (TTL).
      await infra.set(`okey:presence:${this.user.id}`, String(Date.now()), 12_000).catch(() => {});
      const state = await loadState(this.watchedMatch).catch(() => null);
      if (state) await publish(matchChannel(this.watchedMatch), { type: "match", matchId: this.watchedMatch, version: state.version, force: true }).catch(() => {});
    }
    void this.ws;
  }
}
