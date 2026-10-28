// Indicadores Pine dentro del gráfico de VANTAX CHARTS (28/10/2026).
// Convierte la salida del intérprete (src/lib/pine) en un indicador de
// KLineChart y lo dibuja a mano: plots, hlines, fills, fondos, formas,
// cajas, líneas y etiquetas.

import type { KLineData } from "klinecharts";
import { PineBar, PineOutput, PineRuntime, sizePx, parseColor, tfBaseOf, aggregateBars } from "@/lib/pine/runtime";

const PALETTE = ["#C084FC", "#FFFFFF", "#F472B6", "#60A5FA", "#FBBF24", "#34D399", "#F87171", "#A78BFA"];
const FONT = "Sora, Inter, 'Segoe UI', system-ui, sans-serif";

export type PineCtx = { symbol: string; tf: string; digits: number };

export type PineDef = {
  id: string;
  name: string; // nombre del indicador en KLineChart
  code: string;
  inputs: Record<string, any>;
  getCtx: () => PineCtx;
  onResult: (info: { error: string | null; warnings: string[]; out: PineOutput | null }) => void;
};

// ---------------------------------------------------------------- velas de otras temporalidades
// (request.security): se piden al feed de MT5 y se guardan aquí.

type SecEntry = { bars: PineBar[] | null; error: boolean; loading: Promise<void> | null; liveAt: number };
const secCache = new Map<string, SecEntry>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Temporalidades compuestas (p. ej. 2 minutos): se construyen desde la del MT5
const aggCache = new Map<string, { src: PineBar[]; last: number; out: PineBar[] }>();
function baseKey(key: string): string {
  const [symbol, tf] = key.split("|");
  const b = tfBaseOf(tf);
  return b ? `${symbol}|${b.base}` : key;
}

function secGet(key: string): PineBar[] | null | "error" {
  const bk = baseKey(key);
  if (bk !== key) {
    const base = secGetNative(bk);
    if (!base || base === "error") return base;
    const lastC = base.length ? base[base.length - 1].c + base[base.length - 1].t : 0;
    const hit = aggCache.get(key);
    if (hit && hit.src.length === base.length && hit.last === lastC) return hit.out;
    const out = aggregateBars(base, key.split("|")[1]);
    aggCache.set(key, { src: base, last: lastC, out });
    return out;
  }
  return secGetNative(key);
}

function secGetNative(key: string): PineBar[] | null | "error" {
  const e = secCache.get(key);
  if (!e) return null;
  if (e.error) return "error";
  if (e.bars && Date.now() - e.liveAt > 2000) void secLive(key, e);
  return e.bars;
}

async function secLive(key: string, e: SecEntry) {
  e.liveAt = Date.now();
  const [symbol, tf] = key.split("|");
  const res = await fetch(`/api/charts/live?symbol=${encodeURIComponent(symbol)}&tf=${tf}`, { cache: "no-store" }).catch(() => null);
  const json = res ? await res.json().catch(() => null) : null;
  const live: PineBar[] = json?.bars ?? [];
  if (!e.bars || !live.length) return;
  const bars = e.bars.slice();
  for (const b of live) {
    const last = bars[bars.length - 1];
    if (!last || b.t > last.t) bars.push(b);
    else if (b.t === last.t) bars[bars.length - 1] = b;
  }
  e.bars = bars;
}

function secLoad(rawKey: string): Promise<void> {
  const key = baseKey(rawKey);
  let e = secCache.get(key);
  if (e?.bars || e?.error) return Promise.resolve();
  if (e?.loading) return e.loading;
  e = { bars: null, error: false, loading: null, liveAt: 0 };
  secCache.set(key, e);
  const entry = e;
  entry.loading = (async () => {
    const [symbol, tf] = key.split("|");
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`/api/charts/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}`, { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (json?.status === "ok") {
        entry.bars = json.bars;
        entry.liveAt = Date.now();
        break;
      }
      if (json?.status === "error") {
        entry.error = true;
        break;
      }
      await sleep(i < 10 ? 600 : 1200);
    }
    if (!entry.bars) entry.error = true;
    entry.loading = null;
  })();
  return entry.loading;
}

