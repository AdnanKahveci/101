"use client";
import { useState } from "react";
import { HAND_COUNT_OPTIONS } from "@/engine/rules";
import type { RoomSettings } from "@/server/validation";
import { Input, Label, Select } from "./ui/input";
import { Switch } from "./ui/switch";

export const DEFAULT_SETTINGS: RoomSettings = {
  teamMode: false,
  folding: false,
  assisted: true,
  penaltiesEnabled: true,
  allowRunOpening: true,
  allowPairOpening: true,
  allowThirteenOne: false,
  allowJokerPair: true,
  pairOpenerCanAddToMelds: true,
  teamOpeningPolicy: "independent",
  jokerReplacePolicy: "openedOnly",
  jokerFinishMultiplier: 2,
  pairFinishMultiplier: 2,
  handFinishMultiplier: 2,
  stackMultipliers: true,
  partnerOfFinisherScoresZero: true,
  silerEnabled: false,
  deckExhaustedScoring: "penalties",
  totalHands: 11,
  turnSeconds: 60,
  timeoutPolicy: "autoPlay",
  allowSpectators: true,
};

/** Oda ayarları formu. disabled iken (oda sahibi değil / maç sürüyor) yalnızca görüntülenir. */
export function RoomSettingsForm({
  value,
  onChange,
  disabled,
}: {
  value: RoomSettings;
  onChange: (v: RoomSettings) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => onChange({ ...value, [k]: v });
  const isPreset = (HAND_COUNT_OPTIONS as readonly number[]).includes(value.totalHands);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-1 text-xs font-black uppercase tracking-wider text-gold">Oyun türü</h3>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Switch label="Eşli 101" description="Alt+Üst ve Sağ+Sol takım olur" checked={value.teamMode} onChange={(v) => set("teamMode", v)} disabled={disabled} />
          <Switch label="Katlamalı" description="Her açılış öncekini geçmeli (101→102…, 5→6 çift…)" checked={value.folding} onChange={(v) => set("folding", v)} disabled={disabled} />
          <Switch label="Yardımlı" description="Sıralama, per önerisi, puan hesabı, işleme vurgusu" checked={value.assisted} onChange={(v) => set("assisted", v)} disabled={disabled} />
          <Switch label="Cezalı" description="Okey / işlek taş atma ve yan taşı kullanamama cezası" checked={value.penaltiesEnabled} onChange={(v) => set("penaltiesEnabled", v)} disabled={disabled} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hands">El sayısı</Label>
          <div className="flex gap-2">
            <Select
              id="hands"
              disabled={disabled}
              value={custom ? "custom" : String(value.totalHands)}
              onChange={(e) => {
                if (e.target.value === "custom") setCustom(true);
                else {
                  setCustom(false);
                  set("totalHands", Number(e.target.value));
                }
              }}
            >
              {HAND_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} el
                </option>
              ))}
              <option value="custom">Özel…</option>
            </Select>
            {custom && (
              <Input
                aria-label="Özel el sayısı"
                type="number"
                min={1}
                max={51}
                className="h-10 w-24"
                disabled={disabled}
                value={value.totalHands}
                onChange={(e) => set("totalHands", Math.trunc(Number(e.target.value)) || 1)}
              />
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="turn">Hamle süresi</Label>
          <Select id="turn" disabled={disabled} value={value.turnSeconds} onChange={(e) => set("turnSeconds", Number(e.target.value))}>
            {[0, 30, 45, 60, 90, 120, 180].map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "Süresiz" : `${s} saniye`}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="timeout">Süre dolunca / oyuncu ayrılınca</Label>
          <Select id="timeout" disabled={disabled} value={value.timeoutPolicy} onChange={(e) => set("timeoutPolicy", e.target.value as RoomSettings["timeoutPolicy"])}>
            <option value="autoPlay">Otomatik yasal hamle (çek + çekileni at)</option>
            <option value="wait">Bekle (otomatik hamle yok)</option>
          </Select>
        </div>
        {value.teamMode && (
          <div>
            <Label htmlFor="teamopen">Eşin açılış politikası</Label>
            <Select id="teamopen" disabled={disabled} value={value.teamOpeningPolicy} onChange={(e) => set("teamOpeningPolicy", e.target.value as RoomSettings["teamOpeningPolicy"])}>
              <option value="independent">Yalnızca rakip açılışları barajı yükseltir (eşin 101 yeter)</option>
              <option value="table">Masa barajı herkese geçerli</option>
              <option value="partnerBase">Eşi açan, temel 101 / 5 çiftle açar</option>
            </Select>
          </div>
        )}
      </section>

      <details className="rounded-xl border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-bold text-white/80">Gelişmiş kurallar</summary>
        <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
          <Switch label="Seri açma" checked={value.allowRunOpening} onChange={(v) => set("allowRunOpening", v)} disabled={disabled} />
          <Switch label="Çift açma" checked={value.allowPairOpening} onChange={(v) => set("allowPairOpening", v)} disabled={disabled} />
          <Switch label="Okeyle çift" description="Okey + herhangi taş çift sayılır" checked={value.allowJokerPair} onChange={(v) => set("allowJokerPair", v)} disabled={disabled} />
          <Switch label="Çift açan pere işler" checked={value.pairOpenerCanAddToMelds} onChange={(v) => set("pairOpenerCanAddToMelds", v)} disabled={disabled} />
          <Switch label="Okey değiştirme" description="Açmış oyuncu masadaki okeyi gerçek taşla alabilir" checked={value.jokerReplacePolicy === "openedOnly"} onChange={(v) => set("jokerReplacePolicy", v ? "openedOnly" : "disabled")} disabled={disabled} />
          <Switch label="Siler" description="Elden biten, biriken pozitif cezalarını siler" checked={value.silerEnabled} onChange={(v) => set("silerEnabled", v)} disabled={disabled} />
          {value.teamMode && (
            <Switch label="Bitirenin eşi ceza yazmaz" checked={value.partnerOfFinisherScoresZero} onChange={(v) => set("partnerOfFinisherScoresZero", v)} disabled={disabled} />
          )}
          <Switch label="Çarpanlar çarpılarak birleşir" description="Kapalıysa en büyük çarpan uygulanır" checked={value.stackMultipliers} onChange={(v) => set("stackMultipliers", v)} disabled={disabled} />
          <Switch label="Seyirci izni" description="Seyirciler gizli taşları asla göremez" checked={value.allowSpectators} onChange={(v) => set("allowSpectators", v)} disabled={disabled} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {(
            [
              ["jokerFinishMultiplier", "Okeyle bitiş ×"],
              ["pairFinishMultiplier", "Çiftten bitiş ×"],
              ["handFinishMultiplier", "Elden bitiş ×"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <Label htmlFor={k}>{label}</Label>
              <Select id={k} disabled={disabled} value={value[k]} onChange={(e) => set(k, Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    ×{n}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <div>
            <Label htmlFor="deck">Deste bitince</Label>
            <Select id="deck" disabled={disabled} value={value.deckExhaustedScoring} onChange={(e) => set("deckExhaustedScoring", e.target.value as RoomSettings["deckExhaustedScoring"])}>
              <option value="penalties">Eller yazılır</option>
              <option value="noScore">Puan yazılmaz</option>
            </Select>
          </div>
        </div>
      </details>
    </div>
  );
}
