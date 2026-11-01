import { z } from "zod";
import { open, json } from "@/server/http";
import { createSession, limitAuthAttempts, registerUser, sessionCookie } from "@/server/auth";

export const POST = open(
  z.object({ username: z.string().max(32), password: z.string().max(128), displayName: z.string().max(32).optional(), avatar: z.string().max(32).optional() }),
  async ({ req, body }) => {
    await limitAuthAttempts(req);
    const user = await registerUser(body);
    const s = await createSession(user.id, req.headers.get("user-agent"));
    return json({ ok: true, user: { id: user.id, username: user.username } }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
  },
);
