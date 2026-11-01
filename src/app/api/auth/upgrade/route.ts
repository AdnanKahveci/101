import { z } from "zod";
import { authed } from "@/server/http";
import { upgradeGuest } from "@/server/auth";

export const POST = authed(z.object({ username: z.string().max(32), password: z.string().max(128) }), async ({ user, body }) => {
  await upgradeGuest(user.id, body);
  return { ok: true };
});
