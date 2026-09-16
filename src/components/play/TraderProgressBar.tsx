"use client";

import styles from "@/components/play/arcade.module.css";
import { TIER_LABEL, tierClassKey, type PlayTierValue } from "@/components/play/tierStyles";

export type PlayProgress = {
  tier: PlayTierValue;
  tierIndex: number;
  barFillPercent: number;
  aheadOfCount: number;
  pendingChests: { id: string; tier: string; label: string; kind: "self" }[];
  pendingGifts: { id: string; tier: string; rewardType: "VCOIN" | "ARTICLE"; label: string; kind: "gift" }[];
};

// Solo la barra en sí: dónde va el jugador dentro del tramo actual. Abrir
// cofres (propios o regalados) vive en ChestCabinet, aparte.
export function TraderProgressBar({ progress }: { progress: PlayProgress }) {
  const tierKey = tierClassKey(progress.tier);

  return (
    <div className={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
          PROGRESO DEL TRADER
        </h3>
        <span className={`${styles.tier} ${styles[tierKey]}`}>{TIER_LABEL[progress.tier]}</span>
      </div>

      <div
        style={{
          height: 18,
          background: "var(--void)",
          border: "2px solid var(--line)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress.barFillPercent}%`,
            transition: "width 0.6s ease",
            background:
              tierKey === "legendario"
                ? "linear-gradient(90deg, #8a6d1a, var(--gold))"
                : tierKey === "epico"
                ? "linear-gradient(90deg, var(--lilaDim, #5b3f8a), var(--lilaGlow))"
                : tierKey === "intermedio"
                ? "linear-gradient(90deg, #1f6b45, var(--teal))"
                : "linear-gradient(90deg, #3d4966, #9ab0ff)",
          }}
        />
      </div>

      <p style={{ margin: "10px 0 0", fontSize: 15, color: "var(--textDim)" }}>Opera cada día y consigue tu recompensa.</p>

      <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--text)" }}>
        {progress.aheadOfCount > 0
          ? `Vas por delante de ${progress.aheadOfCount} persona${progress.aheadOfCount === 1 ? "" : "s"} · ¡Sigue así!`
          : "¡Sé el primero en subir de tramo esta vez!"}
      </p>
    </div>
  );
}