// Compila el código (lanza PineError si no es válido) y devuelve la plantilla
export function makePineTemplate(def: PineDef) {
  const rt = new PineRuntime(def.code); // errores de sintaxis: lanza aquí
  let last: PineOutput | null = null;
  let lastTimes: number[] = [];

  let firstResolve: ((r: { error: string | null; warnings: string[] }) => void) | null = null;
  const firstResult = new Promise<{ error: string | null; warnings: string[] }>((r) => (firstResolve = r));
  const report = (error: string | null, warnings: string[], out: PineOutput | null, final: boolean) => {
    def.onResult({ error, warnings, out });
    if (final && firstResolve) {
      firstResolve({ error, warnings });
      firstResolve = null;
    }
  };

  const runOn = async (dataList: KLineData[]): Promise<PineOutput | null> => {
    const c = def.getCtx();
    const bars = dataList.map((d) => ({ t: d.timestamp, o: d.open, h: d.high, l: d.low, c: d.close, v: d.volume ?? 0 }));
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const missing = new Set<string>();
        const t0 = performance.now();
        const out = rt.run(bars, { symbol: c.symbol, tf: c.tf, mintick: 10 ** -c.digits, inputs: def.inputs, secBars: (s, tf) => secGet(s + "|" + tf), missing });
        lastRunMs = performance.now() - t0;
        head.inputs = out.inputs;
        if (!missing.size) {
          report(null, out.warnings, out, bars.length > 0);
          return out;
        }
        // faltan velas de otra temporalidad: se piden y se vuelve a calcular
        report(null, [...out.warnings, "Cargando otras temporalidades…"], out, false);
        await Promise.all([...missing].map(secLoad));
      }
      report("No se han podido cargar las velas de otra temporalidad.", [], null, true);
      return null;
    } catch (e) {
      report((e as Error).message, [], null, true);
      return null;
    }
  };
  let lastRunMs = 0;
  let lastCalcAt = 0;
  let lastKey = "";
  let lastResult: Record<string, number>[] = [];

  // Figuras: una por plot (para el rango del eje y el tooltip) + hlines
  const dry = (() => {
    try {
      const bars = [];
      let p = 100;
      for (let i = 0; i < 60; i++) {
        const o = p;
        p = p * (1 + Math.sin(i / 5) * 0.01);
        bars.push({ t: Date.UTC(2024, 0, 1) + i * 3600_000, o, h: Math.max(o, p) + 0.5, l: Math.min(o, p) - 0.5, c: p, v: 1000 });
      }
      return new PineRuntime(def.code).run(bars, { symbol: "TEST", tf: "H1", mintick: 0.01, inputs: def.inputs });
    } catch {
      return null;
    }
  })();
  // Cabecera: de la prueba con datos sintéticos o, si falla, leída del código
  const head = dry
    ? { title: dry.title, overlay: dry.overlay, inputs: dry.inputs }
    : {
        title: /(?:indicator|study)\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(def.code)?.[1] ?? "Indicador",
        overlay: /overlay\s*=\s*true/.test(def.code),
        inputs: [] as PineOutput["inputs"],
      };
  const nPlots = dry?.plots.length ?? (def.code.match(/(^|[^.\w])plot\s*\(/g)?.length ?? 0);
  const nHlines = dry?.hlines.length ?? 0;
  const figures = [
    ...Array.from({ length: nPlots }, (_, i) => ({ key: `p${i}`, title: "", type: "line" })),
    ...Array.from({ length: nHlines }, (_, i) => ({ key: `h${i}`, title: "", type: "line" })),
  ];

  return {
    head,
    firstResult,
    template: {
      name: def.name,
      shortName: head.title,
      series: head.overlay ? ("price" as const) : ("normal" as const),
      precision: dry?.precision ?? undefined,
      figures,
      calc: async (dataList: KLineData[]) => {
        // Con datos en vivo se recalcula como mucho cada pocos segundos si el
        // indicador es pesado (solo cambia la última vela).
        const c = def.getCtx();
        const key = `${c.symbol}|${c.tf}|${dataList.length}|${dataList[0]?.timestamp ?? 0}`;
        // Recalcular un indicador solo porque se mueve la última vela: como
        // mucho cada 2 s, o más espaciado si el indicador es pesado.
        const minGap = Math.max(2000, lastRunMs * 15);
        if (key === lastKey && last && performance.now() - lastCalcAt < minGap) return lastResult;
        lastKey = key;
        lastCalcAt = performance.now();
        const out = await runOn(dataList);
        last = out;
        lastTimes = dataList.map((d) => d.timestamp);
        lastResult = dataList.map((_, i) => {
          const o: Record<string, number> = {};
          if (!out) return o;
          out.plots.forEach((p, k) => {
            if (!p.display || p.style === "plot.style_histogram" || p.style === "plot.style_columns" || p.style === "plot.style_area") {
              // también cuentan para el rango del eje
            }
            const v = p.values[i - p.offset];
            if (p.display && typeof v === "number" && !Number.isNaN(v)) o[`p${k}`] = v;
          });
          out.hlines.forEach((h, k) => {
            if (typeof h.price === "number" && !Number.isNaN(h.price)) o[`h${k}`] = h.price;
          });
          return o;
        });
        return lastResult;
      },
      draw: ({ ctx, chart, bounding, xAxis, yAxis }: any) => {
        if (last) drawPine(ctx, chart, bounding, xAxis, yAxis, last, lastTimes, head.overlay);
        return true;
      },
      createTooltipDataSource: ({ indicator, crosshair }: any) => {
        const i = crosshair?.dataIndex;
        const legends: { title: { text: string; color: string }; value: { text: string; color: string } }[] = [];
        if (last && typeof i === "number") {
          const prec = indicator.precision ?? 2;
          last.plots.forEach((p, k) => {
            if (!p.display) return;
            const v = p.values[i - p.offset];
            const col = plotColor(p.colors[i - p.offset], k) ?? PALETTE[k % PALETTE.length];
            legends.push({
              title: { text: `${p.title}: `, color: solid(col) },
              value: { text: typeof v === "number" && !Number.isNaN(v) ? v.toFixed(prec) : "—", color: solid(col) },
            });
          });
        }
        return { name: head.title, calcParamsText: "", features: [], legends };
      },
    },
  };
}

