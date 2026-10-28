// Intérprete de Pine Script para VANTAX CHARTS — funciones ta.* y math.sum.
// Cada llamada a ta.* tiene su propio estado (como en Pine): guarda el
// histórico de sus entradas y solo avanza en las velas en que se ejecuta.

export const isNa = (v: any) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
const NA = NaN;

export type St = Record<string, any> & { _bar?: number };

// Avanza el estado a la vela actual. Devuelve true si es una vela nueva.
function step(st: St, bar: number): boolean {
  if (st._bar === bar) return false;
  st._bar = bar;
  return true;
}

// Histórico de una entrada dentro del estado (una entrada por vela ejecutada).
function hist(st: St, name: string, v: any, isNew: boolean): any[] {
  let h = st[name] as any[] | undefined;
  if (!h) h = st[name] = [];
  if (isNew || !h.length) h.push(v);
  else h[h.length - 1] = v;
  if (h.length > 6000) h.splice(0, h.length - 5000);
  return h;
}

// Valor "anterior" de una variable recursiva (EMA, RMA...): el de la vela previa.
function recur(st: St, name: string, isNew: boolean): any {
  const k = "_r_" + name;
  const p = "_p_" + name;
  if (isNew) st[p] = st[k];
  return st[p];
}
function setRecur(st: St, name: string, v: any) {
  st["_r_" + name] = v;
}

function last(h: any[], n: number, back = 0): any[] {
  const end = h.length - back;
  return h.slice(Math.max(0, end - n), end);
}

function smaOf(h: any[], len: number): number {
  if (h.length < len) return NA;
  let s = 0;
  for (let i = h.length - len; i < h.length; i++) {
    const v = h[i];
    if (isNa(v)) return NA;
    s += v;
  }
  return s / len;
}

function stdevOf(h: any[], len: number, biased = true): number {
  const m = smaOf(h, len);
  if (isNa(m)) return NA;
  let s = 0;
  for (let i = h.length - len; i < h.length; i++) s += (h[i] - m) ** 2;
  return Math.sqrt(s / (biased ? len : len - 1));
}

type Ctx = {
  bar: number;
  high: (i: number) => number;
  low: (i: number) => number;
  close: (i: number) => number;
  open: (i: number) => number;
  volume: (i: number) => number;
  time: (i: number) => number;
  dayKey: (i: number) => string;
};

// ----- funciones con fuente arbitraria

