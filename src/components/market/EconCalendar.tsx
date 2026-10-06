"use client";

import { useState } from "react";

// Calendario económico de EE. UU. con el widget oficial y gratuito de
// Investing.com (cambio pedido el 06/10/2026: el feed de ForexFactory
// clasificaba la importancia distinto que Investing y con "Solo impacto
// alto" se quedaban fuera noticias como el ISM o las peticiones de
// desempleo). El widget trae el dato real, previsión y anterior, y tiene sus
// propios botones de Ayer / Hoy / Mañana / Esta semana / Próxima semana.
//
// Investing solo ofrece el widget en fondo claro; para que encaje con el
// tema oscuro se le aplica un filtro de color (invertir + girar el tono), que
// mantiene el verde/rojo de los datos. Si algún día se ve raro, basta con
// quitar DARK_FILTER.

const DARK_FILTER = "invert(0.92) hue-rotate(180deg) saturate(1.1)";

function widgetUrl(onlyHigh: boolean) {
  const params = new URLSearchParams({
    columns: "exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous",
    features: "datepicker,timezone",
    countries: "5", // 5 = Estados Unidos
    calType: "week",
    timeZone: "58", // hora de España (se puede cambiar dentro del propio widget)
    lang: "4", // español
  });
  if (onlyHigh) params.set("importance", "3");
  return `https://sslecal2.investing.com?${params.toString()}`;
}

export function EconCalendar() {
  const [onlyHigh, setOnlyHigh] = useState(false);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Usa los botones del calendario para ver hoy, mañana, esta semana o la próxima.
        </span>
        <div className="calc-tabs" role="tablist" aria-label="Importancia">
          <button type="button" role="tab" aria-selected={!onlyHigh} className={`calc-tab ${!onlyHigh ? "active" : ""}`} onClick={() => setOnlyHigh(false)}>
            Todas
          </button>
          <button type="button" role="tab" aria-selected={onlyHigh} className={`calc-tab ${onlyHigh ? "active" : ""}`} onClick={() => setOnlyHigh(true)}>
            Solo impacto alto
          </button>
        </div>
      </div>
      <div style={{ borderRadius: 14, overflow: "hidden", background: "#fff" }}>
        <iframe
          key={onlyHigh ? "high" : "all"}
          src={widgetUrl(onlyHigh)}
          title="Calendario económico de Estados Unidos (Investing.com)"
          width="100%"
          height={560}
          loading="lazy"
          style={{ display: "block", border: 0, width: "100%", filter: DARK_FILTER }}
        />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Calendario facilitado por{" "}
        <a href="https://es.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">
          Investing.com España
        </a>
        .
      </div>
    </div>
  );
}