function solid(c: string): string {
  const p = parseColor(c);
  return p ? `rgb(${p.r},${p.g},${p.b})` : c;
}

function plotColor(c: string | null | undefined, k: number): string | null {
  if (c === null) return null;
  if (c === undefined || c === "__default") return PALETTE[k % PALETTE.length];
  return c;
}

const okNum = (v: any): v is number => typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v);

function dash(ctx: CanvasRenderingContext2D, style: string | undefined, w: number) {
  if (!style) return ctx.setLineDash([]);
  if (style.includes("dashed")) ctx.setLineDash([6 * Math.max(1, w / 1.5), 4 * Math.max(1, w / 1.5)]);
  else if (style.includes("dotted")) ctx.setLineDash([1.5 * w, 3 * w]);
  else ctx.setLineDash([]);
}

function drawPine(
  ctx: CanvasRenderingContext2D,
  chart: any,
  bounding: { width: number; height: number },
  xAxis: any,
  yAxis: any,
  out: PineOutput,
  times: number[],
  overlay: boolean
) {
  const n = times.length;
  if (!n) return;
  const range = chart.getVisibleRange();
  const from = Math.max(0, range.from - 2);
  const to = Math.min(n - 1, range.to + 1);
  const space = chart.getBarSpace();
  const X = (i: number) => xAxis.convertToPixel(i);
  const Y = (v: number) => yAxis.convertToPixel(v);
  const dataList = chart.getDataList();
  const W = bounding.width;
  const H = bounding.height;

  const step = n > 1 ? times[n - 1] - times[n - 2] : 60000;
  const timeToIndex = (t: number) => {
    if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / step;
    if (t <= times[0]) return (t - times[0]) / step;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const xOf = (x: number, xloc: string) => X(xloc === "xloc.bar_time" ? timeToIndex(x) : x);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // 1) fondos
  for (let i = from; i <= to; i++) {
    const c = out.bgcolors[i];
    if (!c) continue;
    ctx.fillStyle = c;
    const x = X(i);
    ctx.fillRect(Math.floor(x - space.halfGapBar), 0, Math.ceil(space.gapBar) + 1, H);
  }

  // 2) fills entre plots / hlines
  const seriesOf = (ref: { kind: "plot" | "hline"; idx: number }, i: number): number => {
    if (ref.kind === "hline") return out.hlines[ref.idx]?.price ?? NaN;
    const p = out.plots[ref.idx];
    return p ? p.values[i - p.offset] : NaN;
  };
  for (const f of out.fills) {
    for (let i = from; i < to; i++) {
      const c = f.colors[i];
      if (!c) continue;
      const a0 = seriesOf(f.a, i);
      const a1 = seriesOf(f.a, i + 1);
      const b0 = seriesOf(f.b, i);
      const b1 = seriesOf(f.b, i + 1);
      if (f.a.kind === "hline" && f.b.kind === "hline") {
        if (!okNum(a0) || !okNum(b0)) continue;
        ctx.fillStyle = c;
        const y0 = Y(a0);
        const y1 = Y(b0);
        ctx.fillRect(X(i) - space.halfGapBar, Math.min(y0, y1), space.gapBar + 1, Math.abs(y1 - y0));
        continue;
      }
      if (!okNum(a0) || !okNum(a1) || !okNum(b0) || !okNum(b1)) continue;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(X(i), Y(a0));
      ctx.lineTo(X(i + 1), Y(a1));
      ctx.lineTo(X(i + 1), Y(b1));
      ctx.lineTo(X(i), Y(b0));
      ctx.closePath();
      ctx.fill();
    }
  }

  // 3) hlines
  out.hlines.forEach((h) => {
    if (!okNum(h.price)) return;
    const y = Math.round(Y(h.price)) + 0.5;
    ctx.strokeStyle = h.color || "#787B86";
    ctx.lineWidth = h.linewidth || 1;
    dash(ctx, h.linestyle, h.linewidth || 1);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 4) plots
  out.plots.forEach((p, k) => {
    if (!p.display) return;
    const val = (i: number) => p.values[i - p.offset];
    const col = (i: number) => plotColor(p.colors[i - p.offset], k);
    const lw = Math.max(1, p.linewidth);
    const style = p.style;
    if (style === "plot.style_histogram" || style === "plot.style_columns") {
      const base = Y(p.histbase || 0);
      for (let i = from; i <= to; i++) {
        const v = val(i);
        const c = col(i);
        if (!okNum(v) || !c) continue;
        const x = X(i);
        const y = Y(v);
        ctx.fillStyle = c;
        if (style === "plot.style_columns") {
          const w = Math.max(1, space.bar);
          ctx.fillRect(x - w / 2, Math.min(y, base), w, Math.max(1, Math.abs(base - y)));
        } else {
          ctx.fillRect(x - lw / 2, Math.min(y, base), lw, Math.max(1, Math.abs(base - y)));
        }
      }
      return;
    }
    if (style === "plot.style_circles" || style === "plot.style_cross") {
      for (let i = from; i <= to; i++) {
        const v = val(i);
        const c = col(i);
        if (!okNum(v) || !c) continue;
        const x = X(i);
        const y = Y(v);
        if (style === "plot.style_circles") {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, y, lw + 1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = c;
          ctx.lineWidth = Math.max(1, lw / 2);
          const r = lw + 2;
          ctx.beginPath();
          ctx.moveTo(x - r, y);
          ctx.lineTo(x + r, y);
          ctx.moveTo(x, y - r);
          ctx.lineTo(x, y + r);
          ctx.stroke();
        }
      }
      return;
    }
    const isArea = style === "plot.style_area" || style === "plot.style_areabr";
    const isStep = style === "plot.style_stepline" || style === "plot.style_stepline_diamond" || style === "plot.style_steplinebr";
    if (isArea) {
      const base = Y(p.histbase || 0);
      for (let i = from; i < to; i++) {
        const a = val(i);
        const b = val(i + 1);
        const c = col(i);
        if (!okNum(a) || !okNum(b) || !c) continue;
        const pc = parseColor(c);
        ctx.fillStyle = pc ? `rgba(${pc.r},${pc.g},${pc.b},${pc.a * 0.25})` : c;
        ctx.beginPath();
        ctx.moveTo(X(i), Y(a));
        ctx.lineTo(X(i + 1), Y(b));
        ctx.lineTo(X(i + 1), base);
        ctx.lineTo(X(i), base);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.lineWidth = lw;
    for (let i = from; i < to; i++) {
      const a = val(i);
      const b = val(i + 1);
      const c = col(i + 1);
      if (!okNum(a) || !okNum(b) || !c) continue;
      ctx.strokeStyle = c;
      ctx.beginPath();
      const x0 = X(i);
      const x1 = X(i + 1);
      ctx.moveTo(x0, Y(a));
      if (isStep) {
        ctx.lineTo(x1, Y(a));
        ctx.lineTo(x1, Y(b));
      } else ctx.lineTo(x1, Y(b));
      ctx.stroke();
    }
    // punto suelto (valor sin vecinos)
    for (let i = from; i <= to; i++) {
      const v = val(i);
      const c = col(i);
      if (!okNum(v) || !c) continue;
      if (!okNum(val(i - 1)) && !okNum(val(i + 1))) {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(X(i) - space.halfBar, Y(v));
        ctx.lineTo(X(i) + space.halfBar, Y(v));
        ctx.stroke();
      }
    }
  });

  // 5) formas (plotshape / plotchar / plotarrow)
  for (const s of out.shapes) {
    const sz = s.kind === "char" ? sizePx(s.size) + 2 : sizePx(s.size);
    for (let i = from; i <= to; i++) {
      const src = i - s.offset;
      const on = s.on[src];
      if (on === null || on === undefined) continue;
      const c = s.colors[src];
      if (!c) continue;
      const x = X(i);
      const bar = dataList[i];
      let y: number;
      let below = false;
      const pad = 6;
      if (s.kind === "arrow") {
        below = on > 0;
        y = overlay && bar ? (below ? Y(bar.low) + pad : Y(bar.high) - pad) : below ? H - pad : pad;
        drawShape(ctx, below ? "shape.arrowup" : "shape.arrowdown", x, y + (below ? sz / 2 : -sz / 2), sz, c);
        continue;
      }
      switch (s.location) {
        case "location.belowbar":
          below = true;
          y = overlay && bar ? Y(bar.low) + pad + sz / 2 : H - pad - sz / 2;
          break;
        case "location.top":
          y = pad + sz / 2;
          break;
        case "location.bottom":
          below = true;
          y = H - pad - sz / 2;
          break;
        case "location.absolute":
          y = Y(on);
          break;
        default:
          y = overlay && bar ? Y(bar.high) - pad - sz / 2 : pad + sz / 2;
      }
      if (s.kind === "char") {
        ctx.fillStyle = c;
        ctx.font = `${sz}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.char || "★", x, y);
      } else drawShape(ctx, s.style, x, y, sz, c);
      const t = s.texts[src];
      if (t) {
        ctx.fillStyle = s.textcolors[src] || c;
        ctx.font = `600 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = below ? "top" : "bottom";
        const lines = t.split("\n");
        lines.forEach((ln, li) => {
          const off = below ? sz / 2 + 3 + li * 13 : -(sz / 2 + 3) - (lines.length - 1 - li) * 13;
          ctx.fillText(ln, x, y + off);
        });
      }
    }
  }

  // 6) dibujos: cajas, líneas, rellenos entre líneas y etiquetas
  const ordered = out.drawings.slice().sort((a, b) => order(a) - order(b) || a.seq - b.seq);
  for (const d of ordered) {
    if (d.type === "box") drawBox(ctx, d, xOf, Y, W);
    else if (d.type === "linefill") drawLinefill(ctx, d, xOf, Y);
    else if (d.type === "line") drawLine(ctx, d, xOf, Y, W);
  }
  for (const d of ordered) if (d.type === "label") drawLabel(ctx, d, xOf, Y, dataList, timeToIndex);

  ctx.restore();
}

function order(d: any) {
  return d.type === "box" ? 0 : d.type === "linefill" ? 1 : d.type === "line" ? 2 : 3;
}

function drawShape(ctx: CanvasRenderingContext2D, style: string, x: number, y: number, sz: number, c: string) {
  const r = sz / 2;
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(1.5, sz / 7);
  ctx.beginPath();
  switch (style) {
    case "shape.triangleup":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      ctx.fill();
      return;
    case "shape.triangledown":
      ctx.moveTo(x, y + r);
      ctx.lineTo(x + r, y - r * 0.8);
      ctx.lineTo(x - r, y - r * 0.8);
      ctx.closePath();
      ctx.fill();
      return;
    case "shape.arrowup":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x + r * 0.3, y);
      ctx.lineTo(x + r * 0.3, y + r);
      ctx.lineTo(x - r * 0.3, y + r);
      ctx.lineTo(x - r * 0.3, y);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
      ctx.fill();
      return;
    case "shape.arrowdown":
      ctx.moveTo(x, y + r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x + r * 0.3, y);
      ctx.lineTo(x + r * 0.3, y - r);
      ctx.lineTo(x - r * 0.3, y - r);
      ctx.lineTo(x - r * 0.3, y);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
      ctx.fill();
      return;
    case "shape.circle":
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "shape.square":
      ctx.fillRect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
      return;
    case "shape.diamond":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
      ctx.fill();
      return;
    case "shape.cross":
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      return;
    case "shape.flag":
      ctx.moveTo(x - r * 0.6, y + r);
      ctx.lineTo(x - r * 0.6, y - r);
      ctx.lineTo(x + r * 0.8, y - r * 0.5);
      ctx.lineTo(x - r * 0.6, y);
      ctx.closePath();
      ctx.fill();
      return;
    case "shape.labelup":
    case "shape.labeldown": {
      const up = style === "shape.labelup";
      roundRect(ctx, x - r * 1.2, y - r * 0.7, r * 2.4, r * 1.4, 3);
      ctx.fill();
      ctx.beginPath();
      if (up) {
        ctx.moveTo(x - 4, y - r * 0.7);
        ctx.lineTo(x, y - r * 0.7 - 5);
        ctx.lineTo(x + 4, y - r * 0.7);
      } else {
        ctx.moveTo(x - 4, y + r * 0.7);
        ctx.lineTo(x, y + r * 0.7 + 5);
        ctx.lineTo(x + 4, y + r * 0.7);
      }
      ctx.fill();
      return;
    }
    default:
      // xcross
      ctx.moveTo(x - r * 0.7, y - r * 0.7);
      ctx.lineTo(x + r * 0.7, y + r * 0.7);
      ctx.moveTo(x + r * 0.7, y - r * 0.7);
      ctx.lineTo(x - r * 0.7, y + r * 0.7);
      ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBox(ctx: CanvasRenderingContext2D, d: any, xOf: (x: number, l: string) => number, Y: (v: number) => number, W: number) {
  if (![d.left, d.right, d.top, d.bottom].every(okNum)) return;
  let x0 = xOf(d.left, d.xloc);
  let x1 = xOf(d.right, d.xloc);
  if (d.extend === "extend.right" || d.extend === "extend.both") x1 = W;
  if (d.extend === "extend.left" || d.extend === "extend.both") x0 = 0;
  const y0 = Y(d.top);
  const y1 = Y(d.bottom);
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (d.bgcolor && typeof d.bgcolor === "string") {
    ctx.fillStyle = d.bgcolor;
    ctx.fillRect(x, y, w, h);
  }
  if (d.border_color && typeof d.border_color === "string" && d.border_width > 0) {
    ctx.strokeStyle = d.border_color;
    ctx.lineWidth = d.border_width;
    dash(ctx, d.border_style, d.border_width);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
  }
  if (d.text) {
    ctx.fillStyle = typeof d.text_color === "string" ? d.text_color : "#fff";
    ctx.font = `500 ${sizePx(d.text_size === "size.auto" ? "size.small" : d.text_size)}px ${FONT}`;
    const ha = d.text_halign ?? "text.align_center";
    const va = d.text_valign ?? "text.align_center";
    ctx.textAlign = ha.endsWith("left") ? "left" : ha.endsWith("right") ? "right" : "center";
    ctx.textBaseline = va.endsWith("top") ? "top" : va.endsWith("bottom") ? "bottom" : "middle";
    const tx = ctx.textAlign === "left" ? x + 4 : ctx.textAlign === "right" ? x + w - 4 : x + w / 2;
    const ty = ctx.textBaseline === "top" ? y + 3 : ctx.textBaseline === "bottom" ? y + h - 3 : y + h / 2;
    ctx.fillText(String(d.text), tx, ty);
  }
}

function lineEnds(d: any, xOf: (x: number, l: string) => number, Y: (v: number) => number, W: number) {
  if (![d.x1, d.x2, d.y1, d.y2].every(okNum)) return null;
  let ax = xOf(d.x1, d.xloc);
  let ay = Y(d.y1);
  let bx = xOf(d.x2, d.xloc);
  let by = Y(d.y2);
  const ext = d.extend as string;
  if (ext && ext !== "extend.none" && bx !== ax) {
    const m = (by - ay) / (bx - ax);
    if (ext === "extend.right" || ext === "extend.both") {
      const tx = bx >= ax ? W : 0;
      by = by + m * (tx - bx);
      bx = tx;
    }
    if (ext === "extend.left" || ext === "extend.both") {
      const tx = ax <= bx ? 0 : W;
      ay = ay + m * (tx - ax);
      ax = tx;
    }
  } else if (ext && ext !== "extend.none" && bx === ax) {
    ay = 0;
    by = 99999;
  }
  return { ax, ay, bx, by };
}

function drawLine(ctx: CanvasRenderingContext2D, d: any, xOf: (x: number, l: string) => number, Y: (v: number) => number, W: number) {
  if (!d.color || typeof d.color !== "string") return;
  const e = lineEnds(d, xOf, Y, W);
  if (!e) return;
  const w = d.width || 1;
  ctx.strokeStyle = d.color;
  ctx.fillStyle = d.color;
  ctx.lineWidth = w;
  dash(ctx, d.style, w);
  ctx.beginPath();
  ctx.moveTo(e.ax, e.ay);
  ctx.lineTo(e.bx, e.by);
  ctx.stroke();
  ctx.setLineDash([]);
  const arrow = (fx: number, fy: number, tx: number, ty: number) => {
    const ang = Math.atan2(ty - fy, tx - fx);
    const L = 8 + w * 2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - L * Math.cos(ang - 0.45), ty - L * Math.sin(ang - 0.45));
    ctx.lineTo(tx - L * Math.cos(ang + 0.45), ty - L * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  };
  if (d.style === "line.style_arrow_right" || d.style === "line.style_arrow_both") arrow(e.ax, e.ay, e.bx, e.by);
  if (d.style === "line.style_arrow_left" || d.style === "line.style_arrow_both") arrow(e.bx, e.by, e.ax, e.ay);
}

function drawLinefill(ctx: CanvasRenderingContext2D, d: any, xOf: (x: number, l: string) => number, Y: (v: number) => number) {
  const a = d.line1;
  const b = d.line2;
  if (!a || !b || a.deleted || b.deleted || typeof d.color !== "string") return;
  const ea = lineEnds(a, xOf, Y, 1e5);
  const eb = lineEnds(b, xOf, Y, 1e5);
  if (!ea || !eb) return;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(ea.ax, ea.ay);
  ctx.lineTo(ea.bx, ea.by);
  ctx.lineTo(eb.bx, eb.by);
  ctx.lineTo(eb.ax, eb.ay);
  ctx.closePath();
  ctx.fill();
}

function drawLabel(ctx: CanvasRenderingContext2D, d: any, xOf: (x: number, l: string) => number, Y: (v: number) => number, dataList: KLineData[], timeToIndex: (t: number) => number) {
  if (!okNum(d.x)) return;
  const x = xOf(d.x, d.xloc);
  let y: number;
  const idx = Math.round(d.xloc === "xloc.bar_time" ? timeToIndex(d.x) : d.x);
  const bar = dataList[idx];
  if (d.yloc === "yloc.abovebar" && bar) y = Y(bar.high) - 4;
  else if (d.yloc === "yloc.belowbar" && bar) y = Y(bar.low) + 4;
  else if (okNum(d.y)) y = Y(d.y);
  else return;
  const text = String(d.text ?? "");
  const fs = sizePx(d.size === "size.auto" ? "size.small" : d.size);
  ctx.font = `600 ${fs}px ${FONT}`;
  const lines = text.split("\n");
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
  const th = lines.length * (fs + 3);
  const style: string = d.style ?? "label.style_label_down";
  const bg = typeof d.color === "string" ? d.color : null;
  const fg = typeof d.textcolor === "string" ? d.textcolor : "#fff";
  const padX = 6;
  const padY = 4;
  const bw = tw + padX * 2;
  const bh = th + padY * 2;
  let bx = x - bw / 2;
  let by = y - bh - 6;
  let pointer: "down" | "up" | "left" | "right" | null = "down";
  switch (style) {
    case "label.style_label_up":
      by = y + 6;
      pointer = "up";
      break;
    case "label.style_label_left":
      bx = x + 6;
      by = y - bh / 2;
      pointer = "left";
      break;
    case "label.style_label_right":
      bx = x - bw - 6;
      by = y - bh / 2;
      pointer = "right";
      break;
    case "label.style_label_center":
    case "label.style_none":
    case "label.style_text_outline":
      by = y - bh / 2;
      pointer = null;
      break;
    case "label.style_label_lower_left":
      bx = x;
      by = y;
      pointer = null;
      break;
    case "label.style_label_lower_right":
      bx = x - bw;
      by = y;
      pointer = null;
      break;
    case "label.style_label_upper_left":
      bx = x;
      by = y - bh;
      pointer = null;
      break;
    case "label.style_label_upper_right":
      bx = x - bw;
      by = y - bh;
      pointer = null;
      break;
    default:
      if (style.startsWith("label.style_") && !style.includes("label_")) {
        // formas: triangleup, circle, xcross...
        if (bg) drawShape(ctx, style.replace("label.style_", "shape."), x, y, 10, bg);
        if (text) {
          ctx.fillStyle = fg;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(text, x, y - 8);
        }
        return;
      }
  }
  if (bg && style !== "label.style_none") {
    ctx.fillStyle = bg;
    roundRect(ctx, bx, by, bw, bh, 4);
    ctx.fill();
    ctx.beginPath();
    if (pointer === "down") {
      ctx.moveTo(x - 5, by + bh);
      ctx.lineTo(x, by + bh + 6);
      ctx.lineTo(x + 5, by + bh);
    } else if (pointer === "up") {
      ctx.moveTo(x - 5, by);
      ctx.lineTo(x, by - 6);
      ctx.lineTo(x + 5, by);
    } else if (pointer === "left") {
      ctx.moveTo(bx, y - 5);
      ctx.lineTo(bx - 6, y);
      ctx.lineTo(bx, y + 5);
    } else if (pointer === "right") {
      ctx.moveTo(bx + bw, y - 5);
      ctx.lineTo(bx + bw + 6, y);
      ctx.lineTo(bx + bw, y + 5);
    }
    ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + padY + i * (fs + 3)));
}
