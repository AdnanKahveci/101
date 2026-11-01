import { z } from "zod";
import { open, json } from "@/server/http";
import { createSession, limitAuthAttempts, loginUser, sessionCookie } from "@/server/auth";

export const POST = open(z.object({ username: z.string().max(32), password: z.string().max(128) }), async ({ req, body }) => {
  await limitAuthAttempts(req);
  const user = await loginUser(body.username, body.password);
  const s = await createSession(user.id, req.headers.get("user-agent"));
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
