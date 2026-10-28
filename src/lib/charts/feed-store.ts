// Almacén en memoria de los precios para CHARTS (28/10/2026).
//
// El programa mt5-feed de la VPS (un segundo MetaTrader 5 solo para precios)
// pregunta cada segundo qué hace falta (/api/charts/feed/tasks): la lista de
// símbolos, el histórico de los gráficos que alguien acaba de abrir y la vela
// en curso de los que alguien está mirando. Lo manda aquí y el gráfico de cada
// usuario lo lee de este almacén. Así no se mandan cientos de símbolos en
// tiempo real: solo lo que alguien está viendo.

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export type FeedSymbol = { name: string; description: string; path: string; digits: number };

export const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const HISTORY_COUNT = 2000; // velas que se cargan al abrir un gráfico
export const OLDER_COUNT = 1500; // velas por cada carga al ir hacia atrás

const WATCH_TTL_MS = 25_000; // un gráfico deja de "mirarse" si no pregunta en 25 s
const HISTORY_STALE_MS = 15 * 60_000; // histórico que se refresca por detrás
const REQUEST_RETRY_MS = 20_000; // si el feed no contesta, se vuelve a pedir
const SYMBOLS_STALE_MS = 6 * 60 * 60_000;
const FEED_ONLINE_MS = 20_000;
const MAX_BARS_PER_KEY = 6000;

type Series = { bars: Bar[]; at: number; error?: string };
type Pending = { symbol: string; tf: Timeframe; before: number | null; count: number; requestedAt: number };

type Store = {
  symbols: FeedSymbol[];
  symbolsAt: number;
  series: Map<string, Series>;
  older: Map<string, Series>; // tramos antiguos: key|before
  watch: Map<string, number>;
  pending: Map<string, Pending>;
  feedSeenAt: number;
};

const g = globalThis as unknown as { __vantaxChartsStore?: Store };
const store: Store =
  g.__vantaxChartsStore ??
  (g.__vantaxChartsStore = {
    symbols: [],
    symbolsAt: 0,
    series: new Map(),
    older: new Map(),
    watch: new Map(),
    pending: new Map(),
    feedSeenAt: 0,
  });

export const key = (symbol: string, tf: string) => `${symbol}|${tf}`;
const olderKey = (symbol: string, tf: string, before: number) => `${symbol}|${tf}|${before}`;

export function isTimeframe(tf: string): tf is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(tf);
}

export function feedOnline(): boolean {
  return Date.now() - store.feedSeenAt < FEED_ONLINE_MS;
}

// ---------- Lado del gráfico (usuarios) ----------

export function searchSymbols(q: string, limit = 60): FeedSymbol[] {
  const term = q.trim().toLowerCase();
  if (!term) return store.symbols.slice(0, limit);
  const starts: FeedSymbol[] = [];
  const contains: FeedSymbol[] = [];
  for (const s of store.symbols) {
    const n = s.name.toLowerCase();
    if (n.startsWith(term)) starts.push(s);
    else if (n.includes(term) || s.description.toLowerCase().includes(term)) contains.push(s);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export function symbolInfo(name: string): FeedSymbol | null {
  return store.symbols.find((s) => s.name === name) ?? null;
}

export function symbolsReady(): boolean {
  return store.symbols.length > 0;
}

function request(symbol: string, tf: Timeframe, before: number | null, count: number) {
  const k = before ? olderKey(symbol, tf, before) : key(symbol, tf);
  const p = store.pending.get(k);
  if (p && Date.now() - p.requestedAt < REQUEST_RETRY_MS) return;
  store.pending.set(k, { symbol, tf, before, count, requestedAt: Date.now() });
}

export function touch(symbol: string, tf: Timeframe) {
  store.watch.set(key(symbol, tf), Date.now());
}

export type BarsResult = { status: "ok"; bars: Bar[] } | { status: "pending" } | { status: "error"; error: string };

export function getBars(symbol: string, tf: Timeframe, before: number | null): BarsResult {
  if (before) {
    const k = olderKey(symbol, tf, before);
    const s = store.older.get(k);
    if (s) {
      store.older.delete(k); // se entrega una vez y se libera memoria
      return s.error ? { status: "error", error: s.error } : { status: "ok", bars: s.bars };
    }
    request(symbol, tf, before, OLDER_COUNT);
    return { status: "pending" };
  }
  touch(symbol, tf);
  const s = store.series.get(key(symbol, tf));
  if (s && s.bars.length) {
    if (Date.now() - s.at > HISTORY_STALE_MS) request(symbol, tf, null, HISTORY_COUNT);
    return { status: "ok", bars: s.bars };
  }
  if (s?.error) {
    store.series.delete(key(symbol, tf));
    return { status: "error", error: s.error };
  }
  request(symbol, tf, null, HISTORY_COUNT);
  return { status: "pending" };
}

export function getLastBars(symbol: string, tf: Timeframe, n = 2): Bar[] {
  touch(symbol, tf);
  const s = store.series.get(key(symbol, tf));
  return s ? s.bars.slice(-n) : [];
}

// ---------- Lado del feed (VPS) ----------

export function feedTasks() {
  store.feedSeenAt = Date.now();
  const now = Date.now();
  for (const [k, at] of store.watch) if (now - at > WATCH_TTL_MS) store.watch.delete(k);
  const history = Array.from(store.pending.values()).slice(0, 8).map((p) => ({
    symbol: p.symbol,
    tf: p.tf,
    before: p.before,
    count: p.count,
  }));
  const live = Array.from(store.watch.keys())
    .filter((k) => store.series.has(k))
    .map((k) => {
      const [symbol, tf] = k.split("|");
      return { symbol, tf };
    });
  return { needSymbols: store.symbols.length === 0 || now - store.symbolsAt > SYMBOLS_STALE_MS, history, live };
}

export function feedPutSymbols(symbols: FeedSymbol[]) {
  store.feedSeenAt = Date.now();
  store.symbols = symbols.slice().sort((a, b) => a.name.localeCompare(b.name));
  store.symbolsAt = Date.now();
}

export function feedPutBars(symbol: string, tf: Timeframe, before: number | null, bars: Bar[], error?: string) {
  store.feedSeenAt = Date.now();
  const clean = bars.filter((b) => Number.isFinite(b.t)).sort((a, b) => a.t - b.t);
  if (before) {
    const k = olderKey(symbol, tf, before);
    store.pending.delete(k);
    store.older.set(k, { bars: clean.filter((b) => b.t < before), at: Date.now(), error });
    return;
  }
  const k = key(symbol, tf);
  store.pending.delete(k);
  if (error && !clean.length) {
    store.series.set(k, { bars: [], at: Date.now(), error });
    return;
  }
  store.series.set(k, { bars: clean.slice(-MAX_BARS_PER_KEY), at: Date.now() });
}

export function feedPutLive(items: { symbol: string; tf: Timeframe; bars: Bar[] }[]) {
  store.feedSeenAt = Date.now();
  for (const it of items) {
    const s = store.series.get(key(it.symbol, it.tf));
    if (!s) continue;
    for (const b of it.bars.sort((a, c) => a.t - c.t)) {
      const last = s.bars[s.bars.length - 1];
      if (!last || b.t > last.t) s.bars.push(b);
      else if (b.t === last.t) s.bars[s.bars.length - 1] = b;
    }
    if (s.bars.length > MAX_BARS_PER_KEY) s.bars.splice(0, s.bars.length - MAX_BARS_PER_KEY);
  }
}
