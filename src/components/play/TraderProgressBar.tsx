"use client";

import { useState } from "react";
import { ChestOpenModal } from "@/components/play/ChestOpenModal";

export type PlayProgress = {
  tier: "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO";
  tierIndex: number;
  barFillPercent: number;
  aheadOfCount: number;
  pendingChests: { id: string; tier: string; label: string; kind: "self" }[];
  pendingGifts: { id: string; tier: string; rewardType: "VCOIN" | "ARTICLE"; label: string; kind: "gift" }[];
};

// Colores por tramo — deliberadamente distintos entre sí y del color del
// icono de cofre al final de la barra (ver TIER_ACCENT_CHEST_COLOR), tal y
// como pidió Esther. Legendario es lila a propósito.
const TIER_COLOR: Record<PlayProgress["tier"], string> = {
  BASICO: "#8B92A8",
  INTERMEDIO: "#63A88C",
  EPICO: "#D9A15B",
  LEGENDARIO: "#BBAAF7",
};
const TIER_LABEL: Record<PlayProgress["tier"], string> = {
  BASICO: "Básico",
  INTERMEDIO: "Intermedio",
  EPICO: "Épico",
  LEGENDARIO: "Legendario",
};
// Color del cofre decorativo al final de la barra: distinto a los 4 de
// arriba, para que siempre destaque sea cual sea el tramo actual.
const CHEST_ACCENT_COLOR = "#C15A82";

export function TraderProgressBar({ progress, onChanged }: { progress: PlayProgress; onChanged: () => void }) {
  const [opening, setOpening] = useState<
    | { kind: "self" | "gift"; id: string; tier: string; label: string }
    | null
  >(null);

  const color = TIER_COLOR[progress.tier];
  const pending = [...progress.pendingChests, ...progress.pendingGifts];

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

      {pending.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Cofres para abrir
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {pending.map((p) => (
              <button
                key={`${p.kind}-${p.id}`}
                className="btn"
                onClick={() => setOpening({ kind: p.kind, id: p.id, tier: p.tier, label: p.label })}
                style={{ display: "flex", alignItems: "center", gap: 8, borderColor: TIER_COLOR[p.tier as PlayProgress["tier"]] }}
              >
                <span style={{ fontSize: 18 }}>🎁</span>
                {p.label}
                {p.kind === "gift" && <span className="tag neu">Regalo</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {opening && (
        <ChestOpenModal
          kind={opening.kind}
          id={opening.id}
          tierColor={TIER_COLOR[opening.tier as PlayProgress["tier"]] ?? CHEST_ACCENT_COLOR}
          label={opening.label}
          onClose={(didOpen) => {
            setOpening(null);
            if (didOpen) onChanged();
          }}
        />
      )}
    </div>
  );
}