export const TA: Record<string, { params: string[]; fn: (st: St, a: any[], c: Ctx) => any }> = {
  "ta.sma": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => smaOf(hist(st, "s", src, step(st, c.bar)), Math.max(1, Math.round(len))),
  },
  "ta.ema": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const n = step(st, c.bar);
      const h = hist(st, "s", src, n);
      const L = Math.max(1, Math.round(len));
      const prev = recur(st, "e", n);
      let v: number;
      if (isNa(src)) v = prev ?? NA;
      else if (isNa(prev)) v = h.length >= L ? smaOf(h, L) : NA;
      else {
        const a = 2 / (L + 1);
        v = a * src + (1 - a) * prev;
      }
      setRecur(st, "e", v);
      return v;
    },
  },
  "ta.rma": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => rma(st, "r", src, len, c.bar),
  },
  "ta.wma": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => wmaOf(hist(st, "s", src, step(st, c.bar)), Math.round(len)),
  },
  "ta.vwma": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const n = step(st, c.bar);
      const L = Math.round(len);
      const pv = hist(st, "pv", src * c.volume(c.bar), n);
      const v = hist(st, "v", c.volume(c.bar), n);
      const a = smaOf(pv, L);
      const b = smaOf(v, L);
      return b ? a / b : NA;
    },
  },
  "ta.hma": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const n = step(st, c.bar);
      const L = Math.round(len);
      const h = hist(st, "s", src, n);
      const a = wmaOf(h, Math.max(1, Math.floor(L / 2)));
      const b = wmaOf(h, L);
      const d = hist(st, "d", 2 * a - b, n);
      return wmaOf(d, Math.max(1, Math.floor(Math.sqrt(L))));
    },
  },
  "ta.swma": {
    params: ["source"],
    fn: (st, [src], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      if (h.length < 4) return NA;
      const x = last(h, 4);
      return x[0] / 6 + (x[1] * 2) / 6 + (x[2] * 2) / 6 + x[3] / 6;
    },
  },
  "ta.alma": {
    params: ["series", "length", "offset", "sigma", "floor"],
    fn: (st, [src, len, offset = 0.85, sigma = 6], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length < L) return NA;
      const m = offset * (L - 1);
      const s = L / sigma;
      let norm = 0;
      let sum = 0;
      for (let i = 0; i < L; i++) {
        const w = Math.exp(-((i - m) ** 2) / (2 * s * s));
        norm += w;
        sum += w * h[h.length - L + i];
      }
      return sum / norm;
    },
  },
  "ta.rsi": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const n = step(st, c.bar);
      const h = hist(st, "s", src, n);
      const ch = h.length > 1 ? h[h.length - 1] - h[h.length - 2] : NA;
      const up = rma(st, "u", isNa(ch) ? NA : Math.max(ch, 0), len, c.bar, n);
      const dn = rma(st, "d", isNa(ch) ? NA : Math.max(-ch, 0), len, c.bar, n);
      if (isNa(up) || isNa(dn)) return NA;
      if (dn === 0) return 100;
      if (up === 0) return 0;
      return 100 - 100 / (1 + up / dn);
    },
  },
  "ta.stdev": {
    params: ["source", "length", "biased"],
    fn: (st, [src, len, biased = true], c) => stdevOf(hist(st, "s", src, step(st, c.bar)), Math.round(len), biased),
  },
  "ta.variance": {
    params: ["source", "length", "biased"],
    fn: (st, [src, len, biased = true], c) => {
      const v = stdevOf(hist(st, "s", src, step(st, c.bar)), Math.round(len), biased);
      return v * v;
    },
  },
  "ta.dev": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      const m = smaOf(h, L);
      if (isNa(m)) return NA;
      let s = 0;
      for (let i = h.length - L; i < h.length; i++) s += Math.abs(h[i] - m);
      return s / L;
    },
  },
  "ta.highest": {
    params: ["source", "length"],
    fn: (st, a, c) => extreme(st, a, c, "high", Math.max),
  },
  "ta.lowest": {
    params: ["source", "length"],
    fn: (st, a, c) => extreme(st, a, c, "low", Math.min),
  },
  "ta.highestbars": {
    params: ["source", "length"],
    fn: (st, a, c) => extremeBars(st, a, c, "high", (x, y) => x > y),
  },
  "ta.lowestbars": {
    params: ["source", "length"],
    fn: (st, a, c) => extremeBars(st, a, c, "low", (x, y) => x < y),
  },
  "ta.change": {
    params: ["source", "length"],
    fn: (st, [src, len = 1], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length <= L) return typeof src === "boolean" ? false : NA;
      const prev = h[h.length - 1 - L];
      if (typeof src === "boolean") return src !== prev;
      return src - prev;
    },
  },
  "ta.mom": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      return h.length > L ? src - h[h.length - 1 - L] : NA;
    },
  },
  "ta.roc": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length <= L) return NA;
      const p = h[h.length - 1 - L];
      return p ? (100 * (src - p)) / p : NA;
    },
  },
  "ta.crossover": {
    params: ["source1", "source2"],
    fn: (st, [a, b], c) => {
      const n = step(st, c.bar);
      const ha = hist(st, "a", a, n);
      const hb = hist(st, "b", b, n);
      if (ha.length < 2) return false;
      return a > b && ha[ha.length - 2] <= hb[hb.length - 2];
    },
  },
  "ta.crossunder": {
    params: ["source1", "source2"],
    fn: (st, [a, b], c) => {
      const n = step(st, c.bar);
      const ha = hist(st, "a", a, n);
      const hb = hist(st, "b", b, n);
      if (ha.length < 2) return false;
      return a < b && ha[ha.length - 2] >= hb[hb.length - 2];
    },
  },
  "ta.cross": {
    params: ["source1", "source2"],
    fn: (st, [a, b], c) => {
      const n = step(st, c.bar);
      const ha = hist(st, "a", a, n);
      const hb = hist(st, "b", b, n);
      if (ha.length < 2) return false;
      const p = ha[ha.length - 2] - hb[hb.length - 2];
      const q = a - b;
      return (p <= 0 && q > 0) || (p >= 0 && q < 0);
    },
  },
  "ta.cum": {
    params: ["source"],
    fn: (st, [src], c) => {
      const n = step(st, c.bar);
      const prev = recur(st, "c", n) ?? 0;
      const v = prev + (isNa(src) ? 0 : src);
      setRecur(st, "c", v);
      return v;
    },
  },
  "ta.rising": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length <= L) return false;
      for (let i = 1; i <= L; i++) if (!(src > h[h.length - 1 - i])) return false;
      return true;
    },
  },
  "ta.falling": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length <= L) return false;
      for (let i = 1; i <= L; i++) if (!(src < h[h.length - 1 - i])) return false;
      return true;
    },
  },
  "ta.median": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length < L) return NA;
      const x = last(h, L).sort((p, q) => p - q);
      return L % 2 ? x[(L - 1) / 2] : (x[L / 2 - 1] + x[L / 2]) / 2;
    },
  },
  "ta.percentrank": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length <= L) return NA;
      let cnt = 0;
      for (let i = h.length - 1 - L; i < h.length - 1; i++) if (h[i] <= src) cnt++;
      return (100 * cnt) / L;
    },
  },
  "ta.linreg": {
    params: ["source", "length", "offset"],
    fn: (st, [src, len, off = 0], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      if (h.length < L) return NA;
      const y = last(h, L);
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (let i = 0; i < L; i++) {
        sx += i;
        sy += y[i];
        sxy += i * y[i];
        sxx += i * i;
      }
      const slope = (L * sxy - sx * sy) / (L * sxx - sx * sx);
      const inter = (sy - slope * sx) / L;
      return inter + slope * (L - 1 - off);
    },
  },
  "ta.correlation": {
    params: ["source1", "source2", "length"],
    fn: (st, [a, b, len], c) => {
      const n = step(st, c.bar);
      const ha = hist(st, "a", a, n);
      const hb = hist(st, "b", b, n);
      const L = Math.round(len);
      if (ha.length < L) return NA;
      const x = last(ha, L);
      const y = last(hb, L);
      const mx = x.reduce((s, v) => s + v, 0) / L;
      const my = y.reduce((s, v) => s + v, 0) / L;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < L; i++) {
        num += (x[i] - mx) * (y[i] - my);
        dx += (x[i] - mx) ** 2;
        dy += (y[i] - my) ** 2;
      }
      return num / Math.sqrt(dx * dy);
    },
  },
  "ta.valuewhen": {
    params: ["condition", "source", "occurrence"],
    fn: (st, [cond, src, occ = 0], c) => {
      const n = step(st, c.bar);
      const vals = (st.vals ??= []) as any[];
      if (!n && st._lastPushed) vals.pop();
      st._lastPushed = false;
      if (cond === true || (typeof cond === "number" && cond && !Number.isNaN(cond))) {
        vals.push(src);
        st._lastPushed = true;
        if (vals.length > 500) vals.shift();
      }
      const i = vals.length - 1 - Math.round(occ);
      return i >= 0 ? vals[i] : NA;
    },
  },
  "ta.barssince": {
    params: ["condition"],
    fn: (st, [cond], c) => {
      const n = step(st, c.bar);
      if (n) st.prevLast = st.lastTrue;
      else st.lastTrue = st.prevLast;
      if (cond === true || (typeof cond === "number" && cond && !Number.isNaN(cond))) st.lastTrue = c.bar;
      return st.lastTrue === undefined ? NA : c.bar - st.lastTrue;
    },
  },
  "ta.pivothigh": {
    params: ["source", "leftbars", "rightbars"],
    fn: (st, a, c) => pivot(st, a, c, "high", (x, y) => x > y, (x, y) => x >= y),
  },
  "ta.pivotlow": {
    params: ["source", "leftbars", "rightbars"],
    fn: (st, a, c) => pivot(st, a, c, "low", (x, y) => x < y, (x, y) => x <= y),
  },
  "ta.atr": {
    params: ["length"],
    fn: (st, [len], c) => rma(st, "a", trAt(c, c.bar, true), len, c.bar),
  },
  "ta.tr": {
    params: ["handle_na"],
    fn: (_st, [handleNa = false], c) => trAt(c, c.bar, handleNa),
  },
  "ta.macd": {
    params: ["source", "fastlen", "slowlen", "siglen"],
    fn: (st, [src, f, s, sig], c) => {
      const n = step(st, c.bar);
      const fast = emaIn(st, "f", src, f, n);
      const slow = emaIn(st, "s", src, s, n);
      const macd = fast - slow;
      const signal = emaIn(st, "g", macd, sig, n);
      return tuple([macd, signal, macd - signal]);
    },
  },
  "ta.bb": {
    params: ["series", "length", "mult"],
    fn: (st, [src, len, mult], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      const m = smaOf(h, L);
      const d = stdevOf(h, L) * mult;
      return tuple([m, m + d, m - d]);
    },
  },
  "ta.bbw": {
    params: ["series", "length", "mult"],
    fn: (st, [src, len, mult], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      const m = smaOf(h, L);
      const d = stdevOf(h, L) * mult;
      return m ? (2 * d) / m * 100 : NA;
    },
  },
  "ta.kc": {
    params: ["series", "length", "mult", "useTrueRange"],
    fn: (st, [src, len, mult, useTr = true], c) => {
      const n = step(st, c.bar);
      const mid = emaIn(st, "m", src, len, n);
      const rng = useTr ? trAt(c, c.bar, true) : c.high(c.bar) - c.low(c.bar);
      const r = emaIn(st, "r", rng, len, n);
      return tuple([mid, mid + r * mult, mid - r * mult]);
    },
  },
  "ta.stoch": {
    params: ["source", "high", "low", "length"],
    fn: (st, [src, hi, lo, len], c) => {
      const n = step(st, c.bar);
      const L = Math.round(len);
      const hh = hist(st, "h", hi, n);
      const ll = hist(st, "l", lo, n);
      if (hh.length < L) return NA;
      const mx = Math.max(...last(hh, L));
      const mn = Math.min(...last(ll, L));
      return mx === mn ? NA : (100 * (src - mn)) / (mx - mn);
    },
  },
  "ta.cci": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const h = hist(st, "s", src, step(st, c.bar));
      const L = Math.round(len);
      const m = smaOf(h, L);
      if (isNa(m)) return NA;
      let s = 0;
      for (let i = h.length - L; i < h.length; i++) s += Math.abs(h[i] - m);
      const d = s / L;
      return d ? (src - m) / (0.015 * d) : 0;
    },
  },
  "ta.mfi": {
    params: ["series", "length"],
    fn: (st, [src, len], c) => {
      const n = step(st, c.bar);
      const h = hist(st, "s", src, n);
      const ch = h.length > 1 ? src - h[h.length - 2] : NA;
      const vol = c.volume(c.bar);
      const up = hist(st, "u", isNa(ch) ? NA : ch > 0 ? vol * src : 0, n);
      const dn = hist(st, "d", isNa(ch) ? NA : ch < 0 ? vol * src : 0, n);
      const L = Math.round(len);
      const su = smaOf(up, L) * L;
      const sd = smaOf(dn, L) * L;
      if (isNa(su) || isNa(sd)) return NA;
      return sd === 0 ? 100 : 100 - 100 / (1 + su / sd);
    },
  },
  "ta.cmo": {
    params: ["series", "length"],
    fn: (st, [src, len], c) => {
      const n = step(st, c.bar);
      const h = hist(st, "s", src, n);
      const ch = h.length > 1 ? src - h[h.length - 2] : NA;
      const up = hist(st, "u", isNa(ch) ? NA : Math.max(ch, 0), n);
      const dn = hist(st, "d", isNa(ch) ? NA : Math.max(-ch, 0), n);
      const L = Math.round(len);
      const su = smaOf(up, L) * L;
      const sd = smaOf(dn, L) * L;
      return su + sd ? (100 * (su - sd)) / (su + sd) : 0;
    },
  },
  "ta.tsi": {
    params: ["source", "short_length", "long_length"],
    fn: (st, [src, s, l], c) => {
      const n = step(st, c.bar);
      const h = hist(st, "s", src, n);
      const ch = h.length > 1 ? src - h[h.length - 2] : NA;
      const a = emaIn(st, "a2", emaIn(st, "a1", ch, l, n), s, n);
      const b = emaIn(st, "b2", emaIn(st, "b1", Math.abs(ch), l, n), s, n);
      return b ? a / b : NA;
    },
  },
  "ta.wpr": {
    params: ["length"],
    fn: (st, [len], c) => {
      const n = step(st, c.bar);
      const L = Math.round(len);
      const hh = hist(st, "h", c.high(c.bar), n);
      const ll = hist(st, "l", c.low(c.bar), n);
      if (hh.length < L) return NA;
      const mx = Math.max(...last(hh, L));
      const mn = Math.min(...last(ll, L));
      return mx === mn ? NA : (-100 * (mx - c.close(c.bar))) / (mx - mn);
    },
  },
  "ta.dmi": {
    params: ["diLength", "adxSmoothing"],
    fn: (st, [diLen, adxLen], c) => {
      const n = step(st, c.bar);
      const i = c.bar;
      const up = i > 0 ? c.high(i) - c.high(i - 1) : NA;
      const down = i > 0 ? c.low(i - 1) - c.low(i) : NA;
      const plusDM = isNa(up) ? NA : up > down && up > 0 ? up : 0;
      const minusDM = isNa(down) ? NA : down > up && down > 0 ? down : 0;
      const tr = rma(st, "tr", trAt(c, i, false), diLen, i, n);
      const plus = (100 * rma(st, "p", plusDM, diLen, i, n)) / tr;
      const minus = (100 * rma(st, "m", minusDM, diLen, i, n)) / tr;
      const sum = plus + minus;
      const adx = 100 * rma(st, "x", Math.abs(plus - minus) / (sum === 0 ? 1 : sum), adxLen, i, n);
      return tuple([plus, minus, adx]);
    },
  },
  "ta.supertrend": {
    params: ["factor", "atrPeriod"],
    fn: (st, [factor, period], c) => {
      const n = step(st, c.bar);
      const i = c.bar;
      const src = (c.high(i) + c.low(i)) / 2;
      const atr = rma(st, "a", trAt(c, i, true), period, i, n);
      let upper = src + factor * atr;
      let lower = src - factor * atr;
      const pl = recur(st, "l", n);
      const pu = recur(st, "u", n);
      const pst = recur(st, "st", n);
      const pc = i > 0 ? c.close(i - 1) : NA;
      lower = !isNa(pl) && (lower > pl || pc < pl) ? lower : !isNa(pl) ? pl : lower;
      upper = !isNa(pu) && (upper < pu || pc > pu) ? upper : !isNa(pu) ? pu : upper;
      let dir: number;
      if (isNa(atr) || isNa(pst)) dir = 1;
      else if (pst === pu) dir = c.close(i) > upper ? -1 : 1;
      else dir = c.close(i) < lower ? 1 : -1;
      const val = dir === -1 ? lower : upper;
      setRecur(st, "l", lower);
      setRecur(st, "u", upper);
      setRecur(st, "st", val);
      return tuple([val, dir]);
    },
  },
  "ta.sar": {
    params: ["start", "inc", "max"],
    fn: (st, [start, inc, max], c) => {
      const n = step(st, c.bar);
      const i = c.bar;
      if (n) st.prev = st.cur ? { ...st.cur } : null;
      const p = st.prev;
      const hi = c.high(i);
      const lo = c.low(i);
      let s: any;
      if (!p) {
        s = { up: true, sar: lo, ep: hi, af: start };
        if (i > 0 && c.close(i) < c.close(i - 1)) s = { up: false, sar: hi, ep: lo, af: start };
      } else {
        s = { ...p };
        s.sar = p.sar + p.af * (p.ep - p.sar);
        if (s.up) {
          if (lo < s.sar) s = { up: false, sar: p.ep, ep: lo, af: start };
          else if (hi > s.ep) {
            s.ep = hi;
            s.af = Math.min(max, s.af + inc);
          }
        } else if (hi > s.sar) s = { up: true, sar: p.ep, ep: hi, af: start };
        else if (lo < s.ep) {
          s.ep = lo;
          s.af = Math.min(max, s.af + inc);
        }
      }
      st.cur = s;
      return s.sar;
    },
  },
  "math.sum": {
    params: ["source", "length"],
    fn: (st, [src, len], c) => {
      const L = Math.round(len);
      const m = smaOf(hist(st, "s", src, step(st, c.bar)), L);
      return isNa(m) ? NA : m * L;
    },
  },
  fixnan: {
    params: ["source"],
    fn: (st, [src], c) => {
      const n = step(st, c.bar);
      const prev = recur(st, "f", n);
      const v = isNa(src) ? prev ?? NA : src;
      setRecur(st, "f", v);
      return v;
    },
  },
};

