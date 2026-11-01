"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession, type Me } from "@/lib/session";

/** Oturum gerektiren sayfalar için: yoksa girişe yönlendirir. */
export function RequireSession({ children }: { children: (me: Me) => React.ReactNode }) {
  const { me, loaded, refresh } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loaded) void refresh();
    else if (!me) router.replace(`/?next=${encodeURIComponent(path ?? "/")}`);
  }, [loaded, me, refresh, router, path]);
  if (!loaded || !me) return <PageLoading />;
  return <>{children(me)}</>;
}

export function PageLoading({ text = "Yükleniyor…" }: { text?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-white/70" role="status">
      <Loader2 className="h-5 w-5 animate-spin" /> {text}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/60">
      <p className="font-bold text-white/80">{title}</p>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </div>
  );
}
