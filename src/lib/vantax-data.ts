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

import { inflateRawSync } from "zlib";

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
    // Coincidencia EXACTA del nombre de mercado, no "like": un filtro parcial como
    // '%GOLD - COMMODITY EXCHANGE%' también hace match con "MICRO GOLD - COMMODITY
    // EXCHANGE INC." (el contrato Micro Gold), mezclando ambos contratos y
    // devolviendo cifras equivocadas — bug real detectado en producción.
    const params = new URLSearchParams({
      $limit: "2",
      $order: "report_date_as_yyyy_mm_dd DESC",
      $where: "market_and_exchange_names = 'GOLD - COMMODITY EXCHANGE INC.'",
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

// Igual que fetchCotGoldManagedMoney pero para el contrato "Micro Gold"
// (10 oz, código CFTC 088695) — un contrato más chico pensado para
// operadores minoristas. Se ofrece como dato adicional informativo junto al
// contrato estándar de 100 oz; no participa en el cálculo del Bias Score
// (que ya usa el contrato estándar, mucho más líquido, como referencia de
// posicionamiento institucional).
async function fetchCotGoldMicro(): Promise<{
  date: string;
  netCurrent: number;
  netPrev: number | null;
  openInterest: number;
} | null> {
  try {
    // Coincidencia exacta también aquí, por la misma razón que en fetchCotGoldManagedMoney.
    const params = new URLSearchParams({
      $limit: "2",
      $order: "report_date_as_yyyy_mm_dd DESC",
      $where: "market_and_exchange_names = 'MICRO GOLD - COMMODITY EXCHANGE INC.'",
    });
    const res = await fetch(`${CFTC_DISAGG_BASE}?${params.toString()}`, {
      next: { revalidate: 21600 },
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

// Tenencias diarias de oro del ETF SPDR Gold Shares (GLD) — el ETF de oro
// físico más grande del mundo. SPDR publica un Excel histórico público (sin
// login, confirmado a mano por Esther: hizo clic en el enlace de descarga
// de "Charts & Data" en spdrgoldshares.com/usa/gld/ y se descargó sin
// pedirle ninguna cuenta) con la evolución día a día de las toneladas en
// custodia — URL real capturada desde su navegador (chrome://downloads),
// no adivinada. Es el dato más "fresco" de posicionamiento vía ETFs que
// existe (Goldhub, la fuente con el desglose completo por región/fondo que
// pidió Esther, se actualiza con más retraso y requiere descarga manual con
// registro — ver el resto de campos de "flows" pendientes de esa fuente).
//
// El archivo real (Esther nos pasó una copia para revisar el formato,
// "US_GLD_Archive_EN.xlsx") tiene dos hojas ("Disclaimer" y "US GLD
// Historical Archive") y esta columnas confirmadas en la hoja buena:
// Date | Closing Price | Ounces of Gold per Share | ... | Daily Share
// Volume | Total Ounces of Gold in the Trust | Tonnes of Gold | Total Net
// Asset Value in the Trust. La fecha viene como texto "24-Sep-2026" (no
// como fecha real de Excel), y algunas filas (festivos de EE.UU.) traen el
// texto "US Holiday" en vez de números -- se descartan al vuelo.
const SPDR_GLD_HOLDINGS_URL = "https://api.spdrgoldshares.com/api/v1/historical-archive?product=gld&exchange=NYSE&lang=en";

// --- Lector mínimo de .xlsx (zip + XML), sin librería externa ---
//
// Se implementa a mano en vez de añadir el paquete "xlsx" (SheetJS) de npm
// a propósito: la versión publicada en el registro de npm (0.18.5, la
// última disponible ahí) tiene dos vulnerabilidades conocidas sin parchear
// (prototype pollution y ReDoS — SheetJS solo distribuye las versiones
// arregladas desde su propio CDN, no vía npm). No parece razonable meter
// eso en el mismo proceso que maneja contraseñas cifradas de cuentas MT5 y
// pagos con Stripe, solo para leer dos columnas de un archivo. Este parser
// es deliberadamente mínimo: solo sabe leer filas y celdas simples (texto
// compartido y números), justo lo que trae el archivo real de SPDR. Si algo
// no encaja (SPDR cambia el formato del archivo), todo el asunto devuelve
// null como el resto de fetchers de este archivo — nunca rompe la página.

function unzipEntry(buf: Buffer, entryName: string): Buffer | null {
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const searchStart = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  let centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < entryCount; i++) {
    if (centralDirOffset + 46 > buf.length) return null;
    const sig = buf.readUInt32LE(centralDirOffset);
    if (sig !== 0x02014b50) return null;
    const compressionMethod = buf.readUInt16LE(centralDirOffset + 10);
    const compressedSize = buf.readUInt32LE(centralDirOffset + 20);
    const fileNameLength = buf.readUInt16LE(centralDirOffset + 28);
    const extraLength = buf.readUInt16LE(centralDirOffset + 30);
    const commentLength = buf.readUInt16LE(centralDirOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(centralDirOffset + 42);
    const fileName = buf.subarray(centralDirOffset + 46, centralDirOffset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      const lfNameLength = buf.readUInt16LE(localHeaderOffset + 26);
      const lfExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lfNameLength + lfExtraLength;
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return Buffer.from(compressed);
      if (compressionMethod === 8) return inflateRawSync(compressed);
      return null;
    }

    centralDirOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siMatches = xml.match(/<si[ >][\s\S]*?<\/si>/g) ?? [];
  const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
  for (const si of siMatches) {
    let text = "";
    tRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tRegex.exec(si))) text += m[1];
    strings.push(decodeXmlEntities(text));
  }
  return strings;
}

// Encuentra la ruta interna (p. ej. "xl/worksheets/sheet2.xml") de la hoja
// cuyo nombre coincida con el patrón dado, siguiendo workbook.xml (nombre
// -> r:id) y workbook.xml.rels (r:id -> archivo) — no asume que el número
// del archivo coincida con el orden de las pestañas.
function resolveSheetPath(workbookXml: string, relsXml: string, sheetNamePattern: RegExp): string | null {
  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/>/g) ?? [];
  let rId: string | null = null;
  for (const tag of sheetTags) {
    const nameMatch = /name="([^"]*)"/.exec(tag);
    const ridMatch = /r:id="([^"]*)"/.exec(tag);
    if (nameMatch && ridMatch && sheetNamePattern.test(decodeXmlEntities(nameMatch[1]))) {
      rId = ridMatch[1];
      break;
    }
  }
  if (!rId) return null;

  const relTags = relsXml.match(/<Relationship\b[^>]*\/>/g) ?? [];
  for (const tag of relTags) {
    const idMatch = /Id="([^"]*)"/.exec(tag);
    const targetMatch = /Target="([^"]*)"/.exec(tag);
    if (idMatch && targetMatch && idMatch[1] === rId) {
      const target = targetMatch[1];
      return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    }
  }
  return null;
}

