import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-white/70" role="status">
      <Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…
    </div>
  );
}
