"use client";

import { useState } from "react";

type Format = "MENSAJE" | "TECNICO";

export function AnalysisGenerator({ remaining }: { remaining: number }) {
  const [format, setFormat] = useState<Format>("MENSAJE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/analysis/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo generar el análisis.");
      return;
    }
    setResult(data.content);
    // Refrescamos para que la cuota mostrada en el resto de la página se actualice.
    setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label>Formato</label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn"
            style={format === "MENSAJE" ? { borderColor: "var(--violet)" } : {}}
            onClick={() => setFormat("MENSAJE")}
          >
            Mensaje
          </button>
          <button
            className="btn"
            style={format === "TECNICO" ? { borderColor: "var(--violet)" } : {}}
            onClick={() => setFormat("TECNICO")}
          >
            Técnico / datos
          </button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || remaining <= 0}>
        {loading ? "Generando…" : remaining <= 0 ? "Sin análisis disponibles este mes" : "Generar análisis de hoy"}
      </button>

      {error && <div className="error-msg">{error}</div>}

      {result && (
        <div
          className="panel"
          style={{ background: "var(--bg-panel-raised)", whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6 }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
