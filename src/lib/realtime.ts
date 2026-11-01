"use client";
/**
 * Tarayıcı WebSocket istemcisi: otomatik yeniden bağlanma (üstel bekleme), kalp atışı,
 * abonelikleri geri yükleme ve WebSocket yokken HTTP yedek komut kanalı.
 * Vercel Functions bağlantıları fonksiyon süresi dolunca kapanabilir; istemci sessizce yeniden bağlanır.
 */
import { api } from "./api";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "offline";

type ServerMsg = { t: string; [k: string]: unknown };
type Listener = (m: ServerMsg) => void;

interface Pending {
  resolve: (r: { ok: true; version: number } | { ok: false; code: string; error: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private pending = new Map<string, Pending>();
  private attempts = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantRoom: { code: string; token?: string } | null = null;
  private wantMatch: string | null = null;
  private refs = 0;
  status: ConnStatus = "connecting";
  serverOffset = 0;

  acquire() {
    this.refs++;
    if (!this.ws && !this.reconnectTimer) this.connect();
    return () => {
      this.refs--;
      if (this.refs <= 0) setTimeout(() => this.refs <= 0 && this.shutdown(), 1000);
    };
  }

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private connect() {
    if (typeof window === "undefined") return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`;
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return ws.close(); // eski soket
      this.attempts = 0;
      this.setStatus("open");
      if (this.wantRoom) this.raw({ t: "room", ...this.wantRoom });
      if (this.wantMatch) this.raw({ t: "watch", matchId: this.wantMatch });
      this.heartbeat = setInterval(() => this.raw({ t: "ping" }), 10_000);
      this.raw({ t: "ping" });
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let m: ServerMsg;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.t === "welcome" || m.t === "pong") this.serverOffset = Number(m.serverTime) - Date.now();
      if (m.t === "ack" || m.t === "nack") {
        const p = this.pending.get(String(m.commandId));
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(String(m.commandId));
          p.resolve(m.t === "ack" ? { ok: true, version: Number(m.version) } : { ok: false, code: String(m.code), error: String(m.error) });
        }
      }
      this.listeners.forEach((l) => l(m));
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return; // yerini yeni bir soket almış; durumu ezme
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      if (this.refs <= 0) return;
      if (ev.code === 4001) {
        this.setStatus("offline");
        return;
      }
      this.attempts++;
      this.setStatus(navigator.onLine === false ? "offline" : "reconnecting");
      const delay = Math.min(15_000, 400 * 2 ** Math.min(this.attempts, 6)) * (0.75 + Math.random() * 0.5);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private shutdown() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const old = this.ws;
    this.ws = null;
    old?.close();
  }

  private raw(obj: unknown): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  watchRoom(code: string, token?: string) {
    this.wantRoom = { code, token };
    this.raw({ t: "room", code, token });
  }
  unwatchRoom() {
    this.wantRoom = null;
  }
  watchMatch(matchId: string) {
    this.wantMatch = matchId;
    this.raw({ t: "watch", matchId });
  }
  unwatchMatch() {
    this.wantMatch = null;
  }
  sync(matchId: string) {
    this.raw({ t: "sync", matchId });
  }

  /** Komutu gönderir. WebSocket kapalıysa aynı komut kimliğiyle HTTP üzerinden gönderilir (tekrar güvenli). */
  async command(cmd: { commandId: string; matchId: string; expectedVersion: number; action: unknown }) {
    if (this.raw({ t: "cmd", cmd })) {
      return new Promise<{ ok: true; version: number } | { ok: false; code: string; error: string }>((resolve) => {
        const timer = setTimeout(async () => {
          this.pending.delete(cmd.commandId);
          resolve(await this.httpCommand(cmd));
        }, 8000);
        this.pending.set(cmd.commandId, { resolve, timer });
      });
    }
    return this.httpCommand(cmd);
  }

  private async httpCommand(cmd: { commandId: string; matchId: string; expectedVersion: number; action: unknown }) {
    try {
      const r = await api<{ version: number }>(`/api/matches/${cmd.matchId}/command`, { body: cmd });
      return { ok: true as const, version: r.version };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { ok: false as const, code: err.code ?? "NETWORK", error: err.message };
    }
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onStatus(l: (s: ConnStatus) => void) {
    this.statusListeners.add(l);
    l(this.status);
    return () => this.statusListeners.delete(l);
  }
  now() {
    return Date.now() + this.serverOffset;
  }
}

export const realtime = new RealtimeClient();
