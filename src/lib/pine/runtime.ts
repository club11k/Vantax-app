// Intérprete de Pine Script para VANTAX CHARTS — ejecución.
// Ejecuta el script una vez por vela (como TradingView) y devuelve lo que
// hay que dibujar: plots, hlines, fills, formas, fondos, cajas, líneas y
// etiquetas, además de los inputs para que el usuario los pueda cambiar.

import { Node, parsePine, PineError } from "./parser";
import { isNa, St, TA, TA_VARS, tuple, vwapAt } from "./ta";

export { PineError };

export type PineBar = { t: number; o: number; h: number; l: number; c: number; v: number };

export type PineInput = {
  key: string;
  title: string;
  type: "int" | "float" | "bool" | "string" | "color" | "source";
  defval: any;
  options?: any[];
  min?: number;
  max?: number;
  step?: number;
};

export type PlotOut = {
  title: string;
  values: number[];
  colors: (string | null)[];
  style: string;
  linewidth: number;
  offset: number;
  histbase: number;
  display: boolean;
};
export type HlineOut = { price: number; title: string; color: string; linestyle: string; linewidth: number };
export type FillOut = { a: { kind: "plot" | "hline"; idx: number }; b: { kind: "plot" | "hline"; idx: number }; colors: (string | null)[] };
export type ShapeOut = {
  title: string;
  kind: "shape" | "char" | "arrow";
  style: string;
  char: string;
  location: string;
  size: string;
  offset: number;
  on: (number | null)[]; // valor (para location.absolute) o 1 si se dibuja; null si no
  colors: (string | null)[];
  texts: (string | null)[];
  textcolors: (string | null)[];
};
export type Drawing = Record<string, any> & { type: "line" | "box" | "label" | "linefill"; deleted: boolean; seq: number };

export type PineOutput = {
  title: string;
  shortTitle: string;
  overlay: boolean;
  precision: number | null;
  plots: PlotOut[];
  hlines: HlineOut[];
  fills: FillOut[];
  shapes: ShapeOut[];
  bgcolors: (string | null)[];
  barcolors: (string | null)[];
  drawings: Drawing[];
  inputs: PineInput[];
  warnings: string[];
};

export type PineOptions = {
  symbol: string;
  tf: string; // M1, M5, ..., MN1
  mintick: number;
  inputs?: Record<string, any>;
  timezone?: string;
  // Velas de otras temporalidades / símbolos (request.security).
  // Devuelve null si aún no están cargadas (se anotan en `missing`) o "error".
  secBars?: (symbol: string, tf: string) => PineBar[] | null | "error";
  missing?: Set<string>;
  _memo?: Map<string, { bars: PineBar[]; caps: Map<string, any[]> }>;
  _computing?: Set<string>;
};

const PINE_TF: Record<string, string> = {
  "1": "M1", "5": "M5", "15": "M15", "30": "M30", "60": "H1", "1H": "H1", "240": "H4", "4H": "H4",
  D: "D1", "1D": "D1", W: "W1", "1W": "W1", M: "MN1", "1M": "MN1",
};

// ---------------------------------------------------------------- colores

const PINE_COLORS: Record<string, string> = {
  aqua: "#00BCD4", black: "#363A45", blue: "#2962FF", fuchsia: "#E040FB", gray: "#787B86",
  green: "#4CAF50", lime: "#00E676", maroon: "#880E4F", navy: "#311B92", olive: "#808000",
  orange: "#FF9800", purple: "#9C27B0", red: "#FF5252", silver: "#B2B5BE", teal: "#00897B",
  white: "#FFFFFF", yellow: "#FFEB3B",
};

type RGBA = { r: number; g: number; b: number; a: number };

export function parseColor(c: any): RGBA | null {
  if (typeof c !== "string") return null;
  if (c.startsWith("#")) {
    const h = c.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const m = /^rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  return null;
}
const rgba = (r: number, g: number, b: number, a: number) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

function colorNew(c: any, transp: any): any {
  const p = parseColor(c);
  if (!p) return NaN;
  const t = isNa(transp) ? 0 : transp;
  return rgba(p.r, p.g, p.b, 1 - t / 100);
}

// ---------------------------------------------------------------- arrays

export class PineArray {
  a: any[];
  constructor(a: any[] = []) {
    this.a = a;
  }
}

// Objetos de tipos propios (type)
export class PineObj {
  t: string;
  f: Record<string, any>;
  constructor(t: string, f: Record<string, any>) {
    this.t = t;
    this.f = f;
  }
}

// ---------------------------------------------------------------- intérprete

class Var {
  hist: any[] = [];
  cur: any = NaN;
  init = false;
}
type Frame = { vars: Map<string, Var>; parent: Frame | null; path: string };
class BreakSig {}
class ContinueSig {}

const SOURCES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "hlcc4"];

const TF_INFO: Record<string, { period: string; mult: number; unit: "m" | "D" | "W" | "M"; secs: number }> = {
  M1: { period: "1", mult: 1, unit: "m", secs: 60 },
  M5: { period: "5", mult: 5, unit: "m", secs: 300 },
  M15: { period: "15", mult: 15, unit: "m", secs: 900 },
  M30: { period: "30", mult: 30, unit: "m", secs: 1800 },
  H1: { period: "60", mult: 60, unit: "m", secs: 3600 },
  H4: { period: "240", mult: 240, unit: "m", secs: 14400 },
  D1: { period: "D", mult: 1, unit: "D", secs: 86400 },
  W1: { period: "W", mult: 1, unit: "W", secs: 604800 },
  MN1: { period: "M", mult: 1, unit: "M", secs: 2592000 },
};

// Firmas de las funciones integradas (para los argumentos con nombre)
const SIG: Record<string, string[]> = {
  indicator: ["title", "shorttitle", "overlay", "format", "precision", "scale", "max_bars_back", "timeframe", "timeframe_gaps", "explicit_plot_zorder", "max_lines_count", "max_labels_count", "max_boxes_count"],
  plot: ["series", "title", "color", "linewidth", "style", "trackprice", "histbase", "offset", "join", "editable", "show_last", "display", "format", "precision", "force_overlay"],
  hline: ["price", "title", "color", "linestyle", "linewidth", "editable", "display"],
  fill: ["hline1", "hline2", "color", "title", "editable", "fillgaps", "display"],
  bgcolor: ["color", "offset", "editable", "show_last", "title", "display", "force_overlay"],
  barcolor: ["color", "offset", "editable", "show_last", "title", "display"],
  plotshape: ["series", "title", "style", "location", "color", "offset", "text", "textcolor", "editable", "size", "show_last", "display", "format", "precision", "force_overlay"],
  plotchar: ["series", "title", "char", "location", "color", "offset", "text", "textcolor", "editable", "size", "show_last", "display", "format", "precision", "force_overlay"],
  plotarrow: ["series", "title", "colorup", "colordown", "offset", "minheight", "maxheight", "editable", "show_last", "display", "format", "precision", "force_overlay"],
  input: ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  "input.int": ["defval", "title", "minval", "maxval", "step", "tooltip", "inline", "group", "confirm", "display"],
  "input.float": ["defval", "title", "minval", "maxval", "step", "tooltip", "inline", "group", "confirm", "display"],
  "input.bool": ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  "input.string": ["defval", "title", "options", "tooltip", "inline", "group", "confirm", "display"],
  "input.color": ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  "input.source": ["defval", "title", "tooltip", "inline", "group", "display"],
  "input.timeframe": ["defval", "title", "options", "tooltip", "inline", "group", "confirm", "display"],
  "input.session": ["defval", "title", "options", "tooltip", "inline", "group", "confirm", "display"],
  "input.symbol": ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  "input.price": ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  "input.time": ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  "input.text_area": ["defval", "title", "tooltip", "group", "confirm", "display"],
  "input.enum": ["defval", "title", "options", "tooltip", "inline", "group", "confirm", "display"],
  "line.new": ["x1", "y1", "x2", "y2", "xloc", "extend", "color", "style", "width", "force_overlay"],
  "box.new": ["left", "top", "right", "bottom", "border_color", "border_width", "border_style", "extend", "xloc", "bgcolor", "text", "text_size", "text_color", "text_halign", "text_valign", "text_wrap", "text_font_family", "force_overlay", "text_formatting"],
  "label.new": ["x", "y", "text", "xloc", "yloc", "color", "style", "textcolor", "size", "textalign", "tooltip", "text_font_family", "force_overlay", "text_formatting"],
  "linefill.new": ["line1", "line2", "color"],
  "request.security": ["symbol", "timeframe", "expression", "gaps", "lookahead", "ignore_invalid_symbol", "currency", "calc_bars_count"],
  "request.security_lower_tf": ["symbol", "timeframe", "expression", "ignore_invalid_symbol", "currency", "ignore_invalid_timeframe", "calc_bars_count"],
  "color.new": ["color", "transp"],
  "color.rgb": ["red", "green", "blue", "transp"],
  "color.from_gradient": ["value", "bottom_value", "top_value", "bottom_color", "top_color"],
  "str.tostring": ["value", "format"],
  "math.round": ["number", "precision"],
  nz: ["source", "replacement"],
  time: ["timeframe", "session", "timezone", "bars_back"],
  time_close: ["timeframe", "session", "timezone", "bars_back"],
  timestamp: ["year", "month", "day", "hour", "minute", "second"],
  "array.new_float": ["size", "initial_value"],
  "array.new_int": ["size", "initial_value"],
  "array.new_bool": ["size", "initial_value"],
  "array.new_string": ["size", "initial_value"],
  "array.new_color": ["size", "initial_value"],
  "array.new_line": ["size", "initial_value"],
  "array.new_box": ["size", "initial_value"],
  "array.new_label": ["size", "initial_value"],
  "array.new": ["size", "initial_value"],
};

