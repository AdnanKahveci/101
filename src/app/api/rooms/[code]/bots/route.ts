import { z } from "zod";
import { authed } from "@/server/http";
import { addBots, removeBot } from "@/server/rooms";

/** Boş koltukları botlarla doldur ({}) veya bir botu çıkar ({ remove: userId }). */
export const POST = authed(z.object({ remove: z.string().uuid().optional() }), async ({ user, body, params }) => ({
  room: body.remove ? await removeBot(params.code, user, body.remove) : await addBots(params.code, user),
}));
