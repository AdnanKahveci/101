import { waitUntil } from "@vercel/functions";
import { authed } from "@/server/http";
import { startMatch } from "@/server/rooms";
import { runBots } from "@/server/bots";

export const POST = authed(undefined, async ({ user, params }) => {
  const r = await startMatch(params.code, user);
  // İlk oyuncu bot olabilir: istemciler masaya geçtikten sonra oynamaya başlasın.
  waitUntil(
    new Promise((res) => setTimeout(res, 2500))
      .then(() => runBots(r.matchId))
      .catch((e) => console.error("[bots]", e)),
  );
  return r;
});