// Alias de Pine v4 (sin prefijo)
const V4_ALIASES: Record<string, string> = {
  study: "indicator", security: "request.security", tostring: "str.tostring",
  abs: "math.abs", max: "math.max", min: "math.min", round: "math.round", sqrt: "math.sqrt", pow: "math.pow",
  log: "math.log", log10: "math.log10", exp: "math.exp", sign: "math.sign", floor: "math.floor", ceil: "math.ceil",
  avg: "math.avg", sum: "math.sum", cos: "math.cos", sin: "math.sin", tan: "math.tan", atan: "math.atan",
};
for (const k of Object.keys(TA)) if (k.startsWith("ta.")) V4_ALIASES[k.slice(3)] = k;

const SIZE_PX: Record<string, number> = { "size.auto": 10, "size.tiny": 7, "size.small": 10, "size.normal": 13, "size.large": 18, "size.huge": 26 };
export const sizePx = (s: any) => SIZE_PX[s] ?? 12;

export class PineRuntime {
  private ast: Node;
  private bars: PineBar[] = [];
  private bar = 0;
  private opts!: PineOptions;
  private store = new Map<string, Var>();
  private nodeHist = new Map<string, any[]>();
  private states = new Map<string, St>();
  private funcs = new Map<string, Node>();
  private methods = new Map<string, Node[]>();
  private types = new Map<string, { name: string; def: Node | null }[]>();
  private enums = new Map<string, { name: string; title: string }[]>();
  private global!: Frame;
  private ops = 0;
  private depth = 0;
  private out!: PineOutput;
  private plotIdx = new Map<string, number>();
  private hlineIdx = new Map<string, number>();
  private fillIdx = new Map<string, number>();
  private shapeIdx = new Map<string, number>();
  private inputIdx = new Map<string, PineInput>();
  private maxCount = { line: 50, box: 50, label: 50, linefill: 50 };
  private drawSeq = 0;
  private tzCache = new Map<string, Intl.DateTimeFormat>();
  private partsCache = new Map<string, any>();
  private warned = new Set<string>();
  private curNode: Node | null = null;
  private src: string;
  captures = new Map<string, any[]>();

  constructor(src: string) {
    this.src = src;
    this.ast = parsePine(src);
    for (const st of this.ast.body as Node[]) this.registerDef(st);
    if (!(this.ast.body as Node[]).some((s) => s.k === "ExprStmt" && s.expr.k === "Call" && ["indicator", "study"].includes(s.expr.callee?.name))) {
      const strat = (this.ast.body as Node[]).find((s) => s.k === "ExprStmt" && s.expr.k === "Call" && ["strategy", "library"].includes(s.expr.callee?.name));
      if (strat) throw new PineError("Solo se pueden usar indicadores (indicator). Las estrategias y librerías no están soportadas.", strat.line);
    }
  }

  private registerDef(st: Node) {
    if (st.k === "FuncDef") {
      if (st.isMethod) {
        const list = this.methods.get(st.name) ?? [];
        if (!list.includes(st)) list.push(st);
        this.methods.set(st.name, list);
        if (!this.funcs.has(st.name)) this.funcs.set(st.name, st);
      } else this.funcs.set(st.name, st);
    } else if (st.k === "TypeDef") this.types.set(st.name, st.fields);
    else if (st.k === "EnumDef") this.enums.set(st.name, st.members);
  }

  run(bars: PineBar[], opts: PineOptions): PineOutput {
    this.bars = bars;
    this.opts = opts;
    this.store.clear();
    this.nodeHist.clear();
    this.states.clear();
    this.plotIdx.clear();
    this.hlineIdx.clear();
    this.fillIdx.clear();
    this.shapeIdx.clear();
    this.inputIdx.clear();
    this.warned.clear();
    this.ops = 0;
    this.drawSeq = 0;
    this.captures = new Map();
    if (!opts._memo) opts._memo = new Map();
    if (!opts._computing) opts._computing = new Set();
    opts._computing.add(opts.symbol + "|" + opts.tf);
    const n = bars.length;
    this.out = {
      title: "Indicador",
      shortTitle: "",
      overlay: false,
      precision: null,
      plots: [],
      hlines: [],
      fills: [],
      shapes: [],
      bgcolors: new Array(n).fill(null),
      barcolors: new Array(n).fill(null),
      drawings: [],
      inputs: [],
      warnings: [],
    };
    this.global = { vars: new Map(), parent: null, path: "" };
    for (let i = 0; i < n; i++) {
      this.bar = i;
      try {
        this.execBlock(this.ast, this.global, false);
      } catch (e) {
        if (e instanceof PineError) throw e;
        if (e instanceof BreakSig || e instanceof ContinueSig) continue;
        throw new PineError(`Error al calcular: ${(e as Error).message}`, this.curNode?.line ?? 0);
      }
    }
    opts._computing.delete(opts.symbol + "|" + opts.tf);
    this.out.inputs = [...this.inputIdx.values()];
    this.out.drawings = this.out.drawings.filter((d) => !d.deleted);
    return this.out;
  }

  // Solo para leer la cabecera (título, overlay e inputs) sin velas reales
  static describe(src: string): { title: string; overlay: boolean; inputs: PineInput[] } {
    const rt = new PineRuntime(src);
    const bars: PineBar[] = [];
    let p = 100;
    const t0 = Date.UTC(2024, 0, 1);
    for (let i = 0; i < 60; i++) {
      const o = p;
      p = p * (1 + Math.sin(i / 5) * 0.01);
      bars.push({ t: t0 + i * 3600_000, o, h: Math.max(o, p) + 0.5, l: Math.min(o, p) - 0.5, c: p, v: 1000 });
    }
    const out = rt.run(bars, { symbol: "TEST", tf: "H1", mintick: 0.01 });
    return { title: out.title, overlay: out.overlay, inputs: out.inputs };
  }

  // ------------------------------------------------------------ statements

  private execBlock(block: Node, frame: Frame, newScope = true): any {
    const f = newScope ? { vars: new Map<string, Var>(), parent: frame, path: frame.path } : frame;
    let last: any = NaN;
    for (const st of block.body as Node[]) last = this.exec(st, f);
    return last;
  }

  private declare(frame: Frame, name: string, key: string): Var {
    let v = this.store.get(key);
    if (!v) {
      v = new Var();
      this.store.set(key, v);
    }
    frame.vars.set(name, v);
    return v;
  }

  private lookup(frame: Frame | null, name: string): Var | null {
    for (let f = frame; f; f = f.parent) {
      const v = f.vars.get(name);
      if (v) return v;
    }
    return null;
  }

  private exec(node: Node, frame: Frame): any {
    this.curNode = node;
    if (++this.ops > 40_000_000) throw new PineError("El indicador tarda demasiado (¿bucle infinito?)", node.line);
    switch (node.k) {
      case "VarDecl": {
        const v = this.declare(frame, node.name, frame.path + "|" + node.id);
        if (node.mode === "var") {
          if (!v.init) {
            v.cur = this.eval(node.expr, frame);
            v.init = true;
          }
        } else v.cur = this.eval(node.expr, frame);
        v.hist[this.bar] = v.cur;
        return v.cur;
      }
      case "Assign": {
        const v = this.lookup(frame, node.name);
        if (!v) throw new PineError(`La variable «${node.name}» no está declarada`, node.line);
        const val = this.eval(node.expr, frame);
        v.cur = node.op === ":=" ? val : this.binop(node.op[0], v.cur, val);
        v.hist[this.bar] = v.cur;
        return v.cur;
      }
      case "TupleDecl": {
        const val = this.eval(node.expr, frame);
        if (!Array.isArray(val)) throw new PineError("La función no devuelve varios valores", node.line);
        node.names.forEach((name: string, i: number) => {
          if (name === "_") return;
          const v = node.reassign ? this.lookup(frame, name) : this.declare(frame, name, frame.path + "|" + node.id + ":" + i);
          if (!v) throw new PineError(`La variable «${name}» no está declarada`, node.line);
          v.cur = val[i];
          v.hist[this.bar] = v.cur;
        });
        return NaN;
      }
      case "FuncDef":
      case "TypeDef":
      case "EnumDef":
        this.registerDef(node);
        return NaN;
      case "FieldAssign": {
        const t = node.target as Node;
        let obj: any;
        let field: string;
        if (t.k === "Member") {
          obj = this.eval(t.obj, frame);
          field = t.prop;
        } else {
          const parts = (t.name as string).split(".");
          const v = this.lookup(frame, parts[0]);
          if (!v) throw new PineError(`La variable «${parts[0]}» no está declarada`, node.line);
          obj = v.cur;
          for (const part of parts.slice(1, -1)) obj = this.field(obj, part, node);
          field = parts[parts.length - 1];
        }
        if (!(obj instanceof PineObj)) {
          if (isNa(obj)) throw new PineError(`No se puede asignar «${field}»: el objeto es na`, node.line);
          throw new PineError(`No se puede asignar «${field}»`, node.line);
        }
        const val = this.eval(node.expr, frame);
        obj.f[field] = node.op === ":=" ? val : this.binop(node.op[0], obj.f[field], val);
        return obj.f[field];
      }
      case "ExprStmt":
        return this.eval(node.expr, frame);
      case "Break":
        throw new BreakSig();
      case "Continue":
        throw new ContinueSig();
      default:
        return this.eval(node, frame);
    }
  }

