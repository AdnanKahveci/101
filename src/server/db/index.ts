import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "../env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export { schema };

const globalForDb = globalThis as unknown as { __okeyDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  const url = databaseUrl();
  if (url.startsWith("pglite:")) {
    // Geliştirme/test için gömülü PostgreSQL (WASM). Üretimde asla kullanılmaz (env.ts).
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = url === "pglite:memory" ? undefined : url.slice("pglite:".length);
    const client = new PGlite(dataDir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    return db as unknown as Db;
  }
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 5_000,
    // sslmode URL'de varsa pg onu uygular; yoksa uzak sunucular için sertifika doğrulamalı TLS zorunludur.
    ssl: /sslmode=|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  try {
    // Vercel Fluid Compute: askıya alınmadan önce boştaki bağlantıları düzgün kapat.
    const { attachDatabasePool } = await import("@vercel/functions");
    attachDatabasePool(pool);
  } catch {
    /* Vercel dışı ortam */
  }
  return drizzlePg(pool, { schema });
}

export function migrationsFolder(): string {
  return process.env.OKEY_MIGRATIONS_DIR ?? `${process.cwd()}/drizzle`;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__okeyDb) {
    globalForDb.__okeyDb = createDb().catch((e) => {
      globalForDb.__okeyDb = undefined;
      throw e;
    });
  }
  return globalForDb.__okeyDb;
}

/** Testler için: izole bir veritabanı enjekte etmeye izin verir. */
export function setDbForTests(db: Promise<Db> | undefined) {
  globalForDb.__okeyDb = db;
}
