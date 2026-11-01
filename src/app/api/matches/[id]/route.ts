import { authed } from "@/server/http";
import { viewFor } from "@/server/game-service";

/** WebSocket bağlantısı yokken (ilk yükleme / yedek) oyuncunun görünümü. */
export const GET = authed(undefined, async ({ user, params }) => ({ view: await viewFor(user.id, params.id) }));
