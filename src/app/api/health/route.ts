import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { getInfra } from "@/server/infra";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Sağlık kontrolü: veritabanı ve Redis gerçekten erişilebilir mi? Sahte başarı döndürmez. */
export async function GET() {
  const checks: Record<string, string> = {};
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    checks.database = "ok";
  } catch (e) {
    console.error("[health] veritabanı", e);
    checks.database = "hata"; // ayrıntı (host, kullanıcı) herkese açık yanıtta gösterilmez
  }
  try {
    const infra = await getInfra();
    await infra.set("okey:health", String(Date.now()), 10_000);
    checks.redis = infra.constructor.name === "MemoryInfra" ? "bellek-içi (yalnızca geliştirme)" : "ok";
  } catch (e) {
    console.error("[health] redis", e);
    checks.redis = "hata";
  }
  const ok = checks.database === "ok" && !checks.redis.startsWith("hata");
  return json({ ok, checks }, { status: ok ? 200 : 503 });
}
