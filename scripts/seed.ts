/**
 * Geliştirme verisi: dört demo kullanıcı ve bir herkese açık oda.
 * Üretim veritabanında çalışmayı reddeder; mevcut veriyi silmez.
 */
import { eq } from "drizzle-orm";

async function main() {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    console.error("Seed üretimde çalıştırılamaz.");
    process.exit(1);
  }
  process.env.DATABASE_URL ??= "pglite:./.pglite";
  const { getDb, schema } = await import("../src/server/db");
  const { registerUser } = await import("../src/server/auth");
  const { createRoom } = await import("../src/server/rooms");
  const db = await getDb();
  const names = ["ayse", "bora", "cem", "deniz"];
  const users = [];
  for (const n of names) {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, n)).limit(1);
    users.push(existing ?? (await registerUser({ username: n, password: "okey1234", displayName: n[0].toUpperCase() + n.slice(1) })));
  }
  const me = users[0];
  const room = await createRoom(
    { id: me.id, username: me.username, displayName: me.displayName, isGuest: false, avatar: me.avatar },
    { name: "Demo Masası", visibility: "public" },
  );
  console.log(`Demo kullanıcılar: ${names.join(", ")} (şifre: okey1234). Demo oda: /room/${room.code}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
