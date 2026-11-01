/**
 * Hızlı geçici state ve instance'lar arası olay altyapısı.
 * Üretim: bulut Redis (ioredis, REDIS_URL). Geliştirme/test: tek süreçli bellek içi adaptör.
 */
import { redisUrl } from "./env";

export type Unsubscribe = () => Promise<void>;

export interface Infra {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  mget(keys: string[]): Promise<(string | null)[]>;
  /** Anahtar yoksa yazar (kilit). Başarılıysa true. */
  setNX(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** Değer eşleşiyorsa siler (kilidi yalnızca sahibi bırakır). */
  delIfEquals(key: string, value: string): Promise<void>;
  /** Sabit pencereli sayaç (rate limit). Pencere içindeki toplamı döner. */
  incrWindow(key: string, windowMs: number): Promise<number>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<Unsubscribe>;
  close(): Promise<void>;
}

// ------------------------------------------------------------------ Bellek içi

export class MemoryInfra implements Infra {
  private store = new Map<string, { v: string; exp: number | null }>();
  private subs = new Map<string, Set<(m: string) => void>>();

  private alive(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.exp !== null && e.exp < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }
  async get(key: string) {
    return this.alive(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlMs?: number) {
    this.store.set(key, { v: value, exp: ttlMs ? Date.now() + ttlMs : null });
  }
  async del(key: string) {
    this.store.delete(key);
  }
  async mget(keys: string[]) {
    return keys.map((k) => this.alive(k)?.v ?? null);
  }
  async setNX(key: string, value: string, ttlMs: number) {
    if (this.alive(key)) return false;
    this.store.set(key, { v: value, exp: Date.now() + ttlMs });
    return true;
  }
  async delIfEquals(key: string, value: string) {
    if (this.alive(key)?.v === value) this.store.delete(key);
  }
  async incrWindow(key: string, windowMs: number) {
    const e = this.alive(key);
    const n = e ? Number(e.v) + 1 : 1;
    this.store.set(key, { v: String(n), exp: e?.exp ?? Date.now() + windowMs });
    return n;
  }
  async publish(channel: string, message: string) {
    // Gerçek Redis gibi asenkron teslim.
    const handlers = [...(this.subs.get(channel) ?? [])];
    queueMicrotask(() => handlers.forEach((h) => h(message)));
  }
  async subscribe(channel: string, handler: (m: string) => void) {
    if (!this.subs.has(channel)) this.subs.set(channel, new Set());
    this.subs.get(channel)!.add(handler);
    return async () => {
      this.subs.get(channel)?.delete(handler);
    };
  }
  async close() {}
}

// ----------------------------------------------------------------------- Redis

export class RedisInfra implements Infra {
  private cmd: import("ioredis").Redis;
  private sub: import("ioredis").Redis | null = null;
  private handlers = new Map<string, Set<(m: string) => void>>();

  constructor(
    private url: string,
    private Redis: typeof import("ioredis").Redis,
  ) {
    this.cmd = new Redis(url, { maxRetriesPerRequest: 3, enableAutoPipelining: true, lazyConnect: false });
    this.cmd.on("error", (e) => console.error("[redis] komut bağlantısı hatası:", e.message));
  }

  private subscriber() {
    if (!this.sub) {
      this.sub = new this.Redis(this.url, { maxRetriesPerRequest: null });
      this.sub.on("error", (e) => console.error("[redis] abonelik bağlantısı hatası:", e.message));
      this.sub.on("message", (channel: string, message: string) => {
        this.handlers.get(channel)?.forEach((h) => h(message));
      });
    }
    return this.sub;
  }

  async get(key: string) {
    return this.cmd.get(key);
  }
  async set(key: string, value: string, ttlMs?: number) {
    if (ttlMs) await this.cmd.set(key, value, "PX", ttlMs);
    else await this.cmd.set(key, value);
  }
  async del(key: string) {
    await this.cmd.del(key);
  }
  async mget(keys: string[]) {
    if (keys.length === 0) return [];
    return this.cmd.mget(...keys);
  }
  async setNX(key: string, value: string, ttlMs: number) {
    return (await this.cmd.set(key, value, "PX", ttlMs, "NX")) === "OK";
  }
  async delIfEquals(key: string, value: string) {
    await this.cmd.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      value,
    );
  }
  async incrWindow(key: string, windowMs: number) {
    const n = await this.cmd.incr(key);
    if (n === 1) await this.cmd.pexpire(key, windowMs);
    return n;
  }
  async publish(channel: string, message: string) {
    await this.cmd.publish(channel, message);
  }
  async subscribe(channel: string, handler: (m: string) => void) {
    const sub = this.subscriber();
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await sub.subscribe(channel);
    }
    this.handlers.get(channel)!.add(handler);
    return async () => {
      const set = this.handlers.get(channel);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(channel);
        await sub.unsubscribe(channel).catch(() => {});
      }
    };
  }
  async close() {
    await Promise.allSettled([this.cmd.quit(), this.sub?.quit()]);
  }
}

const g = globalThis as unknown as { __okeyInfra?: Promise<Infra> };

export function getInfra(): Promise<Infra> {
  if (!g.__okeyInfra) {
    g.__okeyInfra = (async () => {
      const url = redisUrl();
      if (!url) return new MemoryInfra();
      const { Redis } = await import("ioredis");
      return new RedisInfra(url, Redis);
    })();
  }
  return g.__okeyInfra;
}

export function setInfraForTests(infra: Infra | undefined) {
  g.__okeyInfra = infra ? Promise.resolve(infra) : undefined;
}

/** Basit dağıtık kilit: kısa süreli, sahibine özel. */
export async function withLock<T>(infra: Infra, key: string, fn: () => Promise<T>, opts = { ttlMs: 8000, waitMs: 4000 }): Promise<T> {
  const token = crypto.randomUUID();
  const deadline = Date.now() + opts.waitMs;
  let delay = 15;
  while (!(await infra.setNX(key, token, opts.ttlMs))) {
    if (Date.now() > deadline) throw new Error("LOCK_TIMEOUT");
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 150);
  }
  try {
    return await fn();
  } finally {
    await infra.delIfEquals(key, token);
  }
}
