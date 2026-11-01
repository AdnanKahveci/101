import { waitUntil } from "@vercel/functions";
import { authed } from "@/server/http";
import { processCommand } from "@/server/game-service";
import { runBots } from "@/server/bots";
import { commandSchema } from "@/server/validation";
import { AppError } from "@/server/errors";

/** HTTP yedek komut kanalı: WebSocket yeniden bağlanırken de aynı sunucu otoriteli hat kullanılır. */
export const POST = authed(commandSchema, async ({ user, body, params }) => {
  if (body.matchId !== params.id) throw new AppError("BAD_REQUEST", "Maç kimliği uyuşmuyor.");
  const r = await processCommand(user, body);
  waitUntil(runBots(body.matchId).catch((e) => console.error("[bots]", e)));
  return r;
});
