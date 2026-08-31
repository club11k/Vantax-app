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
  opts: { units?: "lin" | "pc1" | "pch" | "chg" } = {}
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

export type PriceBar = { open: number; high: number; low: number; close: number };

// Serie de precios OHLC para calcular indicadores técnicos (EMA/RSI/ATR) y
// detectar zonas de soporte/resistencia a partir de máximos/mínimos
// oscilantes reales (swing highs/lows), no inventados. Solo funciona si hay
// TWELVE_DATA_API_KEY configurada (tier gratuito alcanza para uso moderado).
// Si no está configurada, el módulo técnico queda marcado como no
// disponible, igual que en el panel anterior.
async function fetchTwelveDataSeries(
  symbol: string,
  interval: "1day" = "1day",
  outputsize = 210
): Promise<PriceBar[] | null> {
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
    const values = json.values as { open: string; high: string; low: string; close: string }[] | undefined;
    if (!values) return null;
    // Twelve Data devuelve del más nuevo al más viejo; invertimos para calcular indicadores en orden cronológico.
    return values
      .map((v) => ({
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
      }))
      .reverse();
  } catch {
    return null;
  }
}

// Detecta zonas de soporte/resistencia a partir de máximos y mínimos
// oscilantes (fractales de 7 velas: la vela central es el máximo/mínimo
// dentro de una ventana de 3 velas a cada lado). Agrupa niveles cercanos
// entre sí (dentro de un 0.8%) en una única zona y cuenta cuántas veces fue
// "tocada" — más toques = zona más relevante. Solo usa precios reales de la
// serie histórica, nunca valores inventados.
export type LevelZone = { level: number; touches: number };
export type TechnicalLevels = { supports: LevelZone[]; resistances: LevelZone[] };

function findSwingLevels(bars: PriceBar[], currentPrice: number): TechnicalLevels | null {
  const pivotWindow = 3;
  const clusterPct = 0.008;
  const minTouches = 2;
  if (bars.length < pivotWindow * 2 + 10) return null;

  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = pivotWindow; i < bars.length - pivotWindow; i++) {
    const windowSlice = bars.slice(i - pivotWindow, i + pivotWindow + 1);
    if (windowSlice.every((b) => b.high <= bars[i].high)) swingHighs.push(bars[i].high);
    if (windowSlice.every((b) => b.low >= bars[i].low)) swingLows.push(bars[i].low);
  }

  function cluster(prices: number[]): LevelZone[] {
    const sorted = [...prices].sort((a, b) => a - b);
    const clusters: LevelZone[] = [];
    for (const p of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(p - last.level) / last.level <= clusterPct) {
        last.level = (last.level * last.touches + p) / (last.touches + 1);
        last.touches += 1;
      } else {
        clusters.push({ level: p, touches: 1 });
      }
    }
    return clusters;
  }

  const highClusters = cluster(swingHighs);
  const lowClusters = cluster(swingLows);

  const resistances = highClusters.filter((c) => c.level > currentPrice).sort((a, b) => a.level - b.level);
  const supports = lowClusters.filter((c) => c.level < currentPrice).sort((a, b) => b.level - a.level);

  const strongResistances = resistances.filter((c) => c.touches >= minTouches);
  const strongSupports = supports.filter((c) => c.touches >= minTouches);

  return {
    resistances: (strongResistances.length ? strongResistances : resistances).slice(0, 3),
    supports: (strongSupports.length ? strongSupports : supports).slice(0, 3),
  };
}

const CFTC_DISAGG_BASE = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";

