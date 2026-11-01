import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";
import { requireUser, userFromRequest, type AuthUser } from "./auth";
import { parseBody } from "./validation";

type Params = Record<string, string>;
type Ctx = { params: Promise<Params> };

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[api]", e);
  return json({ error: "Beklenmeyen bir sunucu hatası oluştu.", code: "INTERNAL" }, { status: 500 });
}

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 64 * 1024) throw new AppError("BAD_REQUEST", "İstek çok büyük.");
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("BAD_REQUEST", "Geçersiz JSON.");
  }
}

/** Yazma isteklerinde CSRF koruması: Origin başlığı varsa aynı host olmalı. */
function checkOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Geçersiz istek kaynağı.");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("FORBIDDEN", "Geçersiz istek kaynağı.");
  }
}

/** Oturum gerektiren uç nokta. */
export function authed<S extends z.ZodType | undefined>(
  schema: S,
  fn: (args: { req: Request; user: AuthUser; body: S extends z.ZodType ? z.infer<S> : undefined; params: Params }) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      checkOrigin(req);
      const user = await requireUser(req);
      const body = schema ? parseBody(schema, await readJson(req)) : undefined;
      const res = await fn({ req, user, body: body as never, params: await ctx.params });
      return res instanceof Response ? res : json(res ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Oturum gerektirmeyen uç nokta (kullanıcı varsa iletilir). */
export function open<S extends z.ZodType | undefined>(
  schema: S,
  fn: (args: { req: Request; user: AuthUser | null; body: S extends z.ZodType ? z.infer<S> : undefined; params: Params }) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      checkOrigin(req);
      const user = await userFromRequest(req);
      const body = schema ? parseBody(schema, await readJson(req)) : undefined;
      const res = await fn({ req, user, body: body as never, params: await ctx.params });
      return res instanceof Response ? res : json(res ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