  // ------------------------------------------------------------ expresiones

  private truthy(v: any): boolean {
    return v === true || (typeof v === "number" && v !== 0 && !Number.isNaN(v));
  }

  private binop(op: string, a: any, b: any): any {
    switch (op) {
      case "+":
        if (typeof a === "string" || typeof b === "string") {
          if (isNa(a) || isNa(b)) return NaN;
          return String(a) + String(b);
        }
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return b === 0 ? NaN : a / b;
      case "%":
        return b === 0 ? NaN : a % b;
      case "==":
        if (isNa(a) || isNa(b)) return false;
        return a === b;
      case "!=":
        if (isNa(a) || isNa(b)) return false;
        return a !== b;
      case "<":
        return a < b;
      case ">":
        return a > b;
      case "<=":
        return a <= b;
      case ">=":
        return a >= b;
    }
    throw new PineError(`Operador desconocido ${op}`, this.curNode?.line ?? 0);
  }

  private eval(node: Node, frame: Frame): any {
    switch (node.k) {
      case "Num":
        return node.v;
      case "Str":
        return node.v;
      case "Bool":
        return node.v;
      case "Na":
        return NaN;
      case "Color":
        return node.v;
      case "Ident":
        return this.ident(node, frame);
      case "Index": {
        const n = Math.round(this.eval(node.idx, frame));
        if (isNa(n) || n < 0) return NaN;
        const o = node.obj;
        if (o.k === "Ident") {
          const v = !o.name.includes(".") ? this.lookup(frame, o.name) : null;
          if (v) {
            if (n === 0) return v.cur;
            const x = v.hist[this.bar - n];
            return x === undefined ? NaN : x;
          }
          if (SOURCES.includes(o.name) || ["time", "bar_index", "time_close"].includes(o.name)) return this.series(o.name, this.bar - n);
        }
        const key = frame.path + "|" + node.id;
        let h = this.nodeHist.get(key);
        if (!h) this.nodeHist.set(key, (h = []));
        h[this.bar] = this.eval(o, frame);
        const x = h[this.bar - n];
        return x === undefined ? NaN : x;
      }
      case "Unary": {
        const v = this.eval(node.e, frame);
        if (node.op === "not") return !this.truthy(v);
        if (node.op === "-") return -v;
        return +v;
      }
      case "Binary": {
        if (node.op === "and") return this.truthy(this.eval(node.l, frame)) && this.truthy(this.eval(node.r, frame));
        if (node.op === "or") return this.truthy(this.eval(node.l, frame)) || this.truthy(this.eval(node.r, frame));
        return this.binop(node.op, this.eval(node.l, frame), this.eval(node.r, frame));
      }
      case "Ternary":
        return this.truthy(this.eval(node.cond, frame)) ? this.eval(node.a, frame) : this.eval(node.b, frame);
      case "ArrayLit":
        return tuple(node.items.map((x: Node) => this.eval(x, frame)));
      case "If": {
        if (this.truthy(this.eval(node.cond, frame))) return this.execBlock(node.then, frame);
        if (node.els) return this.execBlock(node.els, frame);
        return NaN;
      }
      case "Switch": {
        const subj = node.subject ? this.eval(node.subject, frame) : undefined;
        for (const c of node.cases as { cond: Node | null; body: Node }[]) {
          if (c.cond === null) return this.execBlock(c.body, frame);
          const v = this.eval(c.cond, frame);
          if (node.subject ? v === subj : this.truthy(v)) return this.execBlock(c.body, frame);
        }
        return NaN;
      }
      case "For": {
        const from = this.eval(node.from, frame);
        const to = this.eval(node.to, frame);
        if (isNa(from) || isNa(to)) return NaN;
        let step = node.step ? Math.abs(this.eval(node.step, frame)) : 1;
        if (!step) step = 1;
        const dir = to >= from ? 1 : -1;
        const f: Frame = { vars: new Map(), parent: frame, path: frame.path };
        const iv = this.declare(f, node.name, frame.path + "|" + node.id + ":i");
        let last: any = NaN;
        let guard = 0;
        for (let i = from; dir > 0 ? i <= to : i >= to; i += step * dir) {
          if (++guard > 100_000) throw new PineError("Bucle demasiado largo", node.line);
          iv.cur = i;
          iv.hist[this.bar] = i;
          try {
            last = this.execBlock(node.body, f);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        }
        return last;
      }
      case "ForIn": {
        const arr = this.eval(node.arr, frame);
        if (!(arr instanceof PineArray)) return NaN;
        const f: Frame = { vars: new Map(), parent: frame, path: frame.path };
        const xv = this.declare(f, node.name, frame.path + "|" + node.id + ":x");
        const iv = node.idx ? this.declare(f, node.idx, frame.path + "|" + node.id + ":i") : null;
        let last: any = NaN;
        const items = arr.a.slice();
        for (let i = 0; i < items.length; i++) {
          xv.cur = items[i];
          if (iv) iv.cur = i;
          try {
            last = this.execBlock(node.body, f);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        }
        return last;
      }
      case "While": {
        let guard = 0;
        let last: any = NaN;
        while (this.truthy(this.eval(node.cond, frame))) {
          if (++guard > 100_000) throw new PineError("Bucle while demasiado largo", node.line);
          try {
            last = this.execBlock(node.body, frame);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        }
        return last;
      }
      case "Call":
        return this.call(node, frame);
      case "Member":
        return this.field(this.eval(node.obj, frame), node.prop, node);
      case "__val":
        return node.v;
      case "VarDecl":
      case "Assign":
      case "TupleDecl":
      case "Break":
      case "Continue":
      case "ExprStmt":
        return this.exec(node, frame);
    }
    throw new PineError(`Expresión no soportada (${node.k})`, node.line);
  }

  private ident(node: Node, frame: Frame): any {
    const name: string = node.name;
    const dot = name.indexOf(".");
    if (dot < 0) {
      const v = this.lookup(frame, name);
      if (v) return v.cur;
    } else {
      const parts = name.split(".");
      const v = this.lookup(frame, parts[0]);
      if (v) {
        let obj = v.cur;
        for (const part of parts.slice(1)) obj = this.field(obj, part, node);
        return obj;
      }
      const en = this.enums.get(parts[0]);
      if (en && parts.length === 2) {
        const m = en.find((x) => x.name === parts[1]);
        if (m) return m.title;
      }
    }
    const val = this.builtinValue(name, frame, node);
    if (val === undefined) throw new PineError(`«${name}» no existe o no está soportado`, node.line);
    return val;
  }

  private field(obj: any, part: string, node: Node): any {
    if (obj instanceof PineObj) {
      if (!(part in obj.f)) throw new PineError(`El tipo «${obj.t}» no tiene el campo «${part}»`, node.line);
      return obj.f[part];
    }
    if (isNa(obj)) return NaN;
    throw new PineError(`No se puede leer «.${part}»`, node.line);
  }

  private newObj(typeName: string, node: Node, frame: Frame): PineObj {
    const fields = this.types.get(typeName)!;
    const pos = node.args as Node[];
    const named = node.named as Record<string, Node>;
    const f: Record<string, any> = {};
    fields.forEach((fd, i) => {
      if (i < pos.length) f[fd.name] = this.evalArg(pos[i], frame);
      else if (named[fd.name]) f[fd.name] = this.eval(named[fd.name], frame);
      else if (fd.def) f[fd.name] = this.eval(fd.def, frame);
      else f[fd.name] = NaN;
    });
    return new PineObj(typeName, f);
  }

  private findMethod(obj: any, meth: string): Node | null {
    const list = this.methods.get(meth);
    if (!list || !list.length) return null;
    const t = obj instanceof PineObj ? obj.t : obj instanceof PineArray ? "array" : obj && typeof obj === "object" && obj.type ? obj.type : typeof obj === "number" ? "float" : typeof obj === "string" ? "string" : typeof obj === "boolean" ? "bool" : null;
    const exact = list.find((fn) => fn.params[0]?.type === t || (t === "float" && fn.params[0]?.type === "int"));
    return exact ?? (list.length === 1 ? list[0] : list.find((fn) => !fn.params[0]?.type) ?? list[0]);
  }

  // ------------------------------------------------------------ series y constantes

  private series(name: string, i: number): number {
    const b = this.bars[i];
    if (!b) return NaN;
    switch (name) {
      case "open":
        return b.o;
      case "high":
        return b.h;
      case "low":
        return b.l;
      case "close":
        return b.c;
      case "volume":
        return b.v;
      case "hl2":
        return (b.h + b.l) / 2;
      case "hlc3":
        return (b.h + b.l + b.c) / 3;
      case "ohlc4":
        return (b.o + b.h + b.l + b.c) / 4;
      case "hlcc4":
        return (b.h + b.l + 2 * b.c) / 4;
      case "time":
        return b.t;
      case "time_close":
        return b.t + this.tfInfo().secs * 1000;
      case "bar_index":
        return i;
    }
    return NaN;
  }

  private tfInfo() {
    return TF_INFO[this.opts.tf] ?? TF_INFO.H1;
  }

  private tz(): string {
    return this.opts.timezone ?? "Etc/UTC";
  }

  private parts(ts: number, tz?: string) {
    const zone = tz && tz !== "" ? normTz(tz) : this.tz();
    const key = zone + ts;
    const hit = this.partsCache.get(key);
    if (hit) return hit;
    let fmt = this.tzCache.get(zone);
    if (!fmt) {
      try {
        fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
      } catch {
        fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
      }
      this.tzCache.set(zone, fmt);
    }
    const o: any = {};
    for (const p of fmt.formatToParts(new Date(ts))) o[p.type] = p.value;
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) + 1;
    const res = { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour % 24, minute: +o.minute, second: +o.second, dow: wd };
    if (this.partsCache.size > 20000) this.partsCache.clear();
    this.partsCache.set(key, res);
    return res;
  }

  private ctx() {
    const self = this;
    return {
      bar: self.bar,
      high: (i: number) => self.bars[i]?.h ?? NaN,
      low: (i: number) => self.bars[i]?.l ?? NaN,
      close: (i: number) => self.bars[i]?.c ?? NaN,
      open: (i: number) => self.bars[i]?.o ?? NaN,
      volume: (i: number) => self.bars[i]?.v ?? NaN,
      time: (i: number) => self.bars[i]?.t ?? NaN,
      dayKey: (i: number) => {
        const p = self.parts(self.bars[i]?.t ?? 0);
        return `${p.year}-${p.month}-${p.day}`;
      },
    };
  }

  private state(key: string): St {
    let s = this.states.get(key);
    if (!s) this.states.set(key, (s = {}));
    return s;
  }

  private builtinValue(name: string, frame: Frame, node: Node): any {
    if (SOURCES.includes(name) || name === "time" || name === "time_close" || name === "bar_index") return this.series(name, this.bar);
    const n = this.bars.length;
    const b = this.bars[this.bar];
    switch (name) {
      case "last_bar_index":
        return n - 1;
      case "last_bar_time":
        return this.bars[n - 1]?.t ?? NaN;
      case "timenow":
        return Date.now();
      case "year":
        return this.parts(b.t).year;
      case "month":
        return this.parts(b.t).month;
      case "dayofmonth":
        return this.parts(b.t).day;
      case "dayofweek":
        return this.parts(b.t).dow;
      case "hour":
        return this.parts(b.t).hour;
      case "minute":
        return this.parts(b.t).minute;
      case "second":
        return this.parts(b.t).second;
      case "weekofyear": {
        const d = new Date(b.t);
        const start = Date.UTC(d.getUTCFullYear(), 0, 1);
        return Math.ceil(((b.t - start) / 86400000 + new Date(start).getUTCDay() + 1) / 7);
      }
      case "barstate.isfirst":
        return this.bar === 0;
      case "barstate.islast":
      case "barstate.isrealtime":
        return this.bar === n - 1;
      case "barstate.ishistory":
        return this.bar < n - 1;
      case "barstate.isconfirmed":
        return this.bar < n - 1;
      case "barstate.islastconfirmedhistory":
        return this.bar === n - 2;
      case "barstate.isnew":
        return true;
      case "syminfo.ticker":
      case "syminfo.tickerid":
      case "syminfo.root":
      case "syminfo.description":
        return this.opts.symbol;
      case "syminfo.prefix":
        return "VANTAGE";
      case "syminfo.mintick":
        return this.opts.mintick;
      case "syminfo.pointvalue":
        return 1;
      case "syminfo.timezone":
        return this.tz();
      case "syminfo.currency":
        return "USD";
      case "syminfo.type":
        return "cfd";
      case "syminfo.session":
        return "regular";
      case "timeframe.period":
        return this.tfInfo().period;
      case "timeframe.multiplier":
        return this.tfInfo().unit === "m" ? this.tfInfo().mult : 1;
      case "timeframe.isintraday":
      case "timeframe.isminutes":
        return this.tfInfo().unit === "m";
      case "timeframe.isdaily":
        return this.tfInfo().unit === "D";
      case "timeframe.isweekly":
        return this.tfInfo().unit === "W";
      case "timeframe.ismonthly":
        return this.tfInfo().unit === "M";
      case "timeframe.isdwm":
        return this.tfInfo().unit !== "m";
      case "timeframe.isseconds":
      case "timeframe.isticks":
        return false;
      case "math.pi":
        return Math.PI;
      case "math.e":
        return Math.E;
      case "math.phi":
        return 1.618033988749895;
      case "math.rphi":
        return 0.618033988749895;
      case "line.all":
        return new PineArray(this.out.drawings.filter((d) => d.type === "line" && !d.deleted));
      case "box.all":
        return new PineArray(this.out.drawings.filter((d) => d.type === "box" && !d.deleted));
      case "label.all":
        return new PineArray(this.out.drawings.filter((d) => d.type === "label" && !d.deleted));
    }
    if (name in TA_VARS) return TA_VARS[name](this.state(frame.path + "|" + node.id), this.ctx());
    if (name.startsWith("color.")) {
      const c = PINE_COLORS[name.slice(6)];
      if (c) return c;
    }
    const ns = name.split(".")[0];
    if (["plot", "shape", "location", "size", "line", "extend", "xloc", "yloc", "label", "hline", "text", "position", "display", "format", "order", "barmerge", "session", "adjustment", "alert", "currency", "font", "scale", "dividends", "earnings", "splits", "dayofweek", "box", "table", "backadjustment", "settlement_as_close", "chart"].includes(ns) && name.includes(".")) {
      if (ns === "dayofweek") {
        const map: Record<string, number> = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };
        return map[name.slice(10)] ?? NaN;
      }
      if (name === "format.mintick") return "mintick";
      return name;
    }
    return undefined;
  }

  // ------------------------------------------------------------ llamadas

  private args(node: Node, frame: Frame, params: string[] | undefined): any[] {
    const a = (node.args as Node[]).map((x) => this.eval(x, frame));
    const named = node.named as Record<string, Node>;
    for (const k of Object.keys(named)) {
      const i = params ? params.indexOf(k) : -1;
      if (i >= 0) a[i] = this.eval(named[k], frame);
    }
    return a;
  }

  private call(node: Node, frame: Frame): any {
    const callee = node.callee as Node;
    if (callee.k === "Member") {
      const obj = this.eval(callee.obj, frame);
      return this.method(obj, callee.prop, node, frame, 0);
    }
    if (callee.k === "Na") return this.builtin("na", node, frame);
    if (callee.k !== "Ident") throw new PineError("Llamada no válida", node.line);
    let name: string = callee.name;
    const dot = name.indexOf(".");
    if (dot < 0 && this.funcs.has(name)) return this.callUser(this.funcs.get(name)!, node, frame);
    if (dot > 0) {
      const parts = name.split(".");
      const v = this.lookup(frame, parts[0]);
      if (v) {
        let obj = v.cur;
        for (const part of parts.slice(1, -1)) obj = this.field(obj, part, node);
        return this.method(obj, parts[parts.length - 1], node, frame, 0);
      }
      if (this.types.has(parts[0]) && parts.length === 2) {
        if (parts[1] === "new") return this.newObj(parts[0], node, frame);
        if (parts[1] === "copy") {
          const o = this.evalArg((node.args as Node[])[0], frame);
          return o instanceof PineObj ? new PineObj(o.t, { ...o.f }) : NaN;
        }
      }
      // método propio llamado sobre algo que no es variable: «miFunc(x).metodo()» ya va por Member
    }
    if (V4_ALIASES[name]) name = V4_ALIASES[name];
    return this.builtin(name, node, frame);
  }

  private method(obj: any, meth: string, node: Node, frame: Frame, _d: number): any {
    const um = this.findMethod(obj, meth);
    if (um) {
      const fake: Node = { ...node, args: [{ k: "__val", id: -1, line: node.line, v: obj } as Node, ...(node.args as Node[])] };
      return this.callUser(um, fake, frame);
    }
    if (obj instanceof PineObj) {
      if (meth === "copy") return new PineObj(obj.t, { ...obj.f });
      throw new PineError(`El tipo «${obj.t}» no tiene el método «${meth}»`, node.line);
    }
    let ns: string;
    if (obj instanceof PineArray) ns = "array";
    else if (obj && typeof obj === "object" && obj.type) ns = obj.type;
    else if (typeof obj === "string" && !obj.startsWith("#") && !obj.startsWith("rgba")) ns = "str";
    else if (isNa(obj)) return NaN;
    else throw new PineError(`No se puede usar «.${meth}()» aquí`, node.line);
    const fake: Node = { ...node, args: [{ k: "__val", id: -1, line: node.line, v: obj } as Node, ...(node.args as Node[])] };
    return this.builtin(`${ns}.${meth}`, fake, frame);
  }

  private callUser(fn: Node, node: Node, frame: Frame): any {
    if (++this.depth > 200) throw new PineError("Demasiadas llamadas anidadas", node.line);
    try {
      const path = frame.path + "/" + node.id;
      const f: Frame = { vars: new Map(), parent: this.global, path };
      const params = fn.params as { name: string; def: Node | null }[];
      const pos = node.args as Node[];
      const named = node.named as Record<string, Node>;
      params.forEach((p, i) => {
        let val: any;
        if (i < pos.length) val = this.eval(pos[i], frame);
        else if (named[p.name]) val = this.eval(named[p.name], frame);
        else if (p.def) val = this.eval(p.def, frame);
        else val = NaN;
        const v = this.declare(f, p.name, path + "|p:" + p.name);
        v.cur = val;
        v.hist[this.bar] = val;
      });
      const r = this.execBlock(fn.body, f, false);
      return r;
    } finally {
      this.depth--;
    }
  }

  private warn(msg: string) {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    this.out.warnings.push(msg);
  }

  private evalArg(n: Node, frame: Frame) {
    return n.k === "__val" ? n.v : this.eval(n, frame);
  }

  private builtin(name: string, node: Node, frame: Frame): any {
    const key = frame.path + "|" + node.id;
    const line = node.line;
    // funciones ta.* con estado
    const ta = TA[name];
    if (ta) {
      const a = (node.args as Node[]).map((x) => this.evalArg(x, frame));
      const named = node.named as Record<string, Node>;
      for (const k of Object.keys(named)) {
        const i = ta.params.indexOf(k);
        if (i >= 0) a[i] = this.eval(named[k], frame);
      }
      return ta.fn(this.state(key), a, this.ctx());
    }
    if (name === "ta.vwap") {
      const a = this.args(node, frame, ["source", "anchor", "stdev_mult"]);
      return vwapAt(this.state(key), this.ctx(), a[0]);
    }
    if (name.startsWith("input")) return this.input(name, node, frame, key);

    const sig = SIG[name];
    const a = (node.args as Node[]).map((x) => this.evalArg(x, frame));
    const named = node.named as Record<string, Node>;
    if (sig) {
      for (const k of Object.keys(named)) {
        const i = sig.indexOf(k);
        if (i >= 0) a[i] = this.eval(named[k], frame);
      }
    } else if (Object.keys(named).length) {
      // funciones sin firma conocida: los argumentos con nombre van detrás
      for (const k of Object.keys(named)) a.push(this.eval(named[k], frame));
    }
    const A = (i: number, d?: any) => (a[i] === undefined || (isNa(a[i]) && d !== undefined && typeof d !== "number") ? d : a[i]);
    const num = (i: number, d: number) => (a[i] === undefined || isNa(a[i]) ? d : a[i]);
    const out = this.out;
    const bar = this.bar;

    switch (name) {
      // ----- cabecera
      case "indicator": {
        if (bar === 0) {
          out.title = String(A(0, "Indicador"));
          out.shortTitle = String(A(1, "") || "");
          out.overlay = A(2, false) === true;
          if (!isNa(a[4]) && a[4] !== undefined) out.precision = a[4];
          if (a[10] !== undefined) this.maxCount.line = Math.min(500, a[10]);
          if (a[11] !== undefined) this.maxCount.label = Math.min(500, a[11]);
          if (a[12] !== undefined) this.maxCount.box = Math.min(500, a[12]);
        }
        return NaN;
      }
      case "strategy":
      case "library":
        throw new PineError("Solo se pueden usar indicadores (indicator).", line);

      // ----- salidas
      case "plot": {
        let idx = this.plotIdx.get(key);
        if (idx === undefined) {
          idx = out.plots.length;
          this.plotIdx.set(key, idx);
          out.plots.push({
            title: String(A(1, `Plot ${idx + 1}`)),
            values: new Array(this.bars.length).fill(NaN),
            colors: new Array(this.bars.length).fill(null),
            style: String(A(4, "plot.style_line")),
            linewidth: num(3, 1),
            offset: num(7, 0),
            histbase: num(6, 0),
            display: A(11, "display.all") !== "display.none",
          });
        }
        const p = out.plots[idx];
        const v = a[0];
        p.values[bar] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        p.colors[bar] = a[2] === undefined ? "__default" : isNa(a[2]) ? null : a[2];
        return { plot: idx };
      }
      case "hline": {
        let idx = this.hlineIdx.get(key);
        if (idx === undefined) {
          idx = out.hlines.length;
          this.hlineIdx.set(key, idx);
          out.hlines.push({ price: a[0], title: String(A(1, "")), color: A(2, "#787B86") || "#787B86", linestyle: String(A(3, "hline.style_dashed")), linewidth: num(4, 1) });
        }
        return { hline: idx };
      }
      case "fill": {
        const h1 = a[0];
        const h2 = a[1];
        if (!h1 || !h2 || typeof h1 !== "object") return NaN;
        let idx = this.fillIdx.get(key);
        if (idx === undefined) {
          idx = out.fills.length;
          this.fillIdx.set(key, idx);
          out.fills.push({
            a: { kind: "plot" in h1 ? "plot" : "hline", idx: h1.plot ?? h1.hline },
            b: { kind: "plot" in h2 ? "plot" : "hline", idx: h2.plot ?? h2.hline },
            colors: new Array(this.bars.length).fill(null),
          });
        }
        // fill(p1, p2, top_value, bottom_value, top_color, bottom_color) -> usamos top_color
        let col = a[2];
        if (typeof col === "number" && a[4] !== undefined) col = a[4];
        out.fills[idx].colors[bar] = isNa(col) || col === undefined ? (a[2] === undefined ? "rgba(155,48,255,0.15)" : null) : col;
        return NaN;
      }
      case "bgcolor": {
        const c = a[0];
        if (!isNa(c)) {
          const off = num(1, 0);
          const i = bar + off;
          if (i >= 0 && i < out.bgcolors.length) out.bgcolors[i] = c;
        }
        return NaN;
      }
      case "barcolor": {
        const c = a[0];
        if (!isNa(c)) out.barcolors[bar] = c;
        return NaN;
      }
      case "plotshape":
      case "plotchar":
      case "plotarrow": {
        let idx = this.shapeIdx.get(key);
        const kind = name === "plotshape" ? "shape" : name === "plotchar" ? "char" : "arrow";
        if (idx === undefined) {
          idx = out.shapes.length;
          this.shapeIdx.set(key, idx);
          const n = this.bars.length;
          out.shapes.push({
            title: String(A(1, "")),
            kind,
            style: kind === "shape" ? String(A(2, "shape.xcross")) : "",
            char: kind === "char" ? String(A(2, "★")) : "",
            location: kind === "arrow" ? "arrow" : String(A(3, "location.abovebar")),
            size: kind === "arrow" ? "size.small" : String(A(9, "size.auto")),
            offset: num(kind === "arrow" ? 4 : 5, 0),
            on: new Array(n).fill(null),
            colors: new Array(n).fill(null),
            texts: new Array(n).fill(null),
            textcolors: new Array(n).fill(null),
          });
        }
        const s = out.shapes[idx];
        const v = a[0];
        if (kind === "arrow") {
          if (!isNa(v) && v !== 0) {
            s.on[bar] = v;
            s.colors[bar] = v > 0 ? A(2, "#4CAF50") : A(3, "#FF5252");
          }
        } else if (s.location === "location.absolute") {
          if (!isNa(v) && typeof v === "number") s.on[bar] = v;
        } else if (this.truthy(v)) {
          s.on[bar] = 1;
        }
        if (s.on[bar] !== null && kind !== "arrow") {
          s.colors[bar] = a[4] === undefined ? "#2962FF" : isNa(a[4]) ? null : a[4];
          const t = a[6];
          s.texts[bar] = t === undefined || isNa(t) ? null : String(t);
          s.textcolors[bar] = a[7] === undefined || isNa(a[7]) ? null : a[7];
        }
        return NaN;
      }
      case "alertcondition":
      case "alert":
      case "log.info":
      case "log.warning":
      case "log.error":
      case "runtime.error":
        if (name === "runtime.error") throw new PineError(String(a[0]), line);
        return NaN;
      case "plotcandle":
      case "plotbar":
        this.warn("plotcandle/plotbar no se dibujan en VANTAX CHARTS");
        return NaN;

      // ----- request
      case "request.security":
      case "request.security_lower_tf": {
        const lower = name === "request.security_lower_tf";
        const sym = this.normSym(a[0]);
        const tf = this.normTf(a[1], line);
        const expr = a[2];
        const same = sym === this.opts.symbol && tf === this.opts.tf;
        if (same) {
          let h = this.captures.get(key);
          if (!h) this.captures.set(key, (h = []));
          h[bar] = expr;
          return lower ? new PineArray([expr]) : expr;
        }
        const chartMs = this.tfInfo().secs * 1000;
        const otherMs = (TF_INFO[tf]?.secs ?? 60) * 1000;
        if (lower && otherMs > chartMs) throw new PineError("request.security_lower_tf necesita una temporalidad menor que la del gráfico", line);
        const ser = this.secSeries(sym, tf, line);
        const naRes = () => (lower ? new PineArray([]) : Array.isArray(expr) ? tuple(expr.map(() => NaN)) : NaN);
        if (!ser) return naRes();
        const vals = ser.caps.get(key);
        if (!vals) return naRes();
        const hb = ser.bars;
        const t = this.bars[bar].t;
        if (lower) {
          const lo = lowerBound(hb, t);
          const hi = lowerBound(hb, t + chartMs);
          return new PineArray(vals.slice(lo, hi).map((v) => (v === undefined ? NaN : v)));
        }
        let k: number;
        if (otherMs < chartMs) {
          k = lowerBound(hb, t + chartMs) - 1; // último intrabar de esta vela
        } else {
          k = lowerBound(hb, t + 1) - 1; // vela superior que contiene a esta
          if (k < 0) return naRes();
          const lookahead = a[4] === "barmerge.lookahead_on";
          if (!lookahead) {
            const endK = k + 1 < hb.length ? hb[k + 1].t : hb[k].t + otherMs;
            const closed = t + chartMs >= endK;
            if (!closed && bar !== this.bars.length - 1) k -= 1;
          }
        }
        if (k < 0) return naRes();
        const v = vals[k];
        return v === undefined ? naRes() : v;
      }
      case "ticker.new":
        return a[1];
      case "ticker.standard":
      case "ticker.modify":
        return a[0];

      // ----- na / conversiones
      case "na":
        return isNa(a[0]);
      case "nz":
        return isNa(a[0]) ? (a[1] === undefined ? 0 : a[1]) : a[0];
      case "int":
        return isNa(a[0]) ? NaN : Math.trunc(a[0]);
      case "float":
        return isNa(a[0]) ? NaN : +a[0];
      case "bool":
        return this.truthy(a[0]);
      case "string":
        return String(a[0]);
      case "iff":
        return this.truthy(a[0]) ? a[1] : a[2];

      // ----- math
      case "math.abs":
        return Math.abs(a[0]);
      case "math.max":
        return a.some(isNa) ? NaN : Math.max(...a);
      case "math.min":
        return a.some(isNa) ? NaN : Math.min(...a);
      case "math.avg":
        return a.some(isNa) ? NaN : a.reduce((s, x) => s + x, 0) / a.length;
      case "math.round": {
        if (isNa(a[0])) return NaN;
        if (a[1] === undefined) return Math.round(a[0]);
        const f = 10 ** a[1];
        return Math.round(a[0] * f) / f;
      }
      case "math.round_to_mintick":
        return Math.round(a[0] / this.opts.mintick) * this.opts.mintick;
      case "math.floor":
        return Math.floor(a[0]);
      case "math.ceil":
        return Math.ceil(a[0]);
      case "math.sqrt":
        return Math.sqrt(a[0]);
      case "math.pow":
        return Math.pow(a[0], a[1]);
      case "math.exp":
        return Math.exp(a[0]);
      case "math.log":
        return Math.log(a[0]);
      case "math.log10":
        return Math.log10(a[0]);
      case "math.sign":
        return Math.sign(a[0]);
      case "math.cos":
        return Math.cos(a[0]);
      case "math.sin":
        return Math.sin(a[0]);
      case "math.tan":
        return Math.tan(a[0]);
      case "math.acos":
        return Math.acos(a[0]);
      case "math.asin":
        return Math.asin(a[0]);
      case "math.atan":
        return Math.atan(a[0]);
      case "math.todegrees":
        return (a[0] * 180) / Math.PI;
      case "math.toradians":
        return (a[0] * Math.PI) / 180;
      case "math.random": {
        const lo = num(0, 0);
        const hi = num(1, 1);
        return lo + Math.random() * (hi - lo);
      }

      // ----- colores
      case "color.new":
        return colorNew(a[0], a[1]);
      case "color.rgb":
        return isNa(a[0]) ? NaN : rgba(a[0], a[1], a[2], 1 - num(3, 0) / 100);
      case "color.r":
        return parseColor(a[0])?.r ?? NaN;
      case "color.g":
        return parseColor(a[0])?.g ?? NaN;
      case "color.b":
        return parseColor(a[0])?.b ?? NaN;
      case "color.t": {
        const p = parseColor(a[0]);
        return p ? Math.round((1 - p.a) * 100) : NaN;
      }
      case "color.from_gradient": {
        const [v, lo, hi, c1, c2] = a;
        const p1 = parseColor(c1);
        const p2 = parseColor(c2);
        if (!p1 || !p2 || isNa(v)) return NaN;
        const t = hi === lo ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        return rgba(p1.r + (p2.r - p1.r) * t, p1.g + (p2.g - p1.g) * t, p1.b + (p2.b - p1.b) * t, p1.a + (p2.a - p1.a) * t);
      }

      // ----- tiempo
      case "time":
      case "time_close": {
        const base = name === "time" ? this.series("time", bar) : this.series("time_close", bar);
        const tf = a[0];
        const sess = a[1];
        if (tf !== undefined && tf !== "" && !isNa(tf) && tf !== this.tfInfo().period) {
          // time("D") etc.: inicio del periodo superior
          return this.periodStart(this.series("time", bar), String(tf), a[2]);
        }
        if (sess === undefined || isNa(sess) || sess === "") return base;
        return this.inSession(this.series("time", bar), String(sess), a[2]) ? base : NaN;
      }
      case "timestamp":
        return this.timestamp(a);
      case "year":
        return this.parts(a[0], a[1]).year;
      case "month":
        return this.parts(a[0], a[1]).month;
      case "dayofmonth":
        return this.parts(a[0], a[1]).day;
      case "dayofweek":
        return this.parts(a[0], a[1]).dow;
      case "hour":
        return this.parts(a[0], a[1]).hour;
      case "minute":
        return this.parts(a[0], a[1]).minute;
      case "second":
        return this.parts(a[0], a[1]).second;
      case "timeframe.in_seconds": {
        const tf = a[0] === undefined || a[0] === "" ? this.tfInfo().period : String(a[0]);
        return tfSeconds(tf);
      }
      case "timeframe.change": {
        const tf = String(a[0]);
        if (bar === 0) return true;
        return this.periodStart(this.series("time", bar), tf) !== this.periodStart(this.series("time", bar - 1), tf);
      }

      // ----- texto
      case "str.tostring":
      case "tostring":
        return this.toStr(a[0], a[1]);
      case "str.format": {
        const fmt = String(a[0]);
        return fmt.replace(/\{(\d+)(?:,[^}]*)?\}/g, (_m, i) => this.toStr(a[+i + 1]));
      }
      case "str.length":
        return String(a[0]).length;
      case "str.contains":
        return String(a[0]).includes(String(a[1]));
      case "str.startswith":
        return String(a[0]).startsWith(String(a[1]));
      case "str.endswith":
        return String(a[0]).endsWith(String(a[1]));
      case "str.pos":
        return String(a[0]).indexOf(String(a[1]));
      case "str.replace_all":
        return String(a[0]).split(String(a[1])).join(String(a[2]));
      case "str.replace": {
        const s = String(a[0]);
        return s.replace(String(a[1]), String(a[2]));
      }
      case "str.upper":
        return String(a[0]).toUpperCase();
      case "str.lower":
        return String(a[0]).toLowerCase();
      case "str.substring":
        return String(a[0]).substring(a[1], a[2] === undefined ? undefined : a[2]);
      case "str.split":
        return new PineArray(String(a[0]).split(String(a[1])));
      case "str.tonumber": {
        const v = parseFloat(String(a[0]));
        return Number.isNaN(v) ? NaN : v;
      }
      case "str.trim":
        return String(a[0]).trim();
      case "str.repeat":
        return String(a[0]).repeat(Math.max(0, a[1])) ;
    }

    if (name.startsWith("array.")) return this.arrayFn(name, a, line);
    if (name.startsWith("line.") || name.startsWith("box.") || name.startsWith("label.") || name.startsWith("linefill.")) return this.drawFn(name, a, line);
    if (name.startsWith("table.")) {
      this.warn("Las tablas (table.*) no se muestran en VANTAX CHARTS");
      return name === "table.new" ? { type: "table" } : NaN;
    }
    if (name.startsWith("map.") || name.startsWith("matrix.") || name.startsWith("polyline.") || name.startsWith("chart.point")) {
      throw new PineError(`«${name}» no está soportado en VANTAX CHARTS`, line);
    }
    throw new PineError(`La función «${name}» no existe o no está soportada`, line);
  }