// Parsea una hoja a filas "columna (letra) -> valor" — números tal cual,
// texto ya resuelto vía sharedStrings (celdas t="s") o inline (t="str"/"inlineStr").
function parseSheetRows(sheetXml: string, sharedStrings: string[]): Map<string, string | number>[] {
  const rows: Map<string, string | number>[] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const vRegex = /<v>([\s\S]*?)<\/v>/;
  const isRegex = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const rowXml = rowMatch[1];
    const rowMap = new Map<string, string | number>();
    cellRegex.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowXml))) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2];
      const refMatch = /r="([A-Z]+)\d+"/.exec(attrs);
      if (!refMatch || inner === undefined) continue;
      const col = refMatch[1];
      const typeMatch = /\bt="([a-zA-Z]+)"/.exec(attrs);
      const type = typeMatch?.[1];

      if (type === "inlineStr") {
        const m = isRegex.exec(inner);
        if (m) rowMap.set(col, decodeXmlEntities(m[1]));
        continue;
      }
      const vMatch = vRegex.exec(inner);
      if (!vMatch) continue;
      const rawValue = vMatch[1];

      if (type === "s") {
        rowMap.set(col, sharedStrings[parseInt(rawValue, 10)] ?? "");
      } else if (type === "str") {
        rowMap.set(col, decodeXmlEntities(rawValue));
      } else {
        const num = parseFloat(rawValue);
        rowMap.set(col, Number.isNaN(num) ? decodeXmlEntities(rawValue) : num);
      }
    }
    rows.push(rowMap);
  }
  return rows;
}

