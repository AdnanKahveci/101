"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { AVATARS, AVATAR_EMOJI, cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
      {AVATARS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          aria-label={a}
          onClick={() => onChange(a)}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl border text-xl transition",
            value === a ? "border-gold bg-gold/20" : "border-white/10 bg-black/20 hover:bg-white/10",
          )}
        >
          {AVATAR_EMOJI[a]}
        </button>
      ))}
    </div>
  );
}

/** Misafir girişi: takma ad + avatar. */
export function GuestForm({ next }: { next?: string | null }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("cay");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const refresh = useSession((s) => s.refresh);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/auth/guest", { body: { nickname, avatar } });
          await refresh();
          router.push(next || "/");
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="nickname">Takma ad</Label>
        <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="ör. Okeyci Ahmet" minLength={2} maxLength={20} required />
      </div>
      <div>
        <Label>Avatar</Label>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>
      <Button type="submit" className="w-full" disabled={busy || nickname.trim().length < 2}>
        {busy ? "Giriliyor…" : "Misafir olarak oyna"}
      </Button>
    </form>
  );
}
