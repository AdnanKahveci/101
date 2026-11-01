"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, History, Home, LogIn, LogOut, Settings, Users, LayoutGrid } from "lucide-react";
import { useSession } from "@/lib/session";
import { AVATAR_EMOJI, cn } from "@/lib/utils";
import { realtime } from "@/lib/realtime";
import { toast } from "@/lib/toast";

export function Nav() {
  const { me, loaded, refresh, logout } = useSession();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  // Arkadaş daveti gibi bildirimleri her sayfada göster
  useEffect(() => {
    if (!me) return;
    const release = realtime.acquire();
    const off = realtime.on((m) => {
      if (m.t !== "notify") return;
      const d = m.data as Record<string, string>;
      if (m.kind === "invitation") toast.info(`${d.from} sizi "${d.roomName}" odasına davet etti. Panelden kabul edebilirsiniz.`);
      if (m.kind === "friendRequest") toast.info(`${d.from} size arkadaşlık isteği gönderdi.`);
      if (m.kind === "friendAccepted") toast.success(`${d.by} arkadaşlık isteğinizi kabul etti.`);
    });
    return () => {
      off();
      release();
    };
  }, [me]);
  if (path?.startsWith("/game/")) return null;
  const links = [
    { href: me ? "/dashboard" : "/", label: "Ana Sayfa", icon: Home },
    { href: "/rooms", label: "Odalar", icon: LayoutGrid },
    { href: "/friends", label: "Arkadaşlar", icon: Users },
    { href: "/history", label: "Geçmiş", icon: History },
    { href: "/rules", label: "Kurallar", icon: BookOpen },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-felt-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href={me ? "/dashboard" : "/"} className="mr-2 flex items-center gap-2 font-black tracking-tight">
          <span className="grid h-8 w-7 place-items-center rounded-md bg-cream text-sm font-black text-tile-red shadow">101</span>
          <span className="hidden sm:inline">Online 101 Okey</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white",
                path === l.href && "bg-white/10 text-white",
              )}
            >
              <l.icon className="h-4 w-4" />
              <span className="hidden md:inline">{l.label}</span>
            </Link>
          ))}
        </nav>
        {me ? (
          <div className="flex items-center gap-1">
            <Link href={`/profile/${me.username}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold hover:bg-white/10">
              <span className="text-lg">{AVATAR_EMOJI[me.avatar] ?? "🙂"}</span>
              <span className="hidden max-w-[8rem] truncate sm:inline">{me.displayName}</span>
            </Link>
            <Link href="/settings" aria-label="Ayarlar" className="rounded-lg p-2 text-white/70 hover:bg-white/10">
              <Settings className="h-4 w-4" />
            </Link>
            <button
              aria-label="Çıkış yap"
              className="rounded-lg p-2 text-white/70 hover:bg-white/10"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          loaded && (
            <Link href="/login" className="flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-felt-950">
              <LogIn className="h-4 w-4" /> Giriş
            </Link>
          )
        )}
      </div>
    </header>
  );
}
