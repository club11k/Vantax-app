"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart, KLineData, Overlay, Period } from "klinecharts";
import { CHART_BG, chartStyles, FONT } from "./chart-theme";
import { makePineTemplate } from "./pine-indicator";
import { PineAdmin, type AdminIndicator } from "./PineAdmin";
import type { PineInput } from "@/lib/pine/runtime";

// Gráfico propio de VANTAX CHARTS (28/10/2026), con KLineChart (Apache 2.0).
// Precios del MT5 del bróker vía el feed de la VPS (ver
// src/lib/charts/feed-store.ts y mt5-orchestrator/feed.py). Los dibujos,
// indicadores, símbolo y temporalidad de cada usuario se guardan en su cuenta.
// Indicadores: solo los que crea el admin pegando código Pine (ver
// src/lib/pine y PineAdmin.tsx); ya no hay indicadores integrados.

type Tf = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1" | "MN1";
type ChartType = "candle_solid" | "candle_stroke" | "ohlc" | "area";
type SavedOverlay = { name: string; points: { timestamp?: number; value?: number }[]; extendData?: unknown; styles?: unknown };
type Layout = {
  symbol: string;
  tf: Tf;
  chartType: ChartType;
  ind: ActiveInd[];
  magnet: boolean;
  drawings: Record<string, SavedOverlay[]>;
};
type ActiveInd = { id: string; inputs: Record<string, any> };
type IndStatus = { error: string | null; warnings: string[]; inputs: PineInput[]; title: string };
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
type SymbolRow = { name: string; description: string; path: string; digits: number };

const TFS: { id: Tf; label: string; period: Period }[] = [
  { id: "M1", label: "1m", period: { type: "minute", span: 1 } },
  { id: "M5", label: "5m", period: { type: "minute", span: 5 } },
  { id: "M15", label: "15m", period: { type: "minute", span: 15 } },
  { id: "M30", label: "30m", period: { type: "minute", span: 30 } },
  { id: "H1", label: "1H", period: { type: "hour", span: 1 } },
  { id: "H4", label: "4H", period: { type: "hour", span: 4 } },
  { id: "D1", label: "1D", period: { type: "day", span: 1 } },
  { id: "W1", label: "1S", period: { type: "week", span: 1 } },
  { id: "MN1", label: "1M", period: { type: "month", span: 1 } },
];

type Tool = { id: string; label: string; icon: JSX.Element };
const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const TOOLS: Tool[] = [
  { id: "cursor", label: "Cursor", icon: I("M5 3l14 8-6 2-2 6z") },
  { id: "segment", label: "Línea de tendencia", icon: I("M4 19L20 5M4 19h0M20 5h0") },
  { id: "rayLine", label: "Rayo", icon: I("M4 19L20 5M17 5h3v3") },
  { id: "straightLine", label: "Línea extendida", icon: I("M2 21L22 3") },
  { id: "horizontalStraightLine", label: "Línea horizontal", icon: I("M3 12h18") },
  { id: "verticalStraightLine", label: "Línea vertical", icon: I("M12 3v18") },
  { id: "priceLine", label: "Línea de precio", icon: I("M3 12h12M15 9l3 3-3 3M19 8v8") },
  { id: "parallelStraightLine", label: "Canal paralelo", icon: I("M3 16L17 4M7 20L21 8") },
  { id: "fibonacciLine", label: "Fibonacci", icon: I("M3 4h18M3 9h18M3 13h18M3 20h18") },
  { id: "vxRect", label: "Rectángulo / zona", icon: I("M4 6h16v12H4z") },
  { id: "brush", label: "Pincel", icon: I("M4 20c2 0 3-1 3-3s2-3 4-3 3-2 3-4l6-6") },
  { id: "simpleAnnotation", label: "Nota", icon: I("M4 5h16v10H9l-5 4z") },
];

