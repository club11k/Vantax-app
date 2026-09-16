"use client";

import { TIER_COLOR, TIER_LABEL, CHEST_ACCENT_COLOR, type PlayTierValue } from "@/components/play/tierStyles";

export type PlayProgress = {
  tier: PlayTierValue;
  tierIndex: number;
  barFillPercent: number;
  aheadOfCount: number;
  pendingChests: { id: string; tier: string; label: string; kind: "self" }[];
  pendingGifts: { id: string; tier: string; rewardType: "VCOIN" | "ARTICLE"; label: string; kind: "gift" }[];
};

// Solo la barra en sí: dónde va el jugador dentro del tramo actual. Abrir
// cofres (propios o regalados) vive en ChestCabinet, aparte — ver esa
// pantalla para el armario con los 4 tramos.
export function TraderProgressBar({ progress }: { progress: PlayProgress }) {
  const color = TIER_COLOR[progress.tier];

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
          Progreso del Trader
        </div>
        <div style={{ fontSize: 12.5, color, fontWeight: 600 }}>{TIER_LABEL[progress.tier]}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 16,
            borderRadius: 999,
            background: "var(--bg-panel-raised)",
            border: "1px solid var(--line)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress.barFillPercent}%`,
              background: `linear-gradient(90deg, ${color}55, ${color})`,
              borderRadius: 999,
              transition: "width 0.6s ease",
            }}
          />
        </div>
        <div
          title="Sigue operando para desbloquear tu próximo cofre"
          style={{
            fontSize: 22,
            lineHeight: 1,
            filter: `drop-shadow(0 0 6px ${CHEST_ACCENT_COLOR}aa)`,
            color: CHEST_ACCENT_COLOR,
          }}
        >
          🎁
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Opera cada día y consigue tu recompensa.</p>

      <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
        {progress.aheadOfCount > 0
          ? `Vas por delante de ${progress.aheadOfCount} persona${progress.aheadOfCount === 1 ? "" : "s"} ¡Sigue así!`
          : "¡Sé el primero en subir de tramo esta vez!"}
      </p>
    </div>
  );
}

