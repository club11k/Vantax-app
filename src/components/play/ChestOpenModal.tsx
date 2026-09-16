"use client";

import { useRef, useState } from "react";
import styles from "@/components/play/arcade.module.css";
import { tierClassKey, type PlayTierValue } from "@/components/play/tierStyles";

// Pantalla de apertura de cofre, estilo arcade (cofre CSS abriéndose +
// destello dorado), igual que el resto de Vantax Play. No existe un archivo
// de sonido/música original que migrar (revisamos el mockup de referencia y
// no traía ninguno) — el "clunk" y el brillo de monedas al abrir se generan
// aquí mismo con el Web Audio API, sin depender de ningún archivo externo.

type Prize = {
  tier: string;
  label: string;
  vcoinAmount: number;
  article: { name: string; imageUrl: string | null } | null;
};

type Step = "idle" | "opening" | "revealed";

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // do-mi-sol-do, arpegio de moneda
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // Sin Web Audio disponible (navegador raro / bloqueado) — se abre igual, sin sonido.
  }
}

export function ChestOpenModal({
  kind,
  id,
  tier,
  label,
  onClose,
}: {
  kind: "self" | "gift";
  id: string;
  tier: PlayTierValue;
  label: string;
  onClose: (didOpen: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [prize, setPrize] = useState<Prize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tierKey = tierClassKey(tier);
  const playedSound = useRef(false);

  async function handleOpen() {
    setStep("opening");
    setError(null);
    try {
      const res = await fetch("/api/play/chests/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo abrir el cofre.");
        setStep("idle");
        return;
      }
      setPrize(data);
      setStep("revealed");
      if (!playedSound.current) {
        playedSound.current = true;
        playChime();
      }
    } catch {
      setError("No se pudo abrir el cofre. Prueba de nuevo.");
      setStep("idle");
    }
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (step !== "opening") onClose(step === "revealed");
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={styles.card}
        style={{
          width: "100%",
          maxWidth: 340,
          textAlign: "center",
          borderColor: "var(--lilaGlow)",
          boxShadow: "0 0 40px #a855f755",
        }}
      >
        <h3 className={styles.sectionTitle} style={{ borderLeft: "none", paddingLeft: 0, textAlign: "center" }}>
          {label}
        </h3>

        {step !== "revealed" && (
          <>
            <div
              className={`${styles.chest} ${styles[tierKey]}`}
              style={{ background: "transparent", border: "none", padding: 0, margin: "18px auto", width: "fit-content" }}
            >
              <div
                className={styles.chestBox}
                style={{ transform: step === "opening" ? "scale(1.08)" : undefined, transition: "transform 0.3s ease" }}
              >
                <div className={styles.lid} />
                <div className={styles.body} />
              </div>
            </div>
            <p style={{ fontSize: 15, color: "var(--textDim)" }}>{step === "opening" ? "Abriendo…" : "Toca abrir cuando quieras."}</p>
            {error && <div className={styles.errorMsg}>{error}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 6 }}>
              <button className={styles.btn} onClick={handleOpen} disabled={step === "opening"}>
                {step === "opening" ? "ABRIENDO…" : "ABRIR COFRE"}
              </button>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onClose(false)} disabled={step === "opening"}>
                CERRAR
              </button>
            </div>
          </>
        )}

        {step === "revealed" && prize && (
          <>
            <div style={{ fontSize: 44, margin: "10px 0" }}>✨</div>
            {prize.vcoinAmount > 0 && (
              <div className={styles.pix} style={{ fontSize: 22, color: "var(--gold)", textShadow: "0 0 8px #facc1580" }}>
                +{prize.vcoinAmount} V-COIN
              </div>
            )}
            {prize.article && (
              <div style={{ marginTop: 10 }}>
                <span className={styles.tag}>Premio extra</span>
                <div style={{ fontSize: 16, marginTop: 6 }}>{prize.article.name}</div>
              </div>
            )}
            {prize.vcoinAmount <= 0 && !prize.article && <p style={{ color: "var(--textDim)" }}>Cofre abierto.</p>}
            <div style={{ marginTop: 14 }}>
              <button className={styles.btn} onClick={() => onClose(true)}>
                GENIAL
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

