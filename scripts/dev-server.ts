/**
 * YALNIZCA YEREL GELİŞTİRME/TEST: Next.js + aynı süreçte WebSocket (/api/ws).
 * Üretimde bu dosya kullanılmaz; Vercel Functions WebSocket desteği (src/app/api/ws/route.ts) kullanılır.
 * DATABASE_URL/REDIS_URL yoksa geçici gömülü PGlite ve bellek içi pub/sub kullanılır.
 */
import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
process.env.DATABASE_URL ??= process.env.OKEY_DEV_DB ?? "pglite:./.pglite";

async function main() {
  const app = next({ dev, port, hostname: "localhost" });
  await app.prepare();
  const handle = app.getRequestHandler();
  const upgrade = app.getUpgradeHandler();
  const { attachWebSocketServer } = await import("../src/server/ws-node");
  const server = createServer((req, res) => void handle(req, res));
  // Next geliştirme sunucusu ilk istekte kendi 'upgrade' dinleyicisini req.socket.server'a ekler ve
  // tanımadığı yolları kapatır. /api/ws yükseltmelerini yalnızca kendi WebSocket sunucumuza yönlendiriyoruz.
  const wss = attachWebSocketServer(new EventEmitter() as unknown as Server);
  const emit = server.emit.bind(server);
  server.emit = ((event: string, ...args: unknown[]) => {
    if (event === "upgrade") {
      const [req, socket, head] = args as [IncomingMessage, Duplex, Buffer];
      if (new URL(req.url ?? "/", "http://localhost").pathname === "/api/ws") {
        wss.emitUpgrade(req, socket, head);
        return true;
      }
      if (server.listenerCount("upgrade") === 0) void upgrade(req, socket, head);
    }
    return emit(event, ...args);
  }) as typeof server.emit;
  server.listen(port, () => console.log(`> Online 101 Okey: http://localhost:${port} (geliştirme)`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
