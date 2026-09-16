"use client";

import { useState } from "react";
import { ChestOpenModal } from "@/components/play/ChestOpenModal";
import { TIER_ORDER, TIER_COLOR, TIER_LABEL, CHEST_ACCENT_COLOR, type PlayTierValue } from "@/components/play/tierStyles";
import type { PlayProgress } from "@/components/play/TraderProgressBar";

// El "armario" permanente de cofres: siempre se ven los 4 tramos (Básico →
// Legendario), cada uno en su color y con su estado — bloqueado, en curso,
// superado, o listo para abrir — como en el Vantax Play de antes. Los
// regalos de un admin se muestran aparte debajo, porque pueden tocar
// cualquier tramo sin depender de en qué tramo va el jugador.

type Opening = { kind: "self" | "gift"; id: string; tier: string; label: string };

function ChestTile({
  tier,
  state,
  onClick,
}: {
  tier: PlayTierValue;
  state: "locked" | "current" | "cleared" | "pending";
  onClick?: () => void;
}) {
  const color = TIER_COLOR[tier];
  const clickable = state === "pending";
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={clickable ? "btn" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "16px 10px",
        borderRadius: 10,
        border: `1px solid ${state === "locked" ? "var(--line)" : color + "55"}`,
        background: state === "pending" ? `${color}18` : "var(--bg-panel-raised)",
        cursor: clickable ? "pointer" : "default",
        opacity: state === "locked" ? 0.55 : 1,
        animation: state === "pending" ? "chest-cabinet-pulse 1.8s ease-in-out infinite" : undefined,
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1, filter: state === "locked" ? undefined : `drop-shadow(0 0 6px ${color}aa)` }}>
        {state === "locked" ? "🔒" : "🎁"}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: state === "locked" ? "var(--text-dim)" : color }}>
        {TIER_LABEL[tier]}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {state === "locked" && "Bloqueado"}
        {state === "current" && "En curso"}
        {state === "cleared" && "Superado"}
        {state === "pending" && "¡Ábrelo!"}
      </span>
    </button>
  );
}

export function ChestCabinet({ progress, onChanged }: { progress: PlayProgress; onChanged: () => void }) {
  const [opening, setOpening] = useState<Opening | null>(null);

  const pendingByTier = new Map(progress.pendingChests.map((c) => [c.tier, c]));

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        Tus cofres
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10 }}>
        {TIER_ORDER.map((tier, i) => {
          const pending = pendingByTier.get(tier);
          let state: "locked" | "current" | "cleared" | "pending" = "locked";
          if (pending) state = "pending";
          else if (i < progress.tierIndex) state = "cleared";
          else if (i === progress.tierIndex) state = "current";
          return (
            <ChestTile
              key={tier}
              tier={tier}
              state={state}
              onClick={pending ? () => setOpening({ kind: "self", id: pending.id, tier: pending.tier, label: pending.label }) : undefined}
            />
          );
        })}
      </div>

      {progress.pendingGifts.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Regalos del equipo Vantax
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {progress.pendingGifts.map((g) => (
              <button
                key={g.id}
                className="btn"
                onClick={() => setOpening({ kind: "gift", id: g.id, tier: g.tier, label: g.label })}
                style={{ display: "flex", alignItems: "center", gap: 8, borderColor: TIER_COLOR[g.tier as PlayTierValue] }}
              >
                <span style={{ fontSize: 18 }}>🎁</span>
                {g.label}
                <span className="tag neu">Regalo</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {opening && (
        <ChestOpenModal
          kind={opening.kind}
          id={opening.id}
          tierColor={TIER_COLOR[opening.tier as PlayTierValue] ?? CHEST_ACCENT_COLOR}
          label={opening.label}
          onClose={(didOpen) => {
            setOpening(null);
            if (didOpen) onChanged();
          }}
        />
      )}

      <style>{`
        @keyframes chest-cabinet-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}