const DEFAULT_LAYOUT: Layout = {
  symbol: "XAUUSD",
  tf: "M15",
  chartType: "candle_solid",
  ind: [],
  magnet: true,
  drawings: {},
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toK = (b: Bar): KLineData => ({ timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });

let rectRegistered = false;
const TEST_ID = "__test";

function unpack(packed: string, id: string): string {
  const bin = atob(packed);
  const key = "vx" + id;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ key.charCodeAt(i % key.length);
  return new TextDecoder().decode(bytes);
}

export function ProChart({ isAdmin = false, onUnavailable }: { isAdmin?: boolean; onUnavailable?: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const klRef = useRef<typeof import("klinecharts") | null>(null);
  const layoutRef = useRef<Layout>(DEFAULT_LAYOUT);
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadToken = useRef(0);
  const selectedOverlay = useRef<string | null>(null);
  const digitsRef = useRef(2);
  const codesRef = useRef<Record<string, string>>({});
  const statusRef = useRef<Record<string, IndStatus>>({});

  const [layout, setLayoutState] = useState<Layout>(DEFAULT_LAYOUT);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ok" | "pending" | "offline" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [tool, setTool] = useState("cursor");
  const [panel, setPanel] = useState<null | "symbols" | "indicators" | "admin">(null);
  const [indList, setIndList] = useState<AdminIndicator[]>([]);
  const [indStatus, setIndStatus] = useState<Record<string, IndStatus>>({});
  const [openInputs, setOpenInputs] = useState<string | null>(null);
  const [last, setLast] = useState<{ price: number; change: number } | null>(null);
  const [digits, setDigits] = useState(2);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");

  // ---------- guardado del diseño ----------
  const persist = useCallback((next: Layout) => {
    layoutRef.current = next;
    setLayoutState(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/charts/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        setSaved("saved");
      } catch {
        setSaved("idle");
      }
    }, 1500);
  }, []);

  const snapshotDrawings = useCallback((): SavedOverlay[] => {
    const chart = chartRef.current;
    if (!chart) return [];
    return chart
      .getOverlays()
      .filter((o: Overlay) => o.currentStep === -1 || o.points.length >= 1)
      .map((o: Overlay) => ({
        name: o.name,
        points: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value })),
        extendData: o.extendData,
        styles: o.styles ?? undefined,
      }));
  }, []);

  const saveDrawings = useCallback(() => {
    const cur = layoutRef.current;
    persist({ ...cur, drawings: { ...cur.drawings, [cur.symbol]: snapshotDrawings() } });
  }, [persist, snapshotDrawings]);

  const overlayEvents = useCallback(
    () => ({
      onDrawEnd: () => {
        saveDrawings();
        setTool("cursor");
      },
      onPressedMoveEnd: () => saveDrawings(),
      onRemoved: () => saveDrawings(),
      onSelected: (e: { overlay: Overlay }) => {
        selectedOverlay.current = e.overlay.id;
      },
      onDeselected: () => {
        selectedOverlay.current = null;
      },
      onRightClick: (e: { overlay: Overlay }) => {
        chartRef.current?.removeOverlay({ id: e.overlay.id });
      },
    }),
    [saveDrawings]
  );

  const restoreDrawings = useCallback(
    (symbol: string) => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.removeOverlay();
      const list = layoutRef.current.drawings[symbol] ?? [];
      for (const d of list) {
        chart.createOverlay({
          name: d.name,
          points: d.points,
          extendData: d.extendData,
          styles: (d.styles as any) ?? undefined,
          mode: layoutRef.current.magnet ? "weak_magnet" : "normal",
          ...(overlayEvents() as any),
        });
      }
    },
    [overlayEvents]
  );

  // ---------- indicadores ----------
  const setStatusFor = useCallback((id: string, st: IndStatus | null) => {
    const prev = statusRef.current[id];
    if (st && prev && prev.error === st.error && prev.warnings.join("|") === st.warnings.join("|") && prev.inputs.length === st.inputs.length && prev.title === st.title) return;
    const next = { ...statusRef.current };
    if (st) next[id] = st;
    else delete next[id];
    statusRef.current = next;
    setIndStatus(next);
  }, []);

  // Añade (o vuelve a añadir) un indicador Pine al gráfico
  const addPine = useCallback(
    (id: string, code: string, inputs: Record<string, any>): { error: string | null; warnings: string[]; title?: string } => {
      const chart = chartRef.current;
      const kl = klRef.current;
      if (!chart || !kl) return { error: "El gráfico aún no está listo.", warnings: [] };
      const name = `vx_${id}`;
      chart.removeIndicator({ name });
      let result: { error: string | null; warnings: string[]; title?: string } = { error: null, warnings: [] };
      try {
        const { template, head } = makePineTemplate({
          id,
          name,
          code,
          inputs,
          getCtx: () => ({ symbol: layoutRef.current.symbol, tf: layoutRef.current.tf, digits: digitsRef.current }),
          onResult: ({ error, warnings, out }) => {
            result = { error, warnings, title: head.title };
            setStatusFor(id, { error, warnings, inputs: out?.inputs ?? head.inputs, title: head.title });
          },
        });
        kl.registerIndicator(template as any);
        if (head.overlay) chart.createIndicator({ name, paneId: "candle_pane" } as any, true);
        else {
          chart.createIndicator({ name, paneId: `pane_${id}` } as any, false);
          chart.setPaneOptions({ id: `pane_${id}`, height: 150 });
        }
        setStatusFor(id, { error: statusRef.current[id]?.error ?? null, warnings: statusRef.current[id]?.warnings ?? [], inputs: head.inputs, title: head.title });
        result = { error: statusRef.current[id]?.error ?? null, warnings: statusRef.current[id]?.warnings ?? [], title: head.title };
      } catch (e) {
        chart.removeIndicator({ name });
        const msg = (e as Error).message;
        setStatusFor(id, { error: msg, warnings: [], inputs: [], title: "" });
        result = { error: msg, warnings: [] };
      }
      return result;
    },
    [setStatusFor]
  );

  const removePine = useCallback((id: string) => {
    chartRef.current?.removeIndicator({ name: `vx_${id}` });
  }, []);

  // Pone en el gráfico los indicadores activos del usuario que siguen disponibles
  const applyActive = useCallback(() => {
    for (const a of layoutRef.current.ind) {
      const code = codesRef.current[a.id];
      if (code) addPine(a.id, code, a.inputs);
    }
  }, [addPine]);

  const loadIndicators = useCallback(async () => {
    const res = await fetch("/api/charts/indicators", { cache: "no-store" }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    const list: any[] = json?.indicators ?? [];
    const codes: Record<string, string> = {};
    for (const r of list) {
      try {
        codes[r.id] = r.code ?? (r.packed ? unpack(r.packed, r.id) : "");
      } catch {
        /* ignorar */
      }
    }
    const changed = Object.keys(codes).filter((id) => codes[id] !== codesRef.current[id]);
    const removed = Object.keys(codesRef.current).filter((id) => !(id in codes));
    codesRef.current = codes;
    setIndList(list.map((r) => ({ id: r.id, name: r.name, description: r.description, code: r.code, visibility: r.visibility, accessCount: r.accessCount })));
    return { changed, removed };
  }, []);

  // ---------- datos ----------
  const fetchBars = useCallback(async (symbol: string, tf: Tf, before: number | null, token: number) => {
    for (let i = 0; i < 40; i++) {
      if (token !== loadToken.current) return null;
      const url = `/api/charts/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}${before ? `&before=${before}` : ""}`;
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (json) {
        if (typeof json.digits === "number") {
          setDigits(json.digits);
          digitsRef.current = json.digits;
        }
        if (json.status === "ok") return { ok: true as const, bars: json.bars as Bar[] };
        if (json.status === "error") return { ok: false as const, error: json.error as string };
        if (!json.online && i > 2) return { ok: false as const, error: "offline" };
      }
      if (!before) setStatus("pending");
      await sleep(i < 10 ? 600 : 1200);
    }
    return { ok: false as const, error: "El servidor de precios no ha respondido a tiempo." };
  }, []);

  const loadSymbol = useCallback(
    (symbol: string, tf: Tf) => {
      const chart = chartRef.current;
      if (!chart) return;
      const token = ++loadToken.current;
      setStatus("loading");
      setErrorText(null);
      setLast(null);
      const period = TFS.find((t) => t.id === tf)!.period;

      chart.setDataLoader({
        getBars: async ({ type, timestamp, callback }) => {
          if (type === "backward") return callback([], false);
          const before = type === "forward" ? timestamp : null;
          const result = await fetchBars(symbol, tf, before ?? null, token);
          if (!result || token !== loadToken.current) return;
          if (!result.ok) {
            callback([], false);
            if (type === "init") {
              setStatus(result.error === "offline" ? "offline" : "error");
              setErrorText(result.error === "offline" ? null : result.error);
              if (result.error === "offline") onUnavailable?.();
            }
            return;
          }
          const data = result.bars.map(toK);
          callback(data, { forward: data.length > 0 });
          if (type === "init") {
            setStatus("ok");
            updateLast();
            setTimeout(() => restoreDrawings(symbol), 0);
          }
        },
        subscribeBar: ({ callback }) => {
          if (liveTimer.current) clearInterval(liveTimer.current);
          liveTimer.current = setInterval(async () => {
            if (token !== loadToken.current || document.hidden) return;
            const res = await fetch(`/api/charts/live?symbol=${encodeURIComponent(symbol)}&tf=${tf}`, { cache: "no-store" }).catch(() => null);
            const json = res ? await res.json().catch(() => null) : null;
            if (!json || token !== loadToken.current) return;
            setStatus(json.online ? "ok" : "offline");
            for (const b of (json.bars as Bar[]) ?? []) callback(toK(b));
            updateLast();
          }, 1000);
        },
        unsubscribeBar: () => {
          if (liveTimer.current) clearInterval(liveTimer.current);
          liveTimer.current = null;
        },
      });
      chart.setSymbol({ ticker: symbol, pricePrecision: digits, volumePrecision: 0 });
      chart.setPeriod(period);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchBars, restoreDrawings, onUnavailable]
  );

  function updateLast() {
    const list = chartRef.current?.getDataList() ?? [];
    if (!list.length) return;
    const lastBar = list[list.length - 1];
    const dayAgo = lastBar.timestamp - 24 * 3600 * 1000;
    let ref = list[0];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].timestamp <= dayAgo) {
        ref = list[i];
        break;
      }
    }
    setLast({ price: lastBar.close, change: ref.close ? ((lastBar.close - ref.close) / ref.close) * 100 : 0 });
  }

  // ---------- arranque ----------
  useEffect(() => {
    let disposed = false;
    (async () => {
      const kl = await import("klinecharts");
      if (disposed || !chartEl.current) return;
      klRef.current = kl;
      kl.registerLocale("es-ES", {
        time: "Hora: ",
        open: "A: ",
        high: "Máx: ",
        low: "Mín: ",
        close: "C: ",
        volume: "Vol: ",
        turnover: "Vol$: ",
        change: "Var: ",
        second: "s",
        minute: "m",
        hour: "H",
        day: "D",
        week: "S",
        month: "M",
        year: "A",
      });
      if (!rectRegistered) {
        rectRegistered = true;
        kl.registerOverlay({
          name: "vxRect",
          totalStep: 3,
          needDefaultPointFigure: true,
          needDefaultXAxisFigure: true,
          needDefaultYAxisFigure: true,
          createPointFigures: ({ coordinates }) => {
            if (coordinates.length < 2) return [];
            const [a, b] = coordinates;
            return [
              {
                type: "rect",
                attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
                styles: { style: "stroke_fill" },
              },
            ];
          },
        });
      }

      const indicatorsReady = loadIndicators().catch(() => null);
      let saved: Layout = DEFAULT_LAYOUT;
      try {
        const res = await fetch("/api/charts/layout", { cache: "no-store" });
        const json = await res.json();
        if (json?.layout && typeof json.layout === "object") saved = { ...DEFAULT_LAYOUT, ...json.layout };
      } catch {
        /* sin diseño guardado */
      }
      if (disposed || !chartEl.current) return;
      layoutRef.current = saved;
      setLayoutState(saved);

      const chart = kl.init(chartEl.current, {
        locale: "es-ES",
        timezone: "Europe/Madrid",
        styles: chartStyles(saved.chartType) as any,
      });
      if (!chart) return;
      chartRef.current = chart;
      layoutRef.current = { ...saved, ind: Array.isArray(saved.ind) ? saved.ind.filter((x) => x && typeof x.id === "string") : [] };
      setLayoutState(layoutRef.current);
      await indicatorsReady;
      if (disposed) return;
      applyActive();
      setReady(true);
      loadSymbol(saved.symbol, saved.tf);
    })();

    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => chartRef.current?.resize()) : null;
    if (ro && chartEl.current) ro.observe(chartEl.current);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedOverlay.current) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        chartRef.current?.removeOverlay({ id: selectedOverlay.current });
        selectedOverlay.current = null;
      }
      if (e.key === "Escape") setTool("cursor");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      window.removeEventListener("keydown", onKey);
      if (liveTimer.current) clearInterval(liveTimer.current);
      if (chartEl.current && klRef.current) klRef.current.dispose(chartEl.current);
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setSymbol({ ticker: layout.symbol, pricePrecision: digits, volumePrecision: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  // ---------- acciones de la barra ----------
  function changeSymbol(symbol: string) {
    setPanel(null);
    if (symbol === layoutRef.current.symbol) return;
    const cur = layoutRef.current;
    const next = { ...cur, symbol, drawings: { ...cur.drawings, [cur.symbol]: snapshotDrawings() } };
    persist(next);
    chartRef.current?.removeOverlay();
    loadSymbol(symbol, next.tf);
  }

  function changeTf(tf: Tf) {
    if (tf === layoutRef.current.tf) return;
    const cur = layoutRef.current;
    persist({ ...cur, tf, drawings: { ...cur.drawings, [cur.symbol]: snapshotDrawings() } });
    loadSymbol(cur.symbol, tf);
  }

  function changeType(chartType: ChartType) {
    chartRef.current?.setStyles(chartStyles(chartType) as any);
    persist({ ...layoutRef.current, chartType });
  }

  function toggleIndicator(id: string) {
    const cur = layoutRef.current;
    const active = cur.ind.some((x) => x.id === id);
    const next = { ...cur, ind: active ? cur.ind.filter((x) => x.id !== id) : [...cur.ind, { id, inputs: {} }] };
    persist(next);
    if (active) {
      removePine(id);
      setStatusFor(id, null);
      if (openInputs === id) setOpenInputs(null);
    } else {
      const code = codesRef.current[id];
      if (code) addPine(id, code, {});
    }
  }

  function changeInput(id: string, key: string, value: any) {
    const cur = layoutRef.current;
    const ind = cur.ind.map((x) => (x.id === id ? { ...x, inputs: { ...x.inputs, [key]: value } } : x));
    persist({ ...cur, ind });
    const a = ind.find((x) => x.id === id);
    const code = codesRef.current[id];
    if (a && code) addPine(id, code, a.inputs);
  }

  function resetInputs(id: string) {
    const cur = layoutRef.current;
    const ind = cur.ind.map((x) => (x.id === id ? { ...x, inputs: {} } : x));
    persist({ ...cur, ind });
    const code = codesRef.current[id];
    if (code) addPine(id, code, {});
  }

  // ---------- admin ----------
  const testIndicator = useCallback((code: string) => addPine(TEST_ID, code, {}), [addPine]);
  const clearTest = useCallback(() => {
    removePine(TEST_ID);
    setStatusFor(TEST_ID, null);
  }, [removePine, setStatusFor]);
  const reloadIndicators = useCallback(async () => {
    const { changed, removed } = await loadIndicators();
    const cur = layoutRef.current;
    for (const id of removed) removePine(id);
    for (const id of changed) {
      const a = cur.ind.find((x) => x.id === id);
      if (a) addPine(id, codesRef.current[id], a.inputs);
    }
  }, [loadIndicators, removePine, addPine]);

  function pickTool(id: string) {
    setTool(id);
    if (id === "cursor") return;
    chartRef.current?.createOverlay({
      name: id,
      mode: layoutRef.current.magnet ? "weak_magnet" : "normal",
      ...(overlayEvents() as any),
    });
  }

  function clearDrawings() {
    if (!confirm(`¿Borrar todos los dibujos de ${layoutRef.current.symbol}?`)) return;
    chartRef.current?.removeOverlay();
    saveDrawings();
  }

  function screenshot() {
    const url = chartRef.current?.getConvertPictureUrl(true, "png", CHART_BG);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `vantax-${layoutRef.current.symbol}-${layoutRef.current.tf}.png`;
    a.click();
  }

  function fullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
    setTimeout(() => chartRef.current?.resize(), 300);
  }

  const up = (last?.change ?? 0) >= 0;

  return (
    <div className="pc-wrap" ref={wrapRef}>
      <div className="pc-top">
        <button type="button" className="pc-symbol" onClick={() => setPanel(panel === "symbols" ? null : "symbols")}>
          <span className="pc-symbol-name">{layout.symbol}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {last && (
          <div className="pc-quote">
            <span className="pc-price">{last.price.toFixed(digits)}</span>
            <span className={`pc-chg ${up ? "up" : "down"}`}>
              {up ? "+" : ""}
              {last.change.toFixed(2)}%
            </span>
          </div>
        )}

        <div className="pc-tfs" role="tablist" aria-label="Temporalidad">
          {TFS.map((t) => (
            <button key={t.id} type="button" className={`pc-tf${layout.tf === t.id ? " active" : ""}`} onClick={() => changeTf(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="pc-actions">
          <div className="pc-seg" role="group" aria-label="Tipo de gráfico">
            {(
              [
                ["candle_solid", "Velas", "M7 4v16M17 4v16M5 8h4v8H5zM15 6h4v10h-4z"],
                ["candle_stroke", "Velas huecas", "M7 4v16M17 4v16M5 8h4v8H5zM15 6h4v10h-4z"],
                ["ohlc", "Barras", "M7 4v16M4 8h3M7 15h3M17 4v16M14 7h3M17 13h3"],
                ["area", "Área", "M3 17l5-6 4 3 5-7 4 4v6H3z"],
              ] as const
            ).map(([id, label, d]) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                className={`pc-icon${layout.chartType === id ? " active" : ""}`}
                onClick={() => changeType(id)}
              >
                {I(d)}
              </button>
            ))}
          </div>
          <button type="button" className={`pc-btn${panel === "indicators" ? " active" : ""}`} onClick={() => setPanel(panel === "indicators" ? null : "indicators")}>
            {I("M3 17l5-5 4 4 8-9")}
            <span>Indicadores</span>
          </button>
          {isAdmin && (
            <button type="button" className={`pc-btn pc-btn-admin${panel === "admin" ? " active" : ""}`} onClick={() => setPanel(panel === "admin" ? null : "admin")}>
              {I("M12 5v14M5 12h14")}
              <span>Crear indicador</span>
            </button>
          )}
          <button type="button" className="pc-icon" title="Captura" aria-label="Captura" onClick={screenshot}>
            {I("M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z")}
          </button>
          <button type="button" className="pc-icon" title="Pantalla completa" aria-label="Pantalla completa" onClick={fullscreen}>
            {I("M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5")}
          </button>
          <span className={`pc-status ${status === "ok" ? "live" : status === "offline" || status === "error" ? "off" : ""}`}>
            <span className="dot" />
            {status === "ok" ? "En vivo" : status === "offline" ? "Sin conexión" : status === "error" ? "Error" : "Cargando"}
          </span>
        </div>
      </div>

      <div className="pc-body">
        <div className="pc-rail" role="toolbar" aria-label="Herramientas de dibujo">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-label={t.label}
              className={`pc-tool${tool === t.id ? " active" : ""}`}
              onClick={() => pickTool(t.id)}
            >
              {t.icon}
            </button>
          ))}
          <span className="pc-rail-sep" />
          <button
            type="button"
            title={layout.magnet ? "Imán activado" : "Imán desactivado"}
            aria-label="Imán"
            className={`pc-tool${layout.magnet ? " active" : ""}`}
            onClick={() => persist({ ...layoutRef.current, magnet: !layoutRef.current.magnet })}
          >
            {I("M6 3v8a6 6 0 0012 0V3M6 7h4M14 7h4")}
          </button>
          <button type="button" title="Borrar todos los dibujos" aria-label="Borrar dibujos" className="pc-tool" onClick={clearDrawings}>
            {I("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13")}
          </button>
        </div>

        <div className="pc-chart-area">
          <div ref={chartEl} className="pc-chart" style={{ fontFamily: FONT }} />
          {status !== "ok" && (
            <div className="pc-overlay-msg">
              {status === "offline" ? (
                <>
                  <b>El servidor de precios no está conectado</b>
                  <span>Es el MT5 de la VPS. En cuanto vuelva, el gráfico se actualiza solo.</span>
                </>
              ) : status === "error" ? (
                <>
                  <b>No se han podido cargar los precios</b>
                  <span>{errorText}</span>
                </>
              ) : (
                <>
                  <span className="pc-spinner" />
                  <span>{status === "pending" ? "Trayendo el histórico de MT5…" : "Cargando…"}</span>
                </>
              )}
            </div>
          )}
          <span className={`pc-saved ${saved}`}>{saved === "saving" ? "Guardando…" : saved === "saved" ? "Guardado ✓" : ""}</span>
        </div>
        {panel === "admin" && isAdmin && (
        <PineAdmin indicators={indList} onClose={() => setPanel(null)} onReload={reloadIndicators} onTest={testIndicator} onClearTest={clearTest} />
        )}
      </div>

      {panel === "symbols" && <SymbolSearch onPick={changeSymbol} onClose={() => setPanel(null)} />}
      {panel === "indicators" && ready && (
        <div className="pc-pop pc-pop-ind" role="dialog" aria-label="Indicadores">
          <div className="pc-pop-head">
            <b>Indicadores</b>
            <button type="button" className="pc-x" onClick={() => setPanel(null)} aria-label="Cerrar">
              ×
            </button>
          </div>
          {indList.length === 0 && (
            <div className="pc-empty">
              {isAdmin ? "Aún no hay indicadores. Créalos con el botón «Crear indicador»." : "Aún no hay indicadores disponibles."}
            </div>
          )}
          {indList.map((ind) => {
            const active = layout.ind.find((x) => x.id === ind.id);
            const st = indStatus[ind.id];
            return (
              <div key={ind.id} className={`pc-ind${active ? " on" : ""}`}>
                <div className="pc-ind-row">
                  <label className="pc-check">
                    <input type="checkbox" checked={!!active} onChange={() => toggleIndicator(ind.id)} />
                    <span>{ind.name}</span>
                  </label>
                  {active && st && st.inputs.length > 0 && (
                    <button
                      type="button"
                      className={`pc-gear${openInputs === ind.id ? " active" : ""}`}
                      title="Ajustes"
                      aria-label="Ajustes"
                      onClick={() => setOpenInputs(openInputs === ind.id ? null : ind.id)}
                    >
                      {I("M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z")}
                    </button>
                  )}
                </div>
                {ind.description && !active && <div className="pc-ind-desc">{ind.description}</div>}
                {active && st?.error && <div className="pc-ind-err">{st.error}</div>}
                {active && openInputs === ind.id && st && (
                  <InputsForm inputs={st.inputs} values={active.inputs} onChange={(k, v) => changeInput(ind.id, k, v)} onReset={() => resetInputs(ind.id)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InputsForm({
  inputs,
  values,
  onChange,
  onReset,
}: {
  inputs: PineInput[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
}) {
  return (
    <div className="pc-inputs">
      {inputs.map((inp) => {
        const v = values[inp.key] ?? inp.defval;
        return (
          <label key={inp.key} className="pc-inp">
            <span>{inp.title}</span>
            {inp.type === "bool" ? (
              <input type="checkbox" checked={v === true} onChange={(e) => onChange(inp.key, e.target.checked)} />
            ) : inp.type === "source" ? (
              <select value={v} onChange={(e) => onChange(inp.key, e.target.value)}>
                {["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "hlcc4", "volume"].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : inp.options && inp.options.length ? (
              <select value={v} onChange={(e) => onChange(inp.key, e.target.value)}>
                {inp.options.map((o) => (
                  <option key={String(o)} value={o}>
                    {String(o)}
                  </option>
                ))}
              </select>
            ) : inp.type === "color" ? (
              <input type="color" value={toHex(v)} onChange={(e) => onChange(inp.key, e.target.value)} />
            ) : inp.type === "int" || inp.type === "float" ? (
              <NumInput value={v} inp={inp} onCommit={(n) => onChange(inp.key, n)} />
            ) : (
              <TextInput value={String(v ?? "")} onCommit={(t) => onChange(inp.key, t)} />
            )}
          </label>
        );
      })}
      <button type="button" className="pc-reset" onClick={onReset}>
        Restablecer valores
      </button>
    </div>
  );
}

function NumInput({ value, inp, onCommit }: { value: any; inp: PineInput; onCommit: (n: number) => void }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  const commit = () => {
    let n = parseFloat(t.replace(",", "."));
    if (Number.isNaN(n)) return setT(String(value));
    if (inp.type === "int") n = Math.round(n);
    if (inp.min !== undefined) n = Math.max(inp.min, n);
    if (inp.max !== undefined) n = Math.min(inp.max, n);
    if (n !== value) onCommit(n);
    setT(String(n));
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      value={t}
      step={inp.step ?? (inp.type === "int" ? 1 : "any")}
      onChange={(e) => setT(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function TextInput({ value, onCommit }: { value: string; onCommit: (t: string) => void }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return (
    <input
      type="text"
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => t !== value && onCommit(t)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && t !== value) onCommit(t);
      }}
    />
  );
}

function toHex(c: any): string {
  if (typeof c !== "string") return "#9b30ff";
  if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7);
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  return "#9b30ff";
}

function SymbolSearch({ onPick, onClose }: { onPick: (s: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SymbolRow[] | null>(null);
  const [info, setInfo] = useState<{ online: boolean; ready: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/charts/symbols?q=${encodeURIComponent(q)}`, { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (json) {
        setRows(json.symbols);
        setInfo({ online: json.online, ready: json.ready });
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="pc-modal" role="dialog" aria-label="Buscar símbolo" onClick={onClose}>
      <div className="pc-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="pc-search">
          {I("M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3")}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar símbolo: XAUUSD, EURUSD, NAS100…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && rows?.[0]) onPick(rows[0].name);
              if (e.key === "Escape") onClose();
            }}
          />
          <button type="button" className="pc-x" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="pc-results">
          {rows === null && <div className="pc-empty">Buscando…</div>}
          {rows && rows.length === 0 && (
            <div className="pc-empty">
              {info && !info.ready ? "La lista de símbolos aún no ha llegado del servidor de precios." : "No hay ningún símbolo con ese nombre."}
            </div>
          )}
          {rows?.map((r) => (
            <button key={r.name} type="button" className="pc-row" onClick={() => onPick(r.name)}>
              <span className="pc-row-name">{r.name}</span>
              <span className="pc-row-desc">{r.description}</span>
              <span className="pc-row-path">{r.path.split("\\")[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
