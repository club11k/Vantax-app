"use client";

import { useState } from "react";

// Pantalla de apertura de cofre: overlay a pantalla completa, el jugador
// pulsa para abrir, se llama a POST /api/play/chests/open y se revela el
// premio (V-COIN garantizado + posible artículo extra). Sirve tanto para
// cofres propios (ganados con la barra de Progreso del Trader) como para
// regalos de un admin — la diferencia la lleva "kind".

type Prize = {
  tier: string;
  label: string;
  vcoinAmount: number;
  article: { name: string; imageUrl: string | null } | null;
};

type Step = "idle" | "opening" | "revealed";

export function ChestOpenModal({
  kind,
  id,
  tierColor,
  label,
  onClose,
}: {
  kind: "self" | "gift";
  id: string;
  tierColor: string;
  label: string;
  onClose: (didOpen: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [prize, setPrize] = useState<Prize | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setError("No se pudo abrir el cofre. Prueba de nuevo.");
      setStep("idle");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => {
        // Cerrar tocando fuera solo tiene sentido antes de abrir o después
        // de ver el premio — no a mitad de la animación de apertura.
        if (step !== "opening") onClose(step === "revealed");
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 3, 10, 0.88)",
        backdropFilter: "blur(3px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
          padding: "32px 24px",
          border: `1px solid ${tierColor}55`,
          boxShadow: `0 0 40px ${tierColor}33`,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
          {label}
        </div>

        {step !== "revealed" && (
          <>
            <div
              style={{
                fontSize: 72,
                lineHeight: 1,
                filter: `drop-shadow(0 0 22px ${tierColor}aa)`,
                animation: step === "opening" ? "chest-shake 0.35s ease-in-out infinite" : "chest-bob 2.2s ease-in-out infinite",
              }}
            >
              🎁
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
              {step === "opening" ? "Abriendo…" : "Toca abrir cuando quieras."}
            </p>
            {error && <div className="error-msg">{error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={handleOpen} disabled={step === "opening"} style={{ borderColor: tierColor }}>
                {step === "opening" ? "Abriendo…" : "Abrir cofre"}
              </button>
              <button className="btn" onClick={() => onClose(false)} disabled={step === "opening"}>
                Cerrar
              </button>
            </div>
          </>
        )}

        {step === "revealed" && prize && (
          <>
            <div style={{ fontSize: 64, lineHeight: 1, animation: "chest-pop 0.5s ease-out" }}>✨</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {prize.vcoinAmount > 0 && (
                <div style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--gold-bright)" }}>
                  +{prize.vcoinAmount} V-COIN
                </div>
              )}
              {prize.article && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span className="tag neu">Premio extra</span>
                  <div style={{ fontSize: 14.5, color: "var(--text-primary)" }}>{prize.article.name}</div>
                </div>
              )}
              {prize.vcoinAmount <= 0 && !prize.article && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Cofre abierto.</p>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => onClose(true)}>
              Genial
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes chest-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes chest-shake {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(6deg); }
        }
        @keyframes chest-pop {
          0% { transform: scale(0.4); opacity: 0; }
          70% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
