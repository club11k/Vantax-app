// Recolección de datos de mercado en tiempo de servidor.
//
// IMPORTANTE: este archivo corre en el servidor de Render (o el hosting que
// elijas), NO en el sandbox donde Claude generó este código. El servidor de
// Render tiene salida a internet normal, así que estas llamadas a FRED /
// Twelve Data SÍ funcionan en producción, a diferencia del panel-artifact
// anterior que dependía de que Claude buscara los datos a mano.
//
// Todas las funciones son tolerantes a fallos: si falta una API key o la
// llamada falla, devuelven null en vez de tirar la app abajo. El prompt de
// análisis está preparado para avisar cuando un dato no está disponible.

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const TWELVE_DATA_BASE = "https://api.twelvedata.com";

type FredObservation = { date: string; value: string };

async function fetchFredSeries(
  seriesId: string,
  opts: { units?: "lin" | "pc1" | "pch" } = {}
): Promise<{ date: string; value: number } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "5",
  });
  if (opts.units) params.set("units", opts.units);

  try {
    const res = await fetch(`${FRED_BASE}?${params.toString()}`, {
      next: { revalidate: 3600 }, // cachea 1h, esto no necesita ser al segundo
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { observations?: FredObservation[] };
    const obs = json.observations?.find((o) => o.value !== ".");
    if (!obs) return null;
    return { date: obs.date, value: parseFloat(obs.value) };
  } catch {
    return null;
  }
}

async function fetchTwelveDataQuote(symbol: string): Promise<{
  price: number;
  percentChange: number;
} | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
      { next: { revalidate: 300 } } // 5 min de caché, esto sí es más "en vivo"
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.close) return null;
    return {
      price: parseFloat(json.close),
      percentChange: parseFloat(json.percent_change ?? "0"),
    };
  } catch {
    return null;
  }
}

// Serie de precios OHLC para calcular indicadores técnicos (EMA/RSI/ATR).
// Solo funciona si hay TWELVE_DATA_API_KEY configurada (tier gratuito alcanza
// para uso moderado). Si no está configurada, el módulo técnico queda
// marcado como no disponible, igual que en el panel anterior.
async function fetchTwelveDataSeries(
  symbol: string,
  interval: "1day" = "1day",
  outputsize = 210
): Promise<number[] | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(
        symbol
      )}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const values = json.values as { close: string }[] | undefined;
    if (!values) return null;
    // Twelve Data devuelve del más nuevo al más viejo; invertimos para calcular indicadores en orden cronológico.
    return values.map((v) => parseFloat(v.close)).reverse();
  } catch {
    return null;
  }
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MarketSnapshot = {
  generatedAt: string;
  macro: {
    us10yNominal: { date: string; value: number } | null;
    us10yTipsReal: { date: string; value: number } | null;
    us2y: { date: string; value: number } | null;
    cpiYoY: { date: string; value: number } | null;
    coreCpiYoY: { date: string; value: number } | null;
    unemploymentRate: { date: string; value: number } | null;
  };
  prices: {
    gold: { price: number; percentChange: number } | null;
    dxy: { price: number; percentChange: number } | null;
  };
  technical: {
    available: boolean;
    ema20: number | null;
    ema50: number | null;
    ema100: number | null;
    ema200: number | null;
    rsi14: number | null;
  };
};

// Punto de entrada principal: arma el snapshot completo que se le pasa a la IA.
// Usalo en el endpoint de generación de análisis, y guardalo en
// Analysis.dataSnapshot para poder auditar con qué datos se generó cada informe.
export async function buildMarketSnapshot(): Promise<MarketSnapshot> {
  const [us10yNominal, us10yTipsReal, us2y, cpiYoY, coreCpiYoY, unemploymentRate, gold, dxy, goldSeries] =
    await Promise.all([
      fetchFredSeries("DGS10"),
      fetchFredSeries("DFII10"),
      fetchFredSeries("DGS2"),
      fetchFredSeries("CPIAUCSL", { units: "pc1" }),
      fetchFredSeries("CPILFESL", { units: "pc1" }),
      fetchFredSeries("UNRATE"),
      fetchTwelveDataQuote("XAU/USD"),
      fetchTwelveDataQuote("DXY"),
      fetchTwelveDataSeries("XAU/USD"),
    ]);

  const technical = goldSeries
    ? {
        available: true,
        ema20: ema(goldSeries, 20),
        ema50: ema(goldSeries, 50),
        ema100: ema(goldSeries, 100),
        ema200: ema(goldSeries, 200),
        rsi14: rsi(goldSeries, 14),
      }
    : { available: false, ema20: null, ema50: null, ema100: null, ema200: null, rsi14: null };

  return {
    generatedAt: new Date().toISOString(),
    macro: { us10yNominal, us10yTipsReal, us2y, cpiYoY, coreCpiYoY, unemploymentRate },
    prices: { gold, dxy },
    technical,
  };
}
