"use client";

import { useEffect, useState } from "react";

// Sesiones de mercado calculadas en vivo en el navegador del usuario, en
// horario estándar UTC (no depende de ninguna API — es aritmética de reloj,
// así que esto sí es 100% real y exacto en todo momento).
const SESSION_DEFS = [
  { name: "Sydney", openH: 22, openM: 0, closeH: 7, closeM: 0 },
  { name: "Tokio", openH: 0, openM: 0, closeH: 9, closeM: 0 },
  { name: "Londres", openH: 8, openM: 0, closeH: 16, closeM: 30 },
  { name: "Nueva York", openH: 13, openM: 30, closeH: 20, closeM: 0 },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function minutesOfDay(h: number, m: number) {
  return h * 60 + m;
}

function sessionState(now: Date, def: (typeof SESSION_DEFS)[number]) {
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  const openMin = minutesOfDay(def.openH, def.openM);
  const closeMin = minutesOfDay(def.closeH, def.closeM);
  let isOpen: boolean;
  let pct: number;
  if (openMin < closeMin) {
    isOpen = nowMin >= openMin && nowMin < closeMin;
    pct = isOpen ? ((nowMin - openMin) / (closeMin - openMin)) * 100 : 0;
  } else {
    isOpen = nowMin >= openMin || nowMin < closeMin;
    const span = 1440 - openMin + closeMin;
    const elapsed = nowMin >= openMin ? nowMin - openMin : 1440 - openMin + nowMin;
    pct = isOpen ? (elapsed / span) * 100 : 0;
  }
  return { isOpen, pct: Math.max(0, Math.min(100, pct)) };
}

export function SessionsClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sessions">
      {SESSION_DEFS.map((def) => {
        const state = now ? sessionState(now, def) : { isOpen: false, pct: 0 };
        return (
          <div key={def.name} className="session-card">
            <div className="session-top">
              <span className="session-name">{def.name}</span>
              <span className={`session-badge ${state.isOpen ? "open" : "closed"}`}>
                {state.isOpen ? "Abierto" : "Cerrado"}
              </span>
            </div>
            <div className="session-time">
              {pad(def.openH)}:{pad(def.openM)}–{pad(def.closeH)}:{pad(def.closeM)} UTC
            </div>
            <div className="session-bar">
              <div className="session-bar-fill" style={{ width: `${state.pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
