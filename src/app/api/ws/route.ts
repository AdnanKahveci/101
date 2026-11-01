import { upgradeWebSocket } from "@vercel/functions";
import { handleConnection } from "@/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Bağlantı en fazla fonksiyon süresi kadar yaşar; istemci otomatik yeniden bağlanır ve state'i geri yükler. */
export const maxDuration = 800;

/**
 * Vercel Functions WebSocket uç noktası (Fluid Compute).
 * Bağlantı bu instance'a sabitlenir; oyun state'i burada tutulmaz: Postgres (yetkili) + Redis (önbellek, pub/sub).
 */
export async function GET(req: Request) {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket bekleniyor", { status: 426 });
  }
  const info = {
    cookie: req.headers.get("cookie"),
    origin: req.headers.get("origin"),
    host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
  };
  return upgradeWebSocket((ws) => handleConnection(ws, info));
}
