"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function JoinByCode() {
  const [code, setCode] = useState("");
  const router = useRouter();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c.length >= 4) router.push(`/room/${c}`);
      }}
    >
      <Input aria-label="Oda kodu" placeholder="Oda kodu (ör. ABC123)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} className="uppercase" />
      <Button type="submit" variant="secondary" disabled={code.trim().length < 4}>
        Katıl
      </Button>
    </form>
  );
}

