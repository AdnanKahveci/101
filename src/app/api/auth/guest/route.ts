import { z } from "zod";
import { open, json } from "@/server/http";
import { createGuest, createSession, limitAuthAttempts, sessionCookie } from "@/server/auth";

export const POST = open(z.object({ nickname: z.string().max(32), avatar: z.string().max(32).optional() }), async ({ req, body }) => {
  await limitAuthAttempts(req);
  const user = await createGuest(body.nickname, body.avatar);
  const s = await createSession(user.id, req.headers.get("user-agent"));
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