  // ------------------------------------------------------------ request.security

  private normSym(x: any): string {
    if (x === undefined || isNa(x) || x === "") return this.opts.symbol;
    let s = String(x);
    if (s.includes(":")) s = s.slice(s.indexOf(":") + 1);
    if (s.toUpperCase() === this.opts.symbol.toUpperCase()) return this.opts.symbol;
    return s;
  }

  private normTf(x: any, line: number): string {
    if (x === undefined || isNa(x) || x === "") return this.opts.tf;
    const s = String(x).toUpperCase();
    const tf = PINE_TF[s];
    if (!tf) throw new PineError(`La temporalidad «${x}» no existe en el bróker. Se pueden usar: 1, 5, 15, 30, 60, 240, D, W y M`, line);
    return tf;
  }

  // Ejecuta el script entero en otra temporalidad / símbolo y guarda el valor
  // de cada request.security en cada vela de esa serie (como TradingView).
  private secSeries(sym: string, tf: string, line: number): { bars: PineBar[]; caps: Map<string, any[]> } | null {
    const k = sym + "|" + tf;
    const memo = this.opts._memo!;
    const hit = memo.get(k);
    if (hit) return hit;
    if (this.opts._computing!.has(k)) return null;
    const bars = this.opts.secBars ? this.opts.secBars(sym, tf) : null;
    if (bars === "error") throw new PineError(`No hay datos de «${sym}» en ${tf} en el bróker`, line);
    if (!bars) {
      this.opts.missing?.add(k);
      return null;
    }
    const nested = new PineRuntime(this.src);
    nested.run(bars, { ...this.opts, symbol: sym, tf, _memo: memo, _computing: this.opts._computing });
    this.opts._computing!.delete(k);
    const res = { bars, caps: nested.captures };
    memo.set(k, res);
    return res;
  }

