/**
 * Ortam değişkenleri. Üretimde eksik kritik servis varsa uygulama sahte başarı göstermez, açık hata verir.
 */
// Vercel'de (production ve preview) bellek içi yedekler asla kullanılmaz; OKEY_ALLOW_MEMORY yalnızca yerel `next start` denemeleri içindir.
export const isProduction = !!process.env.VERCEL || (process.env.NODE_ENV === "production" && process.env.OKEY_ALLOW_MEMORY !== "1");

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) return url;
  if (isProduction) throw new Error("DATABASE_URL tanımlı değil. Vercel'de yönetilen PostgreSQL bağlantısını ekleyin.");
  // Yalnızca geliştirme/test: gömülü, geçici PGlite (bellek içi).
  return "pglite:memory";
}

export function redisUrl(): string | null {
  const url = process.env.REDIS_URL ?? process.env.KV_URL;
  if (url) return url;
  if (isProduction) throw new Error("REDIS_URL tanımlı değil. Vercel'de yönetilen Redis bağlantısını ekleyin.");
  return null; // geliştirme/test: tek süreçli bellek içi adaptör
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (isProduction) throw new Error("SESSION_SECRET en az 32 karakter olmalı.");
  return "dev-only-session-secret-change-me-0123456789";
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  );
}
