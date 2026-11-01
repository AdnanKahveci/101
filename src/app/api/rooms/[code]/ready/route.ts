import { z } from "zod";
import { authed } from "@/server/http";
import { setReady } from "@/server/rooms";

export const POST = authed(z.object({ ready: z.boolean() }), async ({ user, body, params }) => ({
  room: await setReady(params.code, user, body.ready),
}));
