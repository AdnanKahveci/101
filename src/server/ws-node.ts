/**
 * Yalnızca geliştirme ve test için: Node HTTP sunucusuna WebSocket desteği ekler.
 * Üretimde aynı handleConnection fonksiyonu Vercel Functions `upgradeWebSocket` ile çalışır (src/app/api/ws/route.ts).
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { handleConnection } from "./realtime";

export function attachWebSocketServer(server: Server, path = "/api/ws") {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const emitUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleConnection(ws, {
        cookie: req.headers.cookie ?? null,
        origin: (req.headers.origin as string | undefined) ?? null,
        host: req.headers.host ?? null,
      });
    });
  };
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== path) return; // diğer upgrade istekleri (ör. Next HMR) başka dinleyicilere kalır
    emitUpgrade(req, socket, head);
  });
  return Object.assign(wss, { emitUpgrade });
}
