"use client";

import { useState } from "react";
import { ChestOpenModal } from "@/components/play/ChestOpenModal";
import styles from "@/components/play/arcade.module.css";
import { TIER_ORDER, TIER_LABEL, tierClassKey, type PlayTierValue } from "@/components/play/tierStyles";
import type { PlayProgress } from "@/components/play/TraderProgressBar";

// El armario de cofres, dibujado en CSS exactamente como el mockup original
// de Vantax Play (cofre = caja "lid" + "body" + "lock" + "band" coloreada
// por tramo, con animación propia por tramo — respira/flota/se balancea
// con puntos orbitando/tiembla con chispas) — nada de imágenes ni emojis de
// regalo. Siempre se ven los 4 tramos; los regalos de un admin van aparte
// debajo, porque pueden tocar cualquier tramo sin depender de en qué tramo
// va el jugador.

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
  const tierKey = tierClassKey(tier);
  const clickable = state === "pending";
  const cardClasses = [
    styles["chest-card"],
    tierKey === "legendario" ? styles.legendario : "",
    clickable ? styles.chestClickable : "",
    state === "pending" ? styles.chestPending : "",
  ]
    .filter(Boolean)
    .join(" ");
  const pixClasses = [styles["pix-chest"], styles[`chest-${tierKey}`]].join(" ");

  return (
    <div className={cardClasses} onClick={clickable ? onClick : undefined} role={clickable ? "button" : undefined}>
      <div className={styles["chest-stage"]}>
        <div className={pixClasses}>
          <div className={styles.lid} />
          <div className={styles.body} />
          <div className={styles.lock} />
          <div className={styles.band} />
          {tierKey === "epico" && (
            <>
              <span className={styles.orbit} style={{ animationDelay: "0s" }} />
              <span className={styles.orbit} style={{ animationDelay: "-1.2s" }} />
            </>
          )}
          {tierKey === "legendario" && (
            <>
              <span className={styles["gold-spark"]} style={{ left: "18%", animationDelay: "0s" }} />
              <span className={styles["gold-spark"]} style={{ left: "48%", animationDelay: "-0.6s" }} />
              <span className={styles["gold-spark"]} style={{ left: "76%", animationDelay: "-1.2s" }} />
            </>
          )}
        </div>
      </div>
      <h4>{TIER_LABEL[tier]}</h4>
      {state === "pending" && (
        <div>
          <button className={styles.btn} type="button" onClick={onClick}>
            ABRIR
          </button>
        </div>
      )}
      {state === "locked" && (
        <small style={{ display: "block", marginTop: 8 }}>🔒 Bloqueado</small>
      )}
      {state === "current" && (
        <small style={{ display: "block", marginTop: 8 }}>En curso…</small>
      )}
      {state === "cleared" && (
        <small style={{ display: "block", marginTop: 8, color: "var(--green)" }}>Superado</small>
      )}
    </div>
  );
}

export function ChestCabinet({ progress, onChanged }: { progress: PlayProgress; onChanged: () => void }) {
  const [opening, setOpening] = useState<Opening | null>(null);

  const pendingByTier = new Map(progress.pendingChests.map((c) => [c.tier, c]));

  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle}>MIS COFRES</h3>

      <div className={`${styles.grid} ${styles.cols4}`} style={{ marginBottom: progress.pendingGifts.length > 0 ? 16 : 0 }}>
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
        <div style={{ borderTop: "2px solid var(--line)", paddingTop: 14 }}>
          <h3 className={styles.sectionTitle}>REGALOS DEL EQUIPO VANTAX</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {progress.pendingGifts.map((g) => (
              <button
                key={g.id}
                className={styles.btn}
                type="button"
                onClick={() => setOpening({ kind: "gift", id: g.id, tier: g.tier, label: g.label })}
              >
                ABRIR · {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {opening && (
        <ChestOpenModal
          kind={opening.kind}
          id={opening.id}
          tier={opening.tier as PlayTierValue}
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