const SPDR_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Convierte fechas tipo "24-Sep-2026" (formato de texto tal cual las trae
// el Excel real de SPDR) a Date. Si el formato no coincide, null.
function parseSpdrDate(raw: string): Date | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = SPDR_MONTHS[m[2].toLowerCase()];
  const day = parseInt(m[1], 10);
  const year = parseInt(m[3], 10);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

async function fetchGldHoldings(): Promise<{
  date: string;
  tonnes: number;
  tonnesPrev: number | null;
} | null> {
  try {
    const res = await fetch(SPDR_GLD_HOLDINGS_URL, {
      next: { revalidate: 21600 }, // 6h — SPDR publica una vez al día tras el cierre
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    const workbookXml = unzipEntry(buf, "xl/workbook.xml")?.toString("utf8");
    const relsXml = unzipEntry(buf, "xl/_rels/workbook.xml.rels")?.toString("utf8");
    if (!workbookXml || !relsXml) return null;

    const sheetPath = resolveSheetPath(workbookXml, relsXml, /historical.?archive/i);
    if (!sheetPath) return null;
    const sheetXmlBuf = unzipEntry(buf, sheetPath);
    if (!sheetXmlBuf) return null;

    const sharedStringsBuf = unzipEntry(buf, "xl/sharedStrings.xml");
    const sharedStrings = sharedStringsBuf ? parseSharedStrings(sharedStringsBuf.toString("utf8")) : [];

    const rows = parseSheetRows(sheetXmlBuf.toString("utf8"), sharedStrings);
    if (rows.length < 2) return null;

    const header = rows[0];
    let dateCol: string | null = null;
    let tonnesCol: string | null = null;
    for (const [col, value] of header.entries()) {
      if (typeof value !== "string") continue;
      if (/date/i.test(value)) dateCol = col;
      if (/tonnes of gold/i.test(value)) tonnesCol = col;
    }
    if (!tonnesCol) {
      for (const [col, value] of header.entries()) {
        if (typeof value === "string" && /tonnes/i.test(value)) tonnesCol = col;
      }
    }
    if (!dateCol || !tonnesCol) return null;

    const parsedRows: { date: Date; tonnes: number }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const rawDate = rows[i].get(dateCol);
      const rawTonnes = rows[i].get(tonnesCol);
      if (typeof rawDate !== "string" || typeof rawTonnes !== "number") continue; // filas "US Holiday" u otras no numéricas
      const d = parseSpdrDate(rawDate);
      if (!d) continue;
      parsedRows.push({ date: d, tonnes: rawTonnes });
    }
    if (parsedRows.length === 0) return null;

    parsedRows.sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = parsedRows[0];
    const prev = parsedRows[1] ?? null;

    return {
      date: latest.date.toISOString().slice(0, 10),
      tonnes: Math.round(latest.tonnes * 100) / 100,
      tonnesPrev: prev ? Math.round(prev.tonnes * 100) / 100 : null,
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
    cotGoldMicro: {
      date: string;
      netCurrent: number;
      netPrev: number | null;
      openInterest: number;
    } | null;
    // Tenencias del ETF SPDR Gold Shares (GLD), vía CSV público diario. Es
    // solo el primer dato de la petición de Esther de integrar flujos y
    // posicionamiento de ETFs de oro (holdings/flows por región de Goldhub,
    // desglose por fondo GLD/IAU) — el resto necesita el Excel de Goldhub,
    // que requiere descarga manual con registro y aún no se ha integrado.
    etfGoldHoldings: {
      date: string;
      tonnes: number;
      tonnesPrev: number | null;
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
    cotGoldMicro,
    etfGoldHoldings,
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
    // PPIFIS = "Producer Price Index by Commodity: Final Demand" — es la serie que
    // corresponde al PPI de cabecera que publica el BLS cada mes (el que sale en
    // prensa). Antes se usaba PPIACO ("All Commodities"), una serie mucho más
    // volátil y dominada por energía/materias primas, que no es el mismo dato:
    // en julio 2026 PPIACO daba +8,27% interanual mientras el PPI real (Final
    // Demand) del BLS fue +4,7%.
    fetchFredSeries("PPIFIS", { units: "pc1" }),
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
    fetchCotGoldMicro(),
    fetchGldHoldings(),
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
    flows: { cotGoldManagedMoney, cotGoldMicro, etfGoldHoldings },
  };
}
