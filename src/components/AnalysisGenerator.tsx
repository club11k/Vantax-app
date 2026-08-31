"use client";

import { useState } from "react";

type Format = "MENSAJE" | "TECNICO";

type ImageRow = {
  id: string;
  label: string;
  file: File | null;
  preview: string | null;
};

function fileToBase64(file: File): Promise<{ mediaType: string; base64Data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result viene como "data:image/png;base64,AAAA..."
      const commaIdx = result.indexOf(",");
      const meta = result.substring(5, result.indexOf(";")); // "image/png"
      const base64Data = result.substring(commaIdx + 1);
      resolve({ mediaType: meta, base64Data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let rowIdCounter = 0;
function newRow(label: string): ImageRow {
  rowIdCounter += 1;
  return { id: `row-${rowIdCounter}`, label, file: null, preview: null };
}

export function AnalysisGenerator({ remaining, isAdmin = false }: { remaining: number; isAdmin?: boolean }) {
  const [format, setFormat] = useState<Format>("MENSAJE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [imageRows, setImageRows] = useState<ImageRow[]>(() =>
    isAdmin ? [newRow("1H"), newRow("4H"), newRow("Diario"), newRow("Semanal")] : []
  );

  function addRow() {
    setImageRows((rows) => [...rows, newRow("")]);
  }

  function removeRow(id: string) {
    setImageRows((rows) => rows.filter((r) => r.id !== id));
  }

  function updateLabel(id: string, label: string) {
    setImageRows((rows) => rows.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  function updateFile(id: string, file: File | null) {
    setImageRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, file, preview: file ? URL.createObjectURL(file) : null } : r))
    );
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let images: { label: string; mediaType: string; base64Data: string }[] | undefined;

      if (isAdmin) {
        const rowsWithFile = imageRows.filter((r) => r.file);
        if (rowsWithFile.length > 0) {
          images = await Promise.all(
            rowsWithFile.map(async (r) => {
              const { mediaType, base64Data } = await fileToBase64(r.file as File);
              return { label: r.label || "Gráfico", mediaType, base64Data };
            })
          );
        }
      }

      const res = await fetch("/api/analysis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, images }),
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
    } catch {
      setLoading(false);
      setError("No se pudieron procesar las imágenes. Prueba de nuevo.");
    }
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

      {isAdmin && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Gráficos de referencia (solo admin)
          </label>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 0, marginBottom: 10 }}>
            Sube capturas de las temporalidades que quieras que la IA tenga en cuenta (estructura, patrón,
            tendencia visual). Los niveles de precio exactos siguen calculándose siempre desde los datos reales,
            nunca desde la imagen.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {imageRows.map((row) => (
              <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Ej: 4H"
                  value={row.label}
                  onChange={(e) => updateLabel(row.id, e.target.value)}
                  style={{
                    width: 100,
                    fontSize: 12.5,
                    padding: "6px 8px",
                    background: "var(--bg-panel-raised)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => updateFile(row.id, e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12, flex: 1, minWidth: 160 }}
                />
                {row.preview && (
                  <img
                    src={row.preview}
                    alt={row.label}
                    style={{ height: 32, borderRadius: 4, border: "1px solid var(--line)" }}
                  />
                )}
                <button
                  className="btn"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => removeRow(row.id)}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 10, fontSize: 12.5 }} onClick={addRow}>
            + Añadir temporalidad
          </button>
        </div>
      )}

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