// Valores tipo serie de ta.* sin paréntesis
export const TA_VARS: Record<string, (st: St, c: Ctx) => any> = {
  "ta.tr": (_st, c) => trAt(c, c.bar, false),
  "ta.obv": (st, c) => {
    const n = step(st, c.bar);
    const i = c.bar;
    const prev = recur(st, "o", n) ?? 0;
    const ch = i > 0 ? c.close(i) - c.close(i - 1) : 0;
    const v = prev + (ch > 0 ? c.volume(i) : ch < 0 ? -c.volume(i) : 0);
    setRecur(st, "o", v);
    return v;
  },
  "ta.accdist": (st, c) => {
    const n = step(st, c.bar);
    const i = c.bar;
    const prev = recur(st, "a", n) ?? 0;
    const hl = c.high(i) - c.low(i);
    const mfm = hl ? ((c.close(i) - c.low(i)) - (c.high(i) - c.close(i))) / hl : 0;
    const v = prev + mfm * c.volume(i);
    setRecur(st, "a", v);
    return v;
  },
  "ta.vwap": (st, c) => vwapAt(st, c, (c.high(c.bar) + c.low(c.bar) + c.close(c.bar)) / 3),
};

export function vwapAt(st: St, c: Ctx, src: number): number {
  const n = step(st, c.bar);
  const day = c.dayKey(c.bar);
  if (n) {
    st.pPV = st.cPV;
    st.pV = st.cV;
    st.pDay = st.cDay;
  }
  const reset = st.pDay !== day;
  const pv = (reset ? 0 : st.pPV ?? 0) + src * c.volume(c.bar);
  const v = (reset ? 0 : st.pV ?? 0) + c.volume(c.bar);
  st.cPV = pv;
  st.cV = v;
  st.cDay = day;
  return v ? pv / v : NA;
}

