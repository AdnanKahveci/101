/**
 * Veritabanı migration'larını uygular (yalnızca ileri yönlü, veri silmez).
 * Vercel'de `vercel-build` adımında DATABASE_URL ile otomatik çalışır.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
      console.error("HATA: DATABASE_URL tanımlı değil. Vercel proje ayarlarından yönetilen PostgreSQL bağlayın.");
      process.exit(1);
    }
    console.log("DATABASE_URL yok; migration atlandı (yerelde gömülü PGlite otomatik migrate edilir).");
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: /sslmode=|localhost|127.0.0.1/.test(url) ? undefined : { rejectUnauthorized: true }, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migration'lar uygulandı.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Migration hatası:", e);
  process.exit(1);
});