  // ------------------------------------------------------------ inputs

  private input(name: string, node: Node, frame: Frame, key: string): any {
    const sig = SIG[name] ?? SIG.input;
    const rawDef = (node.args as Node[])[0] ?? (node.named as Record<string, Node>).defval;
    const srcName = rawDef && rawDef.k === "Ident" && SOURCES.includes(rawDef.name) ? rawDef.name : null;
    let info = this.inputIdx.get(key);
    if (!info) {
      const a = this.args(node, frame, sig);
      const title = a[1] !== undefined && !isNa(a[1]) ? String(a[1]) : `Entrada ${this.inputIdx.size + 1}`;
      let type: PineInput["type"];
      if (name === "input.source" || (name === "input" && srcName)) type = "source";
      else if (name === "input.int") type = "int";
      else if (name === "input.float" || name === "input.price") type = "float";
      else if (name === "input.bool") type = "bool";
      else if (name === "input.color") type = "color";
      else if (name === "input.string" || name === "input.timeframe" || name === "input.session" || name === "input.symbol" || name === "input.text_area" || name === "input.enum") type = "string";
      else if (typeof a[0] === "boolean") type = "bool";
      else if (typeof a[0] === "string") type = a[0].startsWith("#") || a[0].startsWith("rgba") ? "color" : "string";
      else type = rawDef?.k === "Num" && rawDef.int ? "int" : "float";
      info = {
        key: title,
        title,
        type,
        defval: type === "source" ? srcName ?? "close" : a[0],
      };
      if (type === "int" || type === "float") {
        if (name === "input.int" || name === "input.float") {
          if (a[2] !== undefined && !isNa(a[2])) info.min = a[2];
          if (a[3] !== undefined && !isNa(a[3])) info.max = a[3];
          if (a[4] !== undefined && !isNa(a[4])) info.step = a[4];
        }
      }
      if (name === "input.string" || name === "input.timeframe" || name === "input.session") {
        const opts = a[2];
        if (opts instanceof PineArray) info.options = opts.a;
        else if (Array.isArray(opts)) info.options = opts.slice();
      }
      if (name === "input.enum") {
        for (const members of this.enums.values()) {
          if (members.some((m) => m.title === a[0])) info.options = members.map((m) => m.title);
        }
      }
      // títulos repetidos: clave única
      let k = info.key;
      let n = 2;
      while ([...this.inputIdx.values()].some((x) => x.key === k)) k = `${info.key} (${n++})`;
      info.key = k;
      this.inputIdx.set(key, info);
    }
    const ov = this.opts.inputs?.[info.key];
    const val = ov !== undefined && ov !== null && ov !== "" ? ov : info.defval;
    if (info.type === "source") return this.series(SOURCES.includes(val) ? val : "close", this.bar);
    if (info.type === "int" || info.type === "float") return typeof val === "number" ? val : parseFloat(val);
    return val;
  }

