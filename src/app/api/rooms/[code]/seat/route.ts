import { z } from "zod";
import { authed } from "@/server/http";
import { selectSeat } from "@/server/rooms";

export const POST = authed(z.object({ seat: z.number().int().min(0).max(3).nullable() }), async ({ user, body, params }) => ({
  room: await selectSeat(params.code, user, body.seat),
}));