// ---------------------------------------------------------------- helpers

export function tuple(a: any[]) {
  (a as any).__tuple = true;
  return a;
}

function rma(st: St, name: string, src: number, len: number, bar: number, isNewIn?: boolean): number {
  const n = isNewIn ?? step(st, bar);
  const L = Math.max(1, Math.round(len));
  const h = hist(st, "rh_" + name, src, n);
  const prev = recur(st, name, n);
  let v: number;
  if (isNa(src)) v = prev ?? NA;
  else if (isNa(prev)) v = h.length >= L ? smaOf(h, L) : NA;
  else v = (src + (L - 1) * prev) / L;
  setRecur(st, name, v);
  return v;
}

function emaIn(st: St, name: string, src: number, len: number, n: boolean): number {
  const L = Math.max(1, Math.round(len));
  const h = hist(st, "eh_" + name, src, n);
  const prev = recur(st, name, n);
  let v: number;
  if (isNa(src)) v = prev ?? NA;
  else if (isNa(prev)) v = h.length >= L ? smaOf(h, L) : NA;
  else {
    const a = 2 / (L + 1);
    v = a * src + (1 - a) * prev;
  }
  setRecur(st, name, v);
  return v;
}

function wmaOf(h: any[], len: number): number {
  if (h.length < len || len < 1) return NA;
  let s = 0;
  let w = 0;
  for (let i = 0; i < len; i++) {
    const v = h[h.length - len + i];
    if (isNa(v)) return NA;
    s += v * (i + 1);
    w += i + 1;
  }
  return s / w;
}

