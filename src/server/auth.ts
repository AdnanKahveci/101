import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "./db";
import { AppError, fail } from "./errors";
import { isProduction } from "./env";
import { getInfra } from "./infra";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const SESSION_COOKIE = "okey_session";
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  isGuest: boolean;
  avatar: string;
}

// ------------------------------------------------------------------ Şifreler

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ------------------------------------------------------------------ Oturumlar

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, userAgent?: string | null): Promise<{ token: string; expires: Date }> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt: expires, userAgent: userAgent?.slice(0, 256) ?? null });
  return { token, expires };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
}

export async function userFromToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || token.length > 128) return null;
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      isGuest: schema.users.isGuest,
      avatar: schema.users.avatar,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export function sessionCookie(token: string, expires: Date): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
  ];
  if (isProduction || process.env.VERCEL) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function userFromRequest(req: Request): Promise<AuthUser | null> {
  return userFromToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const u = await userFromRequest(req);
  if (!u) throw new AppError("UNAUTHORIZED", "Bu işlem için giriş yapmalısınız.");
  return u;
}

// --------------------------------------------------------------- Hesaplar

export const AVATARS = ["cay", "simit", "lale", "nazar", "kedi", "marti", "zeytin", "lokum", "kahve", "cinar"] as const;

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

export async function registerUser(input: { username: string; password: string; displayName?: string; avatar?: string }) {
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) fail("BAD_REQUEST", "Kullanıcı adı 3-20 karakter olmalı; yalnızca a-z, 0-9 ve _ kullanılabilir.");
  if (input.password.length < 8) fail("BAD_REQUEST", "Şifre en az 8 karakter olmalı.");
  const db = await getDb();
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).limit(1);
  if (existing.length) fail("CONFLICT", "Bu kullanıcı adı alınmış.");
  const [user] = await db
    .insert(schema.users)
    .values({
      username,
      displayName: (input.displayName?.trim() || username).slice(0, 32),
      passwordHash: await hashPassword(input.password),
      avatar: pickAvatar(input.avatar),
    })
    .returning();
  await db.insert(schema.playerStatistics).values({ userId: user.id });
  await db.insert(schema.userPreferences).values({ userId: user.id });
  return user;
}

export async function loginUser(username: string, password: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, normalizeUsername(username))).limit(1);
  // Zamanlama farkını azaltmak için kullanıcı yoksa da hash doğrulaması yapılır.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !ok || user.isGuest) fail("UNAUTHORIZED", "Kullanıcı adı veya şifre hatalı.");
  return user!;
}

export function pickAvatar(a?: string): string {
  return a && (AVATARS as readonly string[]).includes(a) ? a : "cay";
}

export async function createGuest(nickname: string, avatar?: string) {
  const name = nickname.trim();
  if (name.length < 2 || name.length > 20) fail("BAD_REQUEST", "Takma ad 2-20 karakter olmalı.");
  const db = await getDb();
  const username = `misafir_${randomBytes(5).toString("hex")}`;
  const [user] = await db
    .insert(schema.users)
    .values({ username, displayName: name, isGuest: true, avatar: pickAvatar(avatar) })
    .returning();
  await db.insert(schema.guestIdentities).values({ userId: user.id });
  await db.insert(schema.playerStatistics).values({ userId: user.id });
  await db.insert(schema.userPreferences).values({ userId: user.id });
  return user;
}

/** Misafir hesabı kayıtlı hesaba dönüştürür; maç geçmişi ve istatistikler korunur. */
export async function upgradeGuest(userId: string, input: { username: string; password: string }) {
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) fail("BAD_REQUEST", "Kullanıcı adı 3-20 karakter olmalı; yalnızca a-z, 0-9 ve _ kullanılabilir.");
  if (input.password.length < 8) fail("BAD_REQUEST", "Şifre en az 8 karakter olmalı.");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!me?.isGuest) fail("BAD_REQUEST", "Hesabınız zaten kayıtlı.");
  const taken = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).limit(1);
  if (taken.length) fail("CONFLICT", "Bu kullanıcı adı alınmış.");
  await db
    .update(schema.users)
    .set({ username, passwordHash: await hashPassword(input.password), isGuest: false })
    .where(eq(schema.users.id, userId));
  await db.update(schema.guestIdentities).set({ upgradedAt: new Date() }).where(eq(schema.guestIdentities.userId, userId));
}

/** Kimlik doğrulama denemeleri için IP başına sınırlama. */
export async function limitAuthAttempts(req: Request) {
  const infra = await getInfra();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const n = await infra.incrWindow(`rl:auth:${ip}`, 60_000);
  if (n > 20) fail("RATE_LIMITED", "Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.");
}
