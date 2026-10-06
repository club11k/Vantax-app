// Calendario económico de EE. UU. para el Centro de Mercado (pedido el
// 06/10/2026: poder elegir hoy / mañana / esta semana / próxima semana, cosa
// que el widget de TradingView no permite).
//
// Fuente: el feed JSON público y gratuito del calendario de ForexFactory
// (faireconomy.media), el mismo que usan muchos EAs de MT4/MT5. Trae la
// semana actual y la siguiente con hora, impacto, previsión y dato anterior.
// No trae el dato "actual" publicado: para eso sigue disponible el widget de
// TradingView en la pestaña "En directo".
//
// ForexFactory corta el acceso si se le pide el feed muy a menudo, así que:
// - se guarda en memoria del servidor y solo se vuelve a pedir cada 30 min;
// - si una petición falla, se sigue mostrando el último dato bueno;
// - se prueban los dos dominios del feed (nfs. y cdn-nfs.).

export type EconEvent = {
  title: string;
  dateIso: string; // fecha y hora con zona horaria, tal cual la da el feed
  impact: "High" | "Medium" | "Low" | "Holiday";
  forecast: string;
  previous: string;
  week: "this" | "next";
};

const HOSTS = ["https://nfs.faireconomy.media", "https://cdn-nfs.faireconomy.media"];
const TTL_MS = 30 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

type WeekCache = { events: EconEvent[]; fetchedAt: number; lastTryAt: number };
const cache: Record<"this" | "next", WeekCache> = {
  this: { events: [], fetchedAt: 0, lastTryAt: 0 },
  next: { events: [], fetchedAt: 0, lastTryAt: 0 },
};

// El feed no siempre escribe el impacto igual ("High", "high", "High Impact
// Expected", colores…). Se normaliza para que el color y el filtro "Solo
// impacto alto" funcionen siempre.
function normalizeImpact(raw: unknown): "High" | "Medium" | "Low" | "Holiday" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("red")) return "High";
  if (s.includes("ora")) return "Medium";
  if (s.includes("gra") || s.includes("gre")) return "Holiday";
  if (s.includes("yel")) return "Low";
  if (s.startsWith("hol") || s.includes("non-economic") || s.includes("festivo")) return "Holiday";
  if (s.startsWith("h") || s.includes("high") || s.includes("alto") || s === "3") return "High";
  if (s.startsWith("m") || s.includes("medium") || s.includes("medio") || s === "2") return "Medium";
  return "Low";
}

async function fetchWeekFresh(week: "this" | "next"): Promise<EconEvent[] | null> {
  const file = week === "this" ? "ff_calendar_thisweek.json" : "ff_calendar_nextweek.json";
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/${file}`, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VANTAX/1.0)", Accept: "application/json" },
      });
      if (!res.ok) {
        console.warn(`[econ-calendar] ${host}/${file} → HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        console.warn(`[econ-calendar] ${host}/${file} → respuesta no es JSON (${text.slice(0, 80)})`);
        continue;
      }
      if (!Array.isArray(data)) continue;
      return data
        .filter((e: any) => e && String(e.country ?? "").toUpperCase() === "USD" && typeof e.date === "string")
        .map((e: any) => ({
          title: String(e.title ?? ""),
          dateIso: String(e.date),
          impact: normalizeImpact(e.impact),
          forecast: String(e.forecast ?? ""),
          previous: String(e.previous ?? ""),
          week,
        }));
    } catch (err) {
      console.warn(`[econ-calendar] ${host}/${file} → error`, err);
    }
  }
  return null;
}

async function getWeek(week: "this" | "next"): Promise<EconEvent[]> {
  const c = cache[week];
  const now = Date.now();
  const fresh = c.fetchedAt > 0 && now - c.fetchedAt < TTL_MS;
  const recentlyTried = now - c.lastTryAt < RETRY_MS;
  if (fresh || (recentlyTried && c.lastTryAt > 0)) return c.events;
  c.lastTryAt = now;
  const events = await fetchWeekFresh(week);
  if (events) {
    c.events = events;
    c.fetchedAt = now;
  }
  return c.events; // si falla, se queda el último dato bueno
}

export async function fetchUsdCalendar(): Promise<{ events: EconEvent[]; nextWeekAvailable: boolean }> {
  const [thisWeek, nextWeek] = await Promise.all([getWeek("this"), getWeek("next")]);
  const events = [...thisWeek, ...nextWeek].sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime());
  return { events, nextWeekAvailable: nextWeek.length > 0 };
}
