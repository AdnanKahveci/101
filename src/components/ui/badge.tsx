import { cn } from "@/lib/utils";

export function Badge({ className, children, tone = "default" }: { className?: string; children: React.ReactNode; tone?: "default" | "gold" | "green" | "red" }) {
  const tones = {
    default: "bg-white/10 text-white/80",
    gold: "bg-gold/20 text-gold",
    green: "bg-emerald-500/20 text-emerald-300",
    red: "bg-red-500/20 text-red-300",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold", tones[tone], className)}>{children}</span>;
}