  // ------------------------------------------------------------ helpers de tiempo

  private inSession(ts: number, sess: string, tz?: any): boolean {
    const [range, days] = sess.split(":");
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(range.trim());
    if (!m) return true;
    const p = this.parts(ts, isNa(tz) ? undefined : tz);
    if (days && !days.includes(String(p.dow))) return false;
    const t = p.hour * 60 + p.minute;
    const s = +m[1] * 60 + +m[2];
    const e = +m[3] * 60 + +m[4];
    if (s === e) return true;
    return s < e ? t >= s && t < e : t >= s || t < e;
  }

  private periodStart(ts: number, tf: string, tz?: any): number {
    const p = this.parts(ts, isNa(tz) ? undefined : tz);
    const secs = tfSeconds(tf);
    if (/^\d+$/.test(tf)) {
      const mins = +tf;
      const dayMin = p.hour * 60 + p.minute;
      const start = Math.floor(dayMin / mins) * mins;
      return ts - (dayMin - start) * 60000 - p.second * 1000;
    }
    const dayStart = ts - (p.hour * 3600 + p.minute * 60 + p.second) * 1000;
    if (/D$/.test(tf)) return dayStart;
    if (/W$/.test(tf)) return dayStart - ((p.dow + 5) % 7) * 86400000;
    if (/M$/.test(tf)) return dayStart - (p.day - 1) * 86400000;
    return ts - (ts % (secs * 1000));
  }