// Posicionamiento semanal de "Managed Money" (fondos especulativos) en
// futuros de oro (COMEX), tomado del reporte Disaggregated COT que publica
// la CFTC (Comisión de EE.UU. que regula futuros). Es un dato público y
// gratuito, sin API key. Devolvemos el neto (largos - cortos) de esta
// semana y de la semana anterior para poder medir el cambio de flujo.
async function fetchCotGoldManagedMoney(): Promise<{
  date: string;
  netCurrent: number;
  netPrev: number | null;
  openInterest: number;
} | null> {
  try {
    const params = new URLSearchParams({
      $limit: "2",
      $order: "report_date_as_yyyy_mm_dd DESC",
      $where: "market_and_exchange_names like '%GOLD - COMMODITY EXCHANGE%'",
    });
    const res = await fetch(`${CFTC_DISAGG_BASE}?${params.toString()}`, {
      next: { revalidate: 21600 }, // el reporte es semanal (viernes), cachear 6h alcanza de sobra
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const parseNet = (row: any): number | null => {
      const long = parseFloat(row?.m_money_positions_long_all);
      const short = parseFloat(row?.m_money_positions_short_all);
      if (Number.isNaN(long) || Number.isNaN(short)) return null;
      return long - short;
    };

    const latest = rows[0];
    const netCurrent = parseNet(latest);
    const openInterest = parseFloat(latest?.open_interest_all);
    if (netCurrent === null || Number.isNaN(openInterest) || openInterest === 0) return null;

    const netPrev = rows[1] ? parseNet(rows[1]) : null;

    return {
      date: latest.report_date_as_yyyy_mm_dd,
      netCurrent,
      netPrev,
      openInterest,
    };
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

type FredValue = { date: string; value: number } | null;

export type MarketSnapshot = {
  generatedAt: string;
  macro: {
    us10yNominal: FredValue;
    us10yTipsReal: FredValue;
    us5yTipsReal: FredValue;
    us2y: FredValue;
    us30y: FredValue;
    t3m10ySpread: FredValue;
    cpiYoY: FredValue;
    coreCpiYoY: FredValue;
    pceYoY: FredValue;
    corePceYoY: FredValue;
    ppiYoY: FredValue;
    breakeven10y: FredValue;
    breakeven5y: FredValue;
    breakeven5y5yFwd: FredValue;
    michiganInflationExp: FredValue;
    unemploymentRate: FredValue;
    fedFundsRate: FredValue;
    m2YoY: FredValue;
  };
  liquidity: {
    fedBalanceSheet: FredValue;
    onRRP: FredValue;
    tga: FredValue;
  };
  labor: {
    nfpChange: FredValue;
    participationRate: FredValue;
    avgHourlyEarningsYoY: FredValue;
    joltsOpenings: FredValue;
    initialClaims: FredValue;
  };
  activity: {
    retailSalesMoM: FredValue;
    gdpRealYoY: FredValue;
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
    levels: TechnicalLevels | null;
  };
  risk: {
    vix: FredValue;
    hyOas: FredValue;
  };
  flows: {
    cotGoldManagedMoney: {
      date: string;
      netCurrent: number;
      netPrev: number | null;
      openInterest: number;
    } | null;
  };
};

// Punto de entrada principal: arma el snapshot completo que se le pasa a la IA.
// Usalo en el endpoint de generación de análisis, y guardalo en
// Analysis.dataSnapshot para poder auditar con qué datos se generó cada informe.
export async function buildMarketSnapshot(): Promise<MarketSnapshot> {
  const [
    us10yNominal,
    us10yTipsReal,
    us5yTipsReal,
    us2y,
    us30y,
    t3m10ySpread,
    cpiYoY,
    coreCpiYoY,
    pceYoY,
    corePceYoY,
    ppiYoY,
    breakeven10y,
    breakeven5y,
    breakeven5y5yFwd,
    michiganInflationExp,
    unemploymentRate,
    fedFundsRate,
    m2YoY,
    fedBalanceSheet,
    onRRP,
    tga,
    nfpChange,
    participationRate,
    avgHourlyEarningsYoY,
    joltsOpenings,
    initialClaims,
    retailSalesMoM,
    gdpRealYoY,
    vix,
    hyOas,
    gold,
    dxy,
    goldSeries,
    cotGoldManagedMoney,
  ] = await Promise.all([
    fetchFredSeries("DGS10"),
    fetchFredSeries("DFII10"),
    fetchFredSeries("DFII5"),
    fetchFredSeries("DGS2"),
    fetchFredSeries("DGS30"),
    fetchFredSeries("T10Y3M"),
    fetchFredSeries("CPIAUCSL", { units: "pc1" }),
    fetchFredSeries("CPILFESL", { units: "pc1" }),
    fetchFredSeries("PCEPI", { units: "pc1" }),
    fetchFredSeries("PCEPILFE", { units: "pc1" }),
    fetchFredSeries("PPIACO", { units: "pc1" }),
    fetchFredSeries("T10YIE"),
    fetchFredSeries("T5YIE"),
    fetchFredSeries("T5YIFR"),
    fetchFredSeries("MICH"),
    fetchFredSeries("UNRATE"),
    fetchFredSeries("DFF"), // Fed Funds Effective Rate (diario) — tipo de interés de referencia de la Fed
    fetchFredSeries("M2SL", { units: "pc1" }),
    fetchFredSeries("WALCL"),
    fetchFredSeries("RRPONTSYD"),
    fetchFredSeries("WDTGAL"),
    fetchFredSeries("PAYEMS", { units: "chg" }),
    fetchFredSeries("CIVPART"),
    fetchFredSeries("CES0500000003", { units: "pc1" }),
    fetchFredSeries("JTSJOL"),
    fetchFredSeries("ICSA"),
    fetchFredSeries("RSXFS", { units: "pch" }),
    fetchFredSeries("GDPC1", { units: "pc1" }),
    fetchFredSeries("VIXCLS"), // CBOE Volatility Index, gratis en FRED
    fetchFredSeries("BAMLH0A0HYM2"), // ICE BofA US High Yield OAS
    fetchTwelveDataQuote("XAU/USD"),
    fetchTwelveDataQuote("DXY"),
    fetchTwelveDataSeries("XAU/USD"),
    fetchCotGoldManagedMoney(),
  ]);

  const goldCloses = goldSeries?.map((b) => b.close) ?? null;
  const currentGoldPrice = gold?.price ?? goldCloses?.[goldCloses.length - 1] ?? null;
  const technical =
    goldSeries && goldCloses && currentGoldPrice !== null
      ? {
          available: true,
          ema20: ema(goldCloses, 20),
          ema50: ema(goldCloses, 50),
          ema100: ema(goldCloses, 100),
          ema200: ema(goldCloses, 200),
          rsi14: rsi(goldCloses, 14),
          levels: findSwingLevels(goldSeries, currentGoldPrice),
        }
      : { available: false, ema20: null, ema50: null, ema100: null, ema200: null, rsi14: null, levels: null };

  return {
    generatedAt: new Date().toISOString(),
    macro: {
      us10yNominal,
      us10yTipsReal,
      us5yTipsReal,
      us2y,
      us30y,
      t3m10ySpread,
      cpiYoY,
      coreCpiYoY,
      pceYoY,
      corePceYoY,
      ppiYoY,
      breakeven10y,
      breakeven5y,
      breakeven5y5yFwd,
      michiganInflationExp,
      unemploymentRate,
      fedFundsRate,
      m2YoY,
    },
    liquidity: { fedBalanceSheet, onRRP, tga },
    labor: { nfpChange, participationRate, avgHourlyEarningsYoY, joltsOpenings, initialClaims },
    activity: { retailSalesMoM, gdpRealYoY },
    prices: { gold, dxy },
    technical,
    risk: { vix, hyOas },
    flows: { cotGoldManagedMoney },
  };
}