function trAt(c: Ctx, i: number, handleNa: boolean): number {
  const h = c.high(i);
  const l = c.low(i);
  if (i === 0) return handleNa ? h - l : NA;
  const pc = c.close(i - 1);
  return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
}

// highest(src, len) o highest(len) (usa high)
function extreme(st: St, a: any[], c: Ctx, def: "high" | "low", f: (...x: number[]) => number) {
  let src: number, len: number;
  if (a.length < 2 || isNa(a[1])) {
    len = a[0];
    src = def === "high" ? c.high(c.bar) : c.low(c.bar);
  } else [src, len] = a;
  const h = hist(st, "s", src, step(st, c.bar));
  const L = Math.round(len);
  if (h.length < L) return NA;
  const x = last(h, L);
  if (x.some(isNa)) return NA;
  return f(...x);
}

function extremeBars(st: St, a: any[], c: Ctx, def: "high" | "low", better: (x: number, y: number) => boolean) {
  let src: number, len: number;
  if (a.length < 2 || isNa(a[1])) {
    len = a[0];
    src = def === "high" ? c.high(c.bar) : c.low(c.bar);
  } else [src, len] = a;
  const h = hist(st, "s", src, step(st, c.bar));
  const L = Math.round(len);
  if (h.length < L) return NA;
  let best = 0;
  for (let k = 1; k < L; k++) if (better(h[h.length - 1 - k], h[h.length - 1 - best])) best = k;
  return -best;
}

function pivot(st: St, a: any[], c: Ctx, def: "high" | "low", strict: (x: number, y: number) => boolean, loose: (x: number, y: number) => boolean) {
  let src: number, lb: number, rb: number;
  if (a.length === 2 || isNa(a[2])) {
    [lb, rb] = a;
    src = def === "high" ? c.high(c.bar) : c.low(c.bar);
  } else [src, lb, rb] = a;
  const h = hist(st, "s", src, step(st, c.bar));
  const L = Math.round(lb);
  const R = Math.round(rb);
  if (h.length < L + R + 1) return NA;
  const ci = h.length - 1 - R;
  const v = h[ci];
  if (isNa(v)) return NA;
  for (let k = 1; k <= L; k++) if (isNa(h[ci - k]) || !loose(v, h[ci - k])) return NA;
  for (let k = 1; k <= R; k++) if (!strict(v, h[ci + k])) return NA;
  return v;
}
