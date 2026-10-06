"use client";

import { useMemo, useState } from "react";
import type { InvDay } from "@/lib/investing-calendar";

// Calendario económico de EE. UU. con datos de Investing.com (misma
// importancia y mismo dato real que en su web), pintado con el diseño de
// VANTAX y con pestañas Hoy / Mañana / Esta semana / Próxima semana.
// Si el servidor no ha podido leer Investing, se muestra su widget oficial
// incrustado para que el calendario nunca quede vacío.

type Tab = "hoy" | "manana" | "semana" | "proxima";
const TZ = "Europe/Madrid";

function dayKeyFromDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayKeyFromTs(ts: number): string {
  // Investing marca cada día con un timestamp de su medianoche; se suman
  // 12 h para no caer en el día anterior por la diferencia horaria.
  return dayKeyFromDate(new Date(ts * 1000 + 12 * 3600 * 1000));
}

const IMP: Record<number, { label: string; color: string; bg: string }> = {
  3: { label: "Alto", color: "#F472B6", bg: "rgba(244,114,182,0.15)" },
  2: { label: "Medio", color: "#E8B84A", bg: "rgba(232,184,74,0.14)" },
  1: { label: "Bajo", color: "#A39DB3", bg: "rgba(163,157,179,0.12)" },
};

const FALLBACK_URL =
  "https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&countries=5&calType=week&timeZone=58&lang=4";

export function EconCalendar({ ok, thisWeek, nextWeek }: { ok: boolean; thisWeek: InvDay[]; nextWeek: InvDay[] | null }) {
  const [tab, setTab] = useState<Tab>("hoy");
  const [onlyHigh, setOnlyHigh] = useState(false);

  const days = useMemo(() => {
    const now = new Date();
    const today = dayKeyFromDate(now);
    const tomorrow = dayKeyFromDate(new Date(now.getTime() + 86400000));
    const all = [...thisWeek, ...(nextWeek ?? [])];
    let source: InvDay[] = [];
    if (tab === "semana") source = thisWeek;
    else if (tab === "proxima") source = nextWeek ?? [];
    else source = all.filter((d) => dayKeyFromTs(d.ts) === (tab === "hoy" ? today : tomorrow));
    return source
      .map((d) => ({ ...d, events: onlyHigh ? d.events.filter((e) => e.importance === 3) : d.events }))
      .filter((d) => d.events.length > 0);
  }, [thisWeek, nextWeek, tab, onlyHigh]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "hoy", label: "Hoy" },
    { key: "manana", label: "Mañana" },
    { key: "semana", label: "Esta semana" },
    { key: "proxima", label: "Próxima semana" },
  ];

  if (!ok) {
    return (
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ borderRadius: 14, overflow: "hidden", background: "#fff" }}>
          <iframe
            src={FALLBACK_URL}
            title="Calendario económico de Estados Unidos (Investing.com)"
            width="100%"
            height={520}
            loading="lazy"
            style={{ display: "block", border: 0, width: "100%", filter: "invert(0.92) hue-rotate(180deg)" }}
          />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Calendario facilitado por Investing.com.</div>
      </div>
    );
  }

  let emptyMsg = onlyHigh ? "No hay noticias de impacto alto en este periodo." : "No hay noticias de EE. UU. en este periodo.";
  if (tab === "proxima" && !nextWeek) emptyMsg = "";

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div className="calc-tabs" role="tablist" aria-label="Periodo">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`calc-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="calc-tabs" role="tablist" aria-label="Importancia">
          <button type="button" role="tab" aria-selected={!onlyHigh} className={`calc-tab ${!onlyHigh ? "active" : ""}`} onClick={() => setOnlyHigh(false)}>
            Todas
          </button>
          <button type="button" role="tab" aria-selected={onlyHigh} className={`calc-tab ${onlyHigh ? "active" : ""}`} onClick={() => setOnlyHigh(true)}>
            Impacto alto
          </button>
        </div>
      </div>

      {tab === "proxima" && !nextWeek ? (
        <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
          La próxima semana no se puede cargar aquí todavía.{" "}
          <a href="https://es.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">
            Ábrela en Investing ↗
          </a>{" "}
          y pulsa «Próxima semana».
        </div>
      ) : days.length === 0 ? (
        <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>{emptyMsg}</div>
      ) : (
        days.map((d) => (
          <div key={d.ts}>
            <div className="ec-day">{d.label}</div>
            <div className="table-scroll">
              <table className="ec-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Impacto</th>
                    <th>Evento</th>
                    <th style={{ textAlign: "right" }}>Actual</th>
                    <th style={{ textAlign: "right" }}>Previsión</th>
                    <th style={{ textAlign: "right" }}>Anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {d.events.map((e) => {
                    const imp = IMP[e.importance];
                    return (
                      <tr key={e.id}>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{e.time}</td>
                        <td>
                          <span className="ec-impact" style={{ color: imp.color, background: imp.bg }}>
                            {imp.label}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td
                          style={{
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 700,
                            color: e.actualTone === "up" ? "#6EE7B7" : e.actualTone === "down" ? "#F472B6" : "var(--text-primary)",
                          }}
                        >
                          {e.actual || "—"}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{e.forecast || "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{e.previous || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Datos de{" "}
        <a href="https://es.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">
          Investing.com
        </a>{" "}
        · horas en hora de España · se actualiza cada 5 minutos.
      </div>
    </div>
  );
}
