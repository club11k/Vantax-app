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
// Se cachea 30 minutos en el servidor para no saturar el feed (ForexFactory
// limita las peticiones frecuentes). Si falla, se devuelve una lista vacía y
// la página sigue funcionando.

export type EconEvent = {
  title: string;
  dateIso: string; // fecha y hora con zona horaria, tal cual la da el feed
  impact: "High" | "Medium" | "Low" | "Holiday" | string;
  forecast: string;
  previous: string;
  week: "this" | "next";
};

const URLS: { week: "this" | "next"; url: string }[] = [
  { week: "this", url: "https://nfs.faireconomy.media/ff_calendar_thisweek.json" },
  { week: "next", url: "https://nfs.faireconomy.media/ff_calendar_nextweek.json" },
];

async function fetchWeek(week: "this" | "next", url: string): Promise<EconEvent[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, headers: { "User-Agent": "Mozilla/5.0 (VANTAX)" } });
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e && e.country === "USD" && typeof e.date === "string")
      .map((e) => ({
        title: String(e.title ?? ""),
        dateIso: String(e.date),
        impact: String(e.impact ?? ""),
        forecast: String(e.forecast ?? ""),
        previous: String(e.previous ?? ""),
        week,
      }));
  } catch {
    return [];
  }
}

export async function fetchUsdCalendar(): Promise<{ events: EconEvent[]; nextWeekAvailable: boolean }> {
  const [thisWeek, nextWeek] = await Promise.all(URLS.map((u) => fetchWeek(u.week, u.url)));
  const events = [...thisWeek, ...nextWeek].sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime());
  return { events, nextWeekAvailable: nextWeek.length > 0 };
}