  private timestamp(a: any[]): number {
    let tz: string | undefined;
    let vals = a;
    if (typeof a[0] === "string" && a.length === 1) {
      const d = Date.parse(a[0]);
      return Number.isNaN(d) ? NaN : d;
    }
    if (typeof a[0] === "string") {
      tz = a[0];
      vals = a.slice(1);
    }
    const [y, mo, d, h = 0, mi = 0, s = 0] = vals;
    const utc = Date.UTC(y, mo - 1, d, h, mi, s);
    const zone = tz ? normTz(tz) : this.tz();
    const p = this.parts(utc, zone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return utc - (asUtc - utc);
  }

  private toStr(v: any, fmt?: any): string {
    if (isNa(v)) return "NaN";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v !== "number") return String(v);
    if (fmt === "mintick" || fmt === "format.mintick") {
      const d = Math.max(0, Math.round(-Math.log10(this.opts.mintick)));
      return v.toFixed(d);
    }
    if (fmt === "format.percent") return (v).toFixed(2) + "%";
    if (fmt === "format.volume") {
      const abs = Math.abs(v);
      return abs >= 1e9 ? (v / 1e9).toFixed(2) + "B" : abs >= 1e6 ? (v / 1e6).toFixed(2) + "M" : abs >= 1e3 ? (v / 1e3).toFixed(2) + "K" : v.toFixed(2);
    }
    if (typeof fmt === "string" && /^[#0.,]+$/.test(fmt)) {
      const dec = fmt.includes(".") ? fmt.split(".")[1].length : 0;
      return v.toFixed(dec);
    }
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(8));
  }

  // ------------------------------------------------------------ arrays

