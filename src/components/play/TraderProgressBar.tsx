"use client";

import styles from "@/components/play/arcade.module.css";
import { TIER_LABEL, TIER_ORDER, tierClassKey, type PlayTierValue } from "@/components/play/tierStyles";
import { TrophyIcon } from "@/components/play/PixelIcons";

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

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Barra gruesa con brillo que la recorre (rediseño 06/10/2026) */}
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{
              width: `${progress.barFillPercent}%`,
              backgroundColor: "#7C5CE0",
              backgroundImage:
                tierKey === "legendario"
                  ? "repeating-linear-gradient(90deg, #FACC15 0 14px, #EAB308 14px 16px)"
                  : tierKey === "epico"
                  ? "repeating-linear-gradient(90deg, #EC4899 0 14px, #DB2777 14px 16px)"
                  : tierKey === "intermedio"
                  ? "repeating-linear-gradient(90deg, #2DD4BF 0 14px, #14B8A6 14px 16px)"
                  : "repeating-linear-gradient(90deg, #A78BFA 0 14px, #8B6CF0 14px 16px)",
            }}
          />
          <div className={styles.progressShine} style={{ width: `${progress.barFillPercent}%` }} />
        </div>
        <div className={styles["tp-end-chest"]} title="Cofre misterioso al final del recorrido">
          <div className={styles["chest-stage"]}>
            <div className={`${styles["pix-chest"]} ${styles["chest-mystery"]}`}>
              <div className={styles.lid} />
              <div className={styles.body} />
              <div className={styles.lock} />
              <div className={styles.band} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.progressFoot}>
        <span className={styles.motivation} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TrophyIcon size={20} />
          {progress.aheadOfCount > 0
            ? `Vas por delante de ${progress.aheadOfCount} persona${progress.aheadOfCount === 1 ? "" : "s"} · ¡Sigue así!`
            : "¡Sé el primero en subir de tramo esta vez!"}
        </span>
        <span style={{ fontSize: 14, color: "var(--textDim)" }}>Opera cada día y consigue tu recompensa.</span>
      </div>

      <div className={styles.road}>
        {TIER_ORDER.map((t, i) => {
          const done = i <= progress.tierIndex;
          return (
            <div key={t} className={styles.roadStep} style={done ? { color: "#C4B5FD" } : undefined}>
              <span className={styles.roadBar} style={done ? { background: "#A78BFA", boxShadow: "0 0 10px #A78BFA" } : undefined} />
              {TIER_LABEL[t as PlayTierValue]}
            </div>
          );
        })}
      </div>
    </div>
  );
}


