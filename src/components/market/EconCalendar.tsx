"use client";

import { useMemo, useState } from "react";
import type { EconEvent } from "@/lib/econ-calendar";
import { TradingViewWidget } from "@/components/market/TradingViewWidget";

// Calendario económico de EE. UU. con pestañas Hoy / Mañana / Esta semana /
// Próxima semana (pedido el 06/10/2026). Las horas se muestran en hora de
// España. "Hoy" y "Mañana" se calculan en el navegador, así siempre son el
// día real aunque la página venga de la caché.

type Tab = "hoy" | "manana" | "semana" | "proxima" | "directo";

const TZ = "Europe/Madrid";

function dayKey(d: Date): string {
  // YYYY-MM-DD en hora de España
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dayLabel(d: Date): string {
  const s = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

const IMPACT: Record<string, { label: string; color: string; bg: string }> = {
  High: { label: "Alto", color: "#F472B6", bg: "rgba(244,114,182,0.15)" },
  Medium: { label: "Medio", color: "#E8B84A", bg: "rgba(232,184,74,0.14)" },
  Low: { label: "Bajo", color: "#A39DB3", bg: "rgba(163,157,179,0.12)" },
  Holiday: { label: "Festivo", color: "#7DD3FC", bg: "rgba(125,211,252,0.12)" },
};

export function EconCalendar({ events, nextWeekAvailable }: { events: EconEvent[]; nextWeekAvailable: boolean }) {
  const [tab, setTab] = useState<Tab>(events.length > 0 ? "hoy" : "directo");
  const [onlyHigh, setOnlyHigh] = useState(false);

  const groups = useMemo(() => {
    const now = new Date();
    const today = dayKey(now);
    const tomorrow = dayKey(new Date(now.getTime() + 86400000));
    const filtered = events.filter((e) => {
      const k = dayKey(new Date(e.dateIso));
      if (onlyHigh && e.impact !== "High") return false;
      if (tab === "hoy") return k === today;
      if (tab === "manana") return k === tomorrow;
      if (tab === "semana") return e.week === "this";
      if (tab === "proxima") return e.week === "next";
      return false;
    });
    const map = new Map<string, { label: string; items: EconEvent[] }>();
    for (const e of filtered) {
      const d = new Date(e.dateIso);
      const k = dayKey(d);
      if (!map.has(k)) map.set(k, { label: dayLabel(d), items: [] });
      map.get(k)!.items.push(e);
    }
    return [...map.values()];
  }, [events, tab, onlyHigh]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "hoy", label: "Hoy" },
    { key: "manana", label: "Mañana" },
    { key: "semana", label: "Esta semana" },
    { key: "proxima", label: "Próxima semana" },
    { key: "directo", label: "En directo" },
  ];

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div className="calc-tabs" role="tablist" aria-label="Periodo del calendario">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`calc-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "directo" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyHigh} onChange={(e) => setOnlyHigh(e.target.checked)} style={{ width: 18, height: 18, minHeight: 0, accentColor: "#A78BFA" }} />
            Solo impacto alto
          </label>
        )}
      </div>

      {tab === "directo" ? (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Calendario de TradingView con el dato real publicado al momento.</div>
          <TradingViewWidget
            height={420}
            src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
            config={{
              width: "100%",
              height: 420,
              colorTheme: "dark",
              isTransparent: true,
              locale: "es",
              countryFilter: "us",
              importanceFilter: "-1,0,1",
            }}
          />
        </>
      ) : groups.length === 0 ? (
        <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          {tab === "proxima" && !nextWeekAvailable
            ? "El calendario de la próxima semana todavía no está publicado. Suele aparecer a final de esta semana."
            : events.length === 0
            ? "No se ha podido cargar el calendario ahora mismo. Prueba la pestaña «En directo»."
            : onlyHigh
            ? "No hay eventos de impacto alto en este periodo."
            : "No hay eventos de EE. UU. en este periodo."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="ec-day">{g.label}</div>
              <div className="table-scroll">
                <table className="ec-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Impacto</th>
                      <th>Evento</th>
                      <th style={{ textAlign: "right" }}>Previsión</th>
                      <th style={{ textAlign: "right" }}>Anterior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((e, i) => {
                      const imp = IMPACT[e.impact] ?? IMPACT.Low;
                      const d = new Date(e.dateIso);
                      return (
                        <tr key={`${e.dateIso}-${e.title}-${i}`}>
                          <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{timeLabel(d)}</td>
                          <td>
                            <span className="ec-impact" style={{ color: imp.color, background: imp.bg }}>
                              {imp.label}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{e.title}</td>
                          <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{e.forecast || "—"}</td>
                          <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{e.previous || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Horas en hora de España. Para ver el dato real publicado al momento, abre la pestaña «En directo».
          </div>
        </div>
      )}
    </div>
  );
}
