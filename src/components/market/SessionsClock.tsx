"use client";

import { useEffect, useState } from "react";

// Sesiones de mercado calculadas en vivo en el navegador del usuario (no
// depende de ninguna API — es aritmética de reloj, así que esto sí es 100%
// real y exacto en todo momento).
//
// IMPORTANTE — antes esto usaba horas UTC fijas ("horario de invierno"),
// que se quedaban mal en cuanto cualquiera de las plazas cambiaba de
// horario de verano/invierno (Londres, sobre todo, abre 08:00 UTC en
// invierno pero 07:00 UTC en verano/BST — Esther lo detectó viendo la
// página en septiembre). La forma correcta es definir cada sesión en su
// HORA LOCAL de la plaza (esa sí es fija todo el año) y calcular la hora
// UTC equivalente de hoy con Intl.DateTimeFormat, que ya sabe cuándo
// empieza/termina el horario de verano de cada zona (incluida Australia,
// que lo tiene invertido respecto al hemisferio norte). Tokio no tiene
// horario de verano, así que para esa plaza da igual.
//
// Las horas locales de apertura/cierre son las convencionales de sesión de
// forex (Sídney y Tokio 09:00–18:00 local, Londres 08:00–16:00 local,
// Nueva York 08:00–17:00 local) — elegidas porque, en invierno del
// hemisferio norte (cuando Sídney está en horario de verano y
// Londres/NY en horario estándar), coinciden exactamente con los horarios
// en UTC que ya estaban verificados contra Forex.com/Dukascopy y encadenan
// sin huecos (Nueva York cierra a las 22:00 UTC justo cuando abre Sídney).
const SESSION_DEFS = [
  { name: "Sydney", tz: "Australia/Sydney", openH: 9, closeH: 18 },
  { name: "Tokio", tz: "Asia/Tokyo", openH: 9, closeH: 18 },
  { name: "Londres", tz: "Europe/London", openH: 8, closeH: 16 },
  { name: "Nueva York", tz: "America/New_York", openH: 8, closeH: 17 },
];

// Zona horaria de referencia para mostrar también la hora local a los
// alumnos en España (Europe/Madrid ya gestiona el cambio CET/CEST sola).
const LOCAL_TZ = "Europe/Madrid";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

// Offset actual (en minutos) de una zona horaria respecto a UTC, para el
// instante `date` dado — ya incluye el horario de verano si aplica ese día.
function utcOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function fmtHM(totalMin: number) {
  const m = mod(Math.round(totalMin), 1440);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function sessionState(now: Date, def: (typeof SESSION_DEFS)[number]) {
  const offsetMin = utcOffsetMinutes(now, def.tz);
  const openUtcMin = mod(def.openH * 60 - offsetMin, 1440);
  const closeUtcMin = mod(def.closeH * 60 - offsetMin, 1440);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;

  let isOpen: boolean;
  let pct: number;
  if (openUtcMin < closeUtcMin) {
    isOpen = nowMin >= openUtcMin && nowMin < closeUtcMin;
    pct = isOpen ? ((nowMin - openUtcMin) / (closeUtcMin - openUtcMin)) * 100 : 0;
  } else {
    isOpen = nowMin >= openUtcMin || nowMin < closeUtcMin;
    const span = 1440 - openUtcMin + closeUtcMin;
    const elapsed = nowMin >= openUtcMin ? nowMin - openUtcMin : 1440 - openUtcMin + nowMin;
    pct = isOpen ? (elapsed / span) * 100 : 0;
  }
  return { isOpen, pct: Math.max(0, Math.min(100, pct)), openUtcMin, closeUtcMin };
}

export function SessionsClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const localOffsetMin = now ? utcOffsetMinutes(now, LOCAL_TZ) : 0;

  return (
    <div>
      <div className="sessions">
      {SESSION_DEFS.map((def) => {
        const state = now ? sessionState(now, def) : { isOpen: false, pct: 0, openUtcMin: 0, closeUtcMin: 0 };
        return (
          <div key={def.name} className="session-card">
            <div className="session-top">
              <span className="session-name">{def.name}</span>
              <span className={`session-badge ${state.isOpen ? "open" : "closed"}`}>
                {state.isOpen ? "Abierto" : "Cerrado"}
              </span>
            </div>
            <div className="session-time">
              {fmtHM(state.openUtcMin)}–{fmtHM(state.closeUtcMin)} UTC
            </div>
            <div className="session-time" style={{ opacity: 0.7, fontSize: "0.9em" }}>
              {fmtHM(state.openUtcMin + localOffsetMin)}–{fmtHM(state.closeUtcMin + localOffsetMin)} hora España
            </div>
            <div className="session-bar">
              <div className="session-bar-fill" style={{ width: `${state.pct}%` }} />
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}



