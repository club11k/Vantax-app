"use client";

import { useState } from "react";
import type { BiasResult, TimeframeKey } from "@/lib/bias-score";
import { TIMEFRAME_LABEL } from "@/lib/bias-score";

// Panel de Bias Score con pestañas por temporalidad (15min/30min/1h/Diario),
// pedido por Esther (05/10/2026) para poder ver el sesgo calculado con
// parámetros realistas para cada temporalidad en la que se opera el oro, no
// solo el diario de toda la vida — ver TIMEFRAME_EMA_PERIODS en
// vantax-data.ts (periodos de EMA) y TIMEFRAME_WEIGHTS en bias-score.ts
// (pesos de los módulos) para el porqué de cada esquema.
//
// Recibe los 4 resultados YA calculados en el servidor (page.tsx llama a
// computeBiasScore una vez por temporalidad) — aquí solo se guarda en
// estado cuál pestaña está activa y se pinta ese resultado; no hay ningún
// fetch ni recálculo en el navegador.

const TIMEFRAME_ORDER: TimeframeKey[] = ["15min", "30min", "1h", "1day"];

const SHORT_MODULE_NAME: Record<string, string> = {
  macro: "Macro",
  flujos: "Flujos",
  riesgo: "Riesgo",
  tecnico: "Técnico",
};

function scoreColor(score: number | null) {
  if (score === null) return "var(--text-dim)";
  if (score > 8) return "var(--up)";
  if (score < -8) return "var(--down)";
  return "var(--text-muted)";
}

export function BiasScorePanel({ results }: { results: Record<TimeframeKey, BiasResult> }) {
  const [active, setActive] = useState<TimeframeKey>("1day");
  const bias = results[active];

  // El texto de la fórmula se arma a partir de los pesos reales de la
  // pestaña activa (no es un texto fijo) porque cada temporalidad tiene su
  // propio esquema de pesos.
  const formulaText = bias.modules.map((m) => `${m.weight.toFixed(2)} ${SHORT_MODULE_NAME[m.key] ?? m.name}`).join(" + ");

  return (
    <>
      <div
        style={{
          marginTop: 4,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
          Bias Score — Motor de Scoring Algorítmico
        </div>
        <div className="bias-tf-tabs" role="tablist" aria-label="Temporalidad del sesgo">
          {TIMEFRAME_ORDER.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={active === tf}
              className={`bias-tf-tab${active === tf ? " active" : ""}`}
              onClick={() => setActive(tf)}
            >
              {TIMEFRAME_LABEL[tf]}
            </button>
          ))}
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="bias-panel">
          <div className="bias-score-box">
            <div className="bias-score-num" style={{ color: scoreColor(bias.total) }}>
              {bias.total !== null ? `${bias.total >= 0 ? "+" : ""}${bias.total.toFixed(0)}` : "—"}
            </div>
            <div className="bias-score-label">{bias.label}</div>
            <div className="bias-score-formula">
              Bias Score ({TIMEFRAME_LABEL[active]}) = promedio ponderado
              <br />
              de los módulos con datos disponibles
              <br />
              (pesos: {formulaText})
            </div>
          </div>
          <div className="bias-modules">
            {bias.modules.map((mod) => (
              <div key={mod.key}>
                {mod.available && mod.score !== null ? (
                  <div className="bias-mod-row">
                    <div className="bias-mod-name">
                      {mod.name}
                      <span className="bias-mod-weight">peso {(mod.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="bias-mod-track">
                      <div className="bias-mod-zero" />
                      <div
                        className="bias-mod-fill"
                        style={{
                          [mod.score >= 0 ? "left" : "right"]: "50%",
                          width: `${Math.abs(mod.score) / 2}%`,
                          background: mod.score >= 0 ? "var(--up)" : "var(--down)",
                        } as React.CSSProperties}
                      />
                    </div>
                    <div className="bias-mod-score" style={{ color: mod.score >= 0 ? "var(--up)" : "var(--down)" }}>
                      {mod.score >= 0 ? "+" : ""}
                      {mod.score.toFixed(0)}
                    </div>
                  </div>
                ) : (
                  <div className="bias-mod-row">
                    <div className="bias-mod-name">
                      {mod.name}
                      <span className="bias-mod-weight">peso {(mod.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="bias-mod-unavailable">No disponible — {mod.unavailableReason}</div>
                  </div>
                )}
              </div>
            ))}

            <details className="indicators" style={{ marginTop: 6 }}>
              <summary>Ver los indicadores subyacentes y cómo se calificó cada uno</summary>
              <div className="table-scroll">
                <table className="indicators-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Valor</th>
                      <th>Score</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bias.modules
                      .flatMap((m) => m.indicators)
                      .map((ind, i) => (
                        <tr key={i}>
                          <td data-label="Indicador">{ind.label}</td>
                          <td data-label="Valor" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{ind.value}</td>
                          <td data-label="Score" style={{ color: ind.score === null ? "var(--text-dim)" : ind.score >= 0 ? "var(--up)" : "var(--down)" }}>
                            {ind.score !== null ? `${ind.score >= 0 ? "+" : ""}${ind.score.toFixed(0)}` : "—"}
                          </td>
                          <td data-label="Nota" style={{ fontSize: 12 }}>{ind.note}</td>
                        </tr>
                      ))}
                    {bias.modules.every((m) => m.indicators.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ color: "var(--text-dim)" }}>
                          Todavía no hay datos — configura FRED_API_KEY y TWELVE_DATA_API_KEY en Render.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}

