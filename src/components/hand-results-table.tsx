import { FINISH_LABELS, type HandResult } from "@/engine/types";

/** El bazlı sonuç tablosu (geçmiş ve maç sonu için). */
export function HandResultsTable({ hands, names }: { hands: HandResult[]; names: string[] }) {
  if (hands.length === 0) return <p className="text-sm text-white/50">Bu maçta tamamlanmış el yok.</p>;
  const totals = [0, 1, 2, 3].map((s) => hands.reduce((sum, h) => sum + (h.playerScores as Record<number, number>)[s], 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-white/50">
            <th className="py-1 pr-2">El</th>
            <th className="py-1 pr-2">Bitiş</th>
            {names.map((n, i) => (
              <th key={i} className="py-1 pr-2 text-right">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hands.map((h) => (
            <tr key={h.handNumber} className="border-t border-white/10 align-top">
              <td className="py-1.5 pr-2 font-bold">{h.handNumber}</td>
              <td className="py-1.5 pr-2">
                <span className="font-semibold">{FINISH_LABELS[h.finishType]}</span>
                {h.multiplier > 1 && <span className="ml-1 text-gold">×{h.multiplier}</span>}
                <ul className="text-xs text-white/50">
                  {h.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </td>
              {[0, 1, 2, 3].map((s) => {
                const v = (h.playerScores as Record<number, number>)[s];
                return (
                  <td key={s} className={`py-1.5 pr-2 text-right font-bold ${v < 0 ? "text-emerald-300" : v > 0 ? "text-red-300" : ""}`}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-white/20 font-black">
            <td className="py-1.5" colSpan={2}>
              Toplam
            </td>
            {totals.map((t, i) => (
              <td key={i} className="py-1.5 pr-2 text-right">
                {t}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
