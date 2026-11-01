import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { MemoryInfra, setInfraForTests } from "@/server/infra";
import { attachWebSocketServer } from "@/server/ws-node";
import { createGuest, createSession, registerUser, SESSION_COOKIE, userFromToken, type AuthUser } from "@/server/auth";
import type { ClientGameView } from "@/server/game-service";
import type { ServerMessage } from "@/server/realtime";

/**
 * Test ortamı: gömülü PGlite (geçici Postgres) + paylaşılan bellek içi Redis eşdeğeri.
 * Birden fazla "sunucu instance'ı" aynı DB ve aynı pub/sub altyapısına bağlanır.
 */
export function useInfra() {
  // Botlar insandan çok hızlı oynar; hız sınırları ayrı bir testte doğrulanır.
  process.env.OKEY_CMD_RATE_LIMIT ??= "100000";
  process.env.OKEY_WS_MSG_LIMIT ??= "100000";
  setInfraForTests(new MemoryInfra());
}

export async function startInstance(): Promise<{ url: string; server: Server; close: () => Promise<void> }> {
  const server = createServer((_, res) => {
    res.statusCode = 404;
    res.end();
  });
  const wss = attachWebSocketServer(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}/api/ws`,
    server,
    close: async () => {
      wss.clients.forEach((c) => c.terminate());
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

export interface TestPlayer {
  user: AuthUser;
  cookie: string;
}

export async function makePlayer(name: string, guest = false): Promise<TestPlayer> {
  const u = guest ? await createGuest(name) : await registerUser({ username: name.toLowerCase(), password: "sifre1234", displayName: name });
  const { token } = await createSession(u.id);
  const user = (await userFromToken(token))!;
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

export class TestClient {
  ws!: WebSocket;
  messages: ServerMessage[] = [];
  view: ClientGameView | null = null;
  room: unknown = null;
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] = [];

  constructor(
    public url: string,
    public player: TestPlayer,
  ) {}

  async connect() {
    this.ws = new WebSocket(this.url, { headers: { cookie: this.player.cookie } });
    this.ws.on("message", (d) => {
      const m = JSON.parse(String(d)) as ServerMessage;
      this.messages.push(m);
      if (m.t === "state") {
        const v = m.view as ClientGameView;
        if (!this.view || v.version >= this.view.version) this.view = v;
      }
      if (m.t === "room") this.room = m.room;
      for (const w of [...this.waiters]) {
        if (w.pred(m)) {
          clearTimeout(w.timer);
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(m);
        }
      }
    });
    await this.waitFor((m) => m.t === "welcome");
    return this;
  }

  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 10_000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Mesaj zaman aşımı (${this.player.user.displayName})`)), timeoutMs);
      this.waiters.push({ pred, resolve, reject, timer });
    });
  }

  send(obj: unknown) {
    this.ws.send(JSON.stringify(obj));
  }

  async watch(matchId: string) {
    const p = this.waitFor((m) => m.t === "state");
    this.send({ t: "watch", matchId });
    await p;
    return this.view!;
  }

  async waitForVersion(v: number) {
    if (this.view && this.view.version >= v) return this.view;
    await this.waitFor((m) => m.t === "state" && (m.view as ClientGameView).version >= v);
    return this.view!;
  }

  /** Komut gönderir ve ack/nack bekler. */
  async command(action: unknown, opts: { commandId?: string; expectedVersion?: number } = {}) {
    const commandId = opts.commandId ?? `c${Math.random().toString(36).slice(2, 12)}`;
    const p = this.waitFor((m) => (m.t === "ack" || m.t === "nack") && m.commandId === commandId);
    this.send({
      t: "cmd",
      cmd: { commandId, matchId: this.view!.matchId, expectedVersion: opts.expectedVersion ?? this.view!.version, action },
    });
    return (await p) as Extract<ServerMessage, { t: "ack" | "nack" }>;
  }

  close() {
    this.ws.close();
  }
}
