"use client";

import { useState } from "react";

// Botón "Comprar" de una formación: crea el pago en Stripe y redirige allí.
export function BuyCourseButton({ courseId, disabled }: { courseId: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/formacion/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "No se pudo iniciar el pago. Prueba de nuevo.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No se pudo conectar con el servidor. Prueba de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button type="button" className="btn btn-primary fm-buy-btn" onClick={buy} disabled={loading || disabled}>
        {loading ? "Abriendo el pago…" : "Comprar formación"}
      </button>
      {error && <span style={{ fontSize: 13, color: "var(--down)" }}>{error}</span>}
    </div>
  );
}
