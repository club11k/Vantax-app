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

// ForexFactory puntúa la importancia de forma más estricta que Investing
// (p. ej. el ISM de servicios o las peticiones de desempleo salen como
// "medio"). Para que "Solo impacto alto" se parezca a lo que Esther ve en
// Investing (3 estrellas), estos eventos se suben a "alto" siempre.
const HIGH_KEYWORDS = [
  /\bCPI\b/i, /\bPPI\b/i, /Retail Sales/i, /Non-Farm/i, /Unemployment Rate/i, /Unemployment Claims/i,
  /Average Hourly Earnings/i, /\bGDP\b/i, /\bPCE\b/i, /ISM/i, /Services PMI/i, /Manufacturing PMI/i,
  /FOMC/i, /Federal Funds Rate/i, /Fed Chair/i, /Powell/i, /JOLTS/i, /ADP/i, /Crude Oil Inventories/i,
  /Consumer Confidence/i, /Consumer Sentiment/i, /Durable Goods/i,
];

// Traducción de los nombres más habituales (el feed viene en inglés). Lo que
// no está en la lista se deja tal cual.
const TRANSLATIONS: [RegExp, string][] = [
  [/FOMC Meeting Minutes/i, "Actas de la reunión del FOMC"],
  [/FOMC Statement/i, "Comunicado del FOMC"],
  [/FOMC Press Conference/i, "Rueda de prensa del FOMC"],
  [/Federal Funds Rate/i, "Decisión de tipos de la Fed"],
  [/Fed Chair Powell Speaks/i, "Comparecencia de Powell (Fed)"],
  [/ADP Non-Farm Employment Change/i, "Empleo privado ADP"],
  [/Non-Farm Employment Change/i, "Nóminas no agrícolas"],
  [/Unemployment Claims/i, "Peticiones de subsidio por desempleo"],
  [/Unemployment Rate/i, "Tasa de desempleo"],
  [/Average Hourly Earnings/i, "Ganancia media por hora"],
  [/Core CPI/i, "IPC subyacente"],
  [/\bCPI\b/i, "IPC"],
  [/Core PPI/i, "IPP subyacente"],
  [/\bPPI\b/i, "IPP"],
  [/Core Retail Sales/i, "Ventas minoristas subyacentes"],
  [/Retail Sales/i, "Ventas minoristas"],
  [/Core PCE Price Index/i, "Índice de precios PCE subyacente"],
  [/ISM Services PMI/i, "PMI no manufacturero del ISM"],
  [/ISM Manufacturing PMI/i, "PMI manufacturero del ISM"],
  [/Flash Services PMI/i, "PMI de servicios (preliminar)"],
  [/Final Services PMI/i, "PMI de servicios (final)"],
  [/Flash Manufacturing PMI/i, "PMI manufacturero (preliminar)"],
  [/Final Manufacturing PMI/i, "PMI manufacturero (final)"],
  [/Crude Oil Inventories/i, "Inventarios de petróleo crudo"],
  [/JOLTS Job Openings/i, "Ofertas de empleo JOLTS"],
  [/CB Consumer Confidence/i, "Confianza del consumidor (Conference Board)"],
  [/UoM Consumer Sentiment/i, "Confianza del consumidor (Michigan)"],
  [/Core Durable Goods Orders/i, "Pedidos de bienes duraderos subyacentes"],
  [/Durable Goods Orders/i, "Pedidos de bienes duraderos"],
  [/Advance GDP/i, "PIB (avance)"],
  [/Prelim GDP/i, "PIB (preliminar)"],
  [/Final GDP/i, "PIB (final)"],
  [/Trade Balance/i, "Balanza comercial"],
  [/Existing Home Sales/i, "Ventas de viviendas de segunda mano"],
  [/New Home Sales/i, "Ventas de viviendas nuevas"],
  [/Building Permits/i, "Permisos de construcción"],
  [/Housing Starts/i, "Inicios de viviendas"],
  [/Bank Holiday/i, "Festivo bancario"],
];

function translateTitle(title: string): string {
  for (const [re, es] of TRANSLATIONS) {
    if (re.test(title)) {
      // conserva el sufijo del periodo ("m/m", "y/y", "q/q") traducido
      const suffix = /\bm\/m\b/i.test(title) ? " (mensual)" : /\by\/y\b/i.test(title) ? " (interanual)" : /\bq\/q\b/i.test(title) ? " (trimestral)" : "";
      return es + suffix;
    }
  }
  return title;
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
        .map((e: any) => {
          const rawTitle = String(e.title ?? "");
          const ffImpact = normalizeImpact(e.impact);
          const boosted = ffImpact !== "Holiday" && HIGH_KEYWORDS.some((re) => re.test(rawTitle));
          return {
          title: translateTitle(rawTitle),
          dateIso: String(e.date),
          impact: boosted ? ("High" as const) : ffImpact,
          forecast: String(e.forecast ?? ""),
          previous: String(e.previous ?? ""),
          week,
          };
        });
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