  private arrayFn(name: string, a: any[], line: number): any {
    const m = name.slice(6);
    if (m.startsWith("new")) {
      const size = isNa(a[0]) || a[0] === undefined ? 0 : a[0];
      const init = a[1] === undefined ? NaN : a[1];
      return new PineArray(new Array(Math.max(0, Math.round(size))).fill(init));
    }
    if (m === "from") return new PineArray(a.slice());
    const arr = a[0];
    if (!(arr instanceof PineArray)) {
      if (isNa(arr)) return NaN;
      throw new PineError(`${name}: el primer argumento no es un array`, line);
    }
    const x = arr.a;
    const idx = (i: number) => (i < 0 ? x.length + i : i);
    const nums = () => x.filter((v) => typeof v === "number" && !Number.isNaN(v));
    switch (m) {
      case "size":
        return x.length;
      case "get": {
        const i = idx(a[1]);
        if (i < 0 || i >= x.length) throw new PineError(`array.get: índice ${a[1]} fuera de rango (tamaño ${x.length})`, line);
        return x[i];
      }
      case "set": {
        const i = idx(a[1]);
        if (i < 0 || i >= x.length) throw new PineError(`array.set: índice ${a[1]} fuera de rango (tamaño ${x.length})`, line);
        x[i] = a[2];
        return NaN;
      }
      case "push":
        x.push(a[1]);
        if (x.length > 100000) x.shift();
        return NaN;
      case "pop":
        return x.length ? x.pop() : NaN;
      case "shift":
        return x.length ? x.shift() : NaN;
      case "unshift":
        x.unshift(a[1]);
        return NaN;
      case "insert":
        x.splice(idx(a[1]), 0, a[2]);
        return NaN;
      case "remove": {
        const i = idx(a[1]);
        if (i < 0 || i >= x.length) throw new PineError(`array.remove: índice ${a[1]} fuera de rango`, line);
        return x.splice(i, 1)[0];
      }
      case "clear":
        x.length = 0;
        return NaN;
      case "includes":
        return x.includes(a[1]);
      case "indexof":
        return x.indexOf(a[1]);
      case "lastindexof":
        return x.lastIndexOf(a[1]);
      case "first":
        return x.length ? x[0] : NaN;
      case "last":
        return x.length ? x[x.length - 1] : NaN;
      case "sum":
        return nums().reduce((s, v) => s + v, 0);
      case "avg": {
        const n = nums();
        return n.length ? n.reduce((s, v) => s + v, 0) / n.length : NaN;
      }
      case "max": {
        const n = nums().sort((p, q) => q - p);
        return n.length ? n[a[1] ?? 0] ?? NaN : NaN;
      }
      case "min": {
        const n = nums().sort((p, q) => p - q);
        return n.length ? n[a[1] ?? 0] ?? NaN : NaN;
      }
      case "median": {
        const n = nums().sort((p, q) => p - q);
        if (!n.length) return NaN;
        const h = Math.floor(n.length / 2);
        return n.length % 2 ? n[h] : (n[h - 1] + n[h]) / 2;
      }
      case "range": {
        const n = nums();
        return n.length ? Math.max(...n) - Math.min(...n) : NaN;
      }
      case "stdev":
      case "variance": {
        const n = nums();
        if (!n.length) return NaN;
        const mu = n.reduce((s, v) => s + v, 0) / n.length;
        const v = n.reduce((s, q) => s + (q - mu) ** 2, 0) / n.length;
        return m === "stdev" ? Math.sqrt(v) : v;
      }
      case "sort": {
        const desc = a[1] === "order.descending";
        x.sort((p, q) => (typeof p === "string" ? String(p).localeCompare(q) : p - q) * (desc ? -1 : 1));
        return NaN;
      }
      case "sort_indices": {
        const desc = a[1] === "order.descending";
        return new PineArray(x.map((_, i) => i).sort((p, q) => (x[p] - x[q]) * (desc ? -1 : 1)));
      }
      case "reverse":
        x.reverse();
        return NaN;
      case "copy":
        return new PineArray(x.slice());
      case "slice":
        return new PineArray(x.slice(a[1], a[2]));
      case "concat":
        if (a[1] instanceof PineArray) x.push(...a[1].a);
        return arr;
      case "fill": {
        const from = a[2] ?? 0;
        const to = a[3] ?? x.length;
        for (let i = from; i < to; i++) x[i] = a[1];
        return NaN;
      }
      case "join":
        return x.map((v) => this.toStr(v)).join(a[1] ?? ",");
      case "abs":
        return new PineArray(x.map((v) => Math.abs(v)));
      case "every":
        return x.every((v) => this.truthy(v));
      case "some":
        return x.some((v) => this.truthy(v));
    }
    throw new PineError(`«${name}» no está soportado`, line);
  }

  // ------------------------------------------------------------ dibujos

  private addDrawing(d: Drawing) {
    this.out.drawings.push(d);
    const t = d.type as keyof typeof this.maxCount;
    const alive = this.out.drawings.filter((x) => x.type === t && !x.deleted);
    const max = this.maxCount[t];
    if (alive.length > max) {
      for (let i = 0; i < alive.length - max; i++) alive[i].deleted = true;
    }
    if (this.out.drawings.length > 5000) this.out.drawings = this.out.drawings.filter((x) => !x.deleted);
  }

  private drawFn(name: string, a: any[], line: number): any {
    const [ns, m] = name.split(".");
    const sig = SIG[name];
    if (m === "new") {
      const d: Drawing = { type: ns as any, deleted: false, seq: this.drawSeq++ };
      if (ns === "line") {
        Object.assign(d, {
          x1: a[0], y1: a[1], x2: a[2], y2: a[3],
          xloc: a[4] ?? "xloc.bar_index", extend: a[5] ?? "extend.none",
          color: a[6] === undefined ? "#2962FF" : a[6], style: a[7] ?? "line.style_solid", width: a[8] ?? 1,
        });
      } else if (ns === "box") {
        Object.assign(d, {
          left: a[0], top: a[1], right: a[2], bottom: a[3],
          border_color: a[4] === undefined ? "#2962FF" : a[4], border_width: a[5] ?? 1, border_style: a[6] ?? "line.style_solid",
          extend: a[7] ?? "extend.none", xloc: a[8] ?? "xloc.bar_index",
          bgcolor: a[9] === undefined ? "rgba(41,98,255,0.2)" : a[9], text: a[10] ?? "", text_size: a[11] ?? "size.auto",
          text_color: a[12] ?? "#000000", text_halign: a[13] ?? "text.align_center", text_valign: a[14] ?? "text.align_center",
        });
      } else if (ns === "label") {
        Object.assign(d, {
          x: a[0], y: a[1], text: a[2] ?? "", xloc: a[3] ?? "xloc.bar_index", yloc: a[4] ?? "yloc.price",
          color: a[5] === undefined ? "#2962FF" : a[5], style: a[6] ?? "label.style_label_down",
          textcolor: a[7] === undefined ? "#FFFFFF" : a[7], size: a[8] ?? "size.normal", textalign: a[9] ?? "text.align_center",
        });
      } else if (ns === "linefill") {
        Object.assign(d, { line1: a[0], line2: a[1], color: a[2] ?? "rgba(41,98,255,0.2)" });
      }
      this.addDrawing(d);
      return d;
    }
    const d = a[0];
    if (!d || typeof d !== "object" || d.type !== ns) {
      if (m === "delete" || isNa(d)) return NaN;
      throw new PineError(`${name}: objeto no válido`, line);
    }
    void sig;
    if (m === "delete") {
      d.deleted = true;
      return NaN;
    }
    if (m === "copy") {
      const c = { ...d, seq: this.drawSeq++, deleted: false };
      this.addDrawing(c);
      return c;
    }
    if (m.startsWith("get_")) {
      const f = m.slice(4);
      if (ns === "line" && f === "price") {
        const x = a[1];
        if (d.x2 === d.x1) return d.y1;
        return d.y1 + ((d.y2 - d.y1) * (x - d.x1)) / (d.x2 - d.x1);
      }
      return d[f] ?? NaN;
    }
    if (m.startsWith("set_")) {
      const f = m.slice(4);
      switch (f) {
        case "xy1":
          d.x1 = a[1];
          d.y1 = a[2];
          break;
        case "xy2":
          d.x2 = a[1];
          d.y2 = a[2];
          break;
        case "xy":
          d.x = a[1];
          d.y = a[2];
          break;
        case "lefttop":
          d.left = a[1];
          d.top = a[2];
          break;
        case "rightbottom":
          d.right = a[1];
          d.bottom = a[2];
          break;
        case "xloc":
          if (ns === "line") {
            d.x1 = a[1];
            d.x2 = a[2];
            d.xloc = a[3];
          } else if (ns === "label") {
            d.x = a[1];
            d.xloc = a[2];
          }
          break;
        default:
          d[f] = a[1];
      }
      return NaN;
    }
    throw new PineError(`«${name}» no está soportado`, line);
  }
}

function lowerBound(bars: PineBar[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function normTz(tz: string): string {
  const m = /^(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(tz.trim());
  if (m) {
    const h = +m[2];
    if (m[3] && m[3] !== "00") return "UTC"; // offsets con minutos: aproximación
    // Etc/GMT tiene el signo invertido
    return h === 0 ? "UTC" : `Etc/GMT${m[1] === "+" ? "-" : "+"}${h}`;
  }
  return tz;
}

function tfSeconds(tf: string): number {
  if (/^\d+$/.test(tf)) return +tf * 60;
  const m = /^(\d*)([SDWM])$/.exec(tf);
  if (!m) return 60;
  const n = m[1] ? +m[1] : 1;
  return n * ({ S: 1, D: 86400, W: 604800, M: 2592000 } as any)[m[2]];
}

export function runPine(src: string, bars: PineBar[], opts: PineOptions): PineOutput {
  return new PineRuntime(src).run(bars, opts);
}
