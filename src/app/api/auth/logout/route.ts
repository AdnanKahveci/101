import { open, json } from "@/server/http";
import { SESSION_COOKIE, clearSessionCookie, destroySession, readCookie } from "@/server/auth";

export const POST = open(undefined, async ({ req }) => {
  await destroySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});
