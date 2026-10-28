// Intérprete de Pine Script para VANTAX CHARTS (28/10/2026).
// Parte 1: lexer + parser. Convierte el código Pine (v4/v5/v6) en un árbol
// que luego ejecuta runtime.ts vela a vela.

export class PineError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(line > 0 ? `Línea ${line}: ${message}` : message);
    this.line = line;
  }
}

// ---------------------------------------------------------------- lexer

type TokType = "num" | "str" | "color" | "ident" | "kw" | "op" | "nl" | "indent" | "dedent" | "eof";
export type Token = { t: TokType; v: string; line: number };

const KEYWORDS = new Set([
  "if", "else", "for", "to", "by", "in", "while", "var", "varip", "and", "or", "not",
  "true", "false", "na", "switch", "break", "continue", "import", "export", "method", "type", "enum",
]);

const OPS = [":=", "+=", "-=", "*=", "/=", "%=", "==", "!=", "<=", ">=", "=>", "+", "-", "*", "/", "%", "<", ">", "=", "?", ":", ",", "(", ")", "[", "]", ".", "{", "}"];

function stripComment(line: string): string {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") inStr = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function indentOf(raw: string): number {
  let n = 0;
  for (const c of raw) {
    if (c === " ") n++;
    else if (c === "\t") n += 4;
    else break;
  }
  return n;
}

function parenDelta(s: string): number {
  let d = 0;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") inStr = c;
    else if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
  }
  return d;
}

const CONT_END = /(,|\+|-|\*|\/|%|\?|:|\band|\bor|\bnot|==|!=|<=|>=|<|>|:=)\s*$/;

function tokenizeLine(text: string, line: number, out: Token[]) {
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < text.length && text[j] !== c) {
        if (text[j] === "\\" && j + 1 < text.length) {
          const n = text[j + 1];
          s += n === "n" ? "\n" : n === "t" ? "\t" : n;
          j += 2;
        } else s += text[j++];
      }
      if (j >= text.length) throw new PineError("Falta cerrar una cadena de texto", line);
      out.push({ t: "str", v: s, line });
      i = j + 1;
      continue;
    }
    if (c === "#") {
      const m = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?/.exec(text.slice(i));
      if (!m) throw new PineError("Color no válido", line);
      out.push({ t: "color", v: m[0], line });
      i += m[0].length;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(text.slice(i))!;
      out.push({ t: "num", v: m[0], line });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))!;
      out.push({ t: KEYWORDS.has(m[0]) ? "kw" : "ident", v: m[0], line });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (!op) throw new PineError(`Carácter no reconocido «${c}»`, line);
    out.push({ t: "op", v: op, line });
    i += op.length;
  }
}

export function tokenize(src: string): Token[] {
  const rawLines = src.replace(/\r\n?/g, "\n").split("\n");
  // 1) líneas lógicas (une las continuaciones)
  const logical: { text: string; indent: number; line: number }[] = [];
  let cur: { text: string; indent: number; line: number } | null = null;
  let depth = 0;
  for (let n = 0; n < rawLines.length; n++) {
    const raw = stripComment(rawLines[n]);
    if (!raw.trim()) continue;
    const ind = indentOf(raw);
    const body = raw.trim();
    const isCont =
      cur !== null &&
      (depth > 0 || (ind > cur.indent && ind % 4 !== 0) || (ind > cur.indent && CONT_END.test(cur.text) && !/=>\s*$/.test(cur.text)));
    if (isCont && cur) {
      cur.text += " " + body;
    } else {
      cur = { text: body, indent: ind, line: n + 1 };
      logical.push(cur);
    }
    depth = Math.max(0, depth + parenDelta(body));
  }
  // 2) tokens con INDENT / DEDENT
  const out: Token[] = [];
  const stack = [0];
  for (const l of logical) {
    const lvl = l.indent;
    if (lvl > stack[stack.length - 1]) {
      stack.push(lvl);
      out.push({ t: "indent", v: "", line: l.line });
    } else {
      while (lvl < stack[stack.length - 1]) {
        stack.pop();
        out.push({ t: "dedent", v: "", line: l.line });
      }
    }
    tokenizeLine(l.text, l.line, out);
    out.push({ t: "nl", v: "", line: l.line });
  }
  while (stack.length > 1) {
    stack.pop();
    out.push({ t: "dedent", v: "", line: 0 });
  }
  out.push({ t: "eof", v: "", line: 0 });
  return out;
}

// ---------------------------------------------------------------- AST

export type Node = { k: string; id: number; line: number; [key: string]: any };

const TYPE_NAMES = new Set(["int", "float", "bool", "string", "color", "line", "box", "label", "table", "linefill", "polyline", "array", "matrix", "map", "chart.point"]);
const QUALIFIERS = new Set(["series", "simple", "const", "input"]);

export class Parser {
  private toks: Token[];
  private p = 0;
  private nextId = 1;
  private userTypes = new Set<string>();
  private lastType: string | null = null;

  constructor(src: string) {
    this.toks = tokenize(src);
  }

  private peek(o = 0) {
    return this.toks[this.p + o];
  }
  private next() {
    return this.toks[this.p++];
  }
  private is(t: TokType, v?: string, o = 0) {
    const tk = this.peek(o);
    return tk && tk.t === t && (v === undefined || tk.v === v);
  }
  private isOp(v: string, o = 0) {
    return this.is("op", v, o);
  }
  private expectOp(v: string) {
    const tk = this.next();
    if (tk.t !== "op" || tk.v !== v) throw new PineError(`Se esperaba «${v}» y hay «${tk.v || tk.t}»`, tk.line);
    return tk;
  }
  private node(k: string, line: number, extra: Record<string, any> = {}): Node {
    return { k, id: this.nextId++, line, ...extra };
  }
  private skipNl() {
    while (this.is("nl")) this.p++;
  }

  parseProgram(): Node {
    const body: Node[] = [];
    this.skipNl();
    while (!this.is("eof")) {
      if (this.is("indent") || this.is("dedent")) {
        this.p++;
        continue;
      }
      body.push(this.statement());
      this.skipNl();
    }
    return this.node("Block", 1, { body });
  }

  private block(): Node {
    const line = this.peek().line;
    if (!this.is("nl")) {
      // bloque en la misma línea:  if x  => no habitual; tratamos expresión simple
      const st = this.statement();
      return this.node("Block", line, { body: [st] });
    }
    this.skipNl();
    if (!this.is("indent")) throw new PineError("Falta el bloque indentado", this.peek().line);
    this.p++;
    const body: Node[] = [];
    this.skipNl();
    while (!this.is("dedent") && !this.is("eof")) {
      body.push(this.statement());
      this.skipNl();
    }
    if (this.is("dedent")) this.p++;
    return this.node("Block", line, { body });
  }

  // Detecta "nombre(...) =>"
  private isFuncDef(): boolean {
    if (!this.is("ident") || !this.isOp("(", 1)) return false;
    let d = 0;
    for (let i = this.p + 1; i < this.toks.length; i++) {
      const tk = this.toks[i];
      if (tk.t === "nl" || tk.t === "eof") return false;
      if (tk.t === "op" && tk.v === "(") d++;
      if (tk.t === "op" && tk.v === ")") {
        d--;
        if (d === 0) return this.toks[i + 1]?.t === "op" && this.toks[i + 1].v === "=>";
      }
    }
    return false;
  }

  // Salta una anotación de tipo si la hay ("float", "int[]", "array<float>", "series float"...)
  private tryType(): boolean {
    const save = this.p;
    while (this.is("ident") && QUALIFIERS.has(this.peek().v) && this.is("ident", undefined, 1)) this.p++;
    if (!this.is("ident")) {
      this.p = save;
      return false;
    }
    // tipo conocido o tipo propio (type): «Zona z = ...», «Zona[] zs», «array<Zona> zs»
    const known = TYPE_NAMES.has(this.peek().v) || this.userTypes.has(this.peek().v);
    const looksType = this.is("ident", undefined, 1) || (this.isOp("[", 1) && this.isOp("]", 2)) || this.isOp("<", 1);
    if (!known && !looksType) {
      this.p = save;
      return false;
    }
    this.p++;
    if (this.isOp(".") && this.is("ident", undefined, 1)) this.p += 2; // chart.point
    if (this.isOp("<")) {
      let d = 0;
      while (!this.is("eof")) {
        const tk = this.next();
        if (tk.v === "<") d++;
        if (tk.v === ">") {
          d--;
          if (d === 0) break;
        }
      }
    }
    if (this.isOp("[") && this.isOp("]", 1)) this.p += 2;
    // tras el tipo tiene que venir el nombre de la variable
    if (this.is("ident") && (this.isOp("=", 1) || this.isOp(",", 1) || this.isOp(")", 1) || this.is("nl", undefined, 1))) {
      let base: string | null = null;
      let isArr = false;
      for (let k = save; k < this.p; k++) {
        const tk = this.toks[k];
        if (!base && tk.t === "ident" && !QUALIFIERS.has(tk.v)) base = tk.v;
        if (tk.t === "op" && tk.v === "[") isArr = true;
      }
      this.lastType = isArr ? "array" : base;
      return true;
    }
    this.p = save;
    return false;
  }

  private statement(): Node {
    const tk = this.peek();
    const line = tk.line;
    if (tk.t === "kw") {
      switch (tk.v) {
        case "var":
        case "varip": {
          this.p++;
          this.tryType();
          const name = this.next();
          if (name.t !== "ident") throw new PineError("Falta el nombre de la variable", line);
          this.expectOp("=");
          return this.node("VarDecl", line, { name: name.v, mode: "var", expr: this.expression() });
        }
        case "if":
          return this.ifNode();
        case "for":
          return this.forNode();
        case "while": {
          this.p++;
          const cond = this.expression();
          return this.node("While", line, { cond, body: this.block() });
        }
        case "switch":
          return this.switchNode();
        case "break":
          this.p++;
          return this.node("Break", line);
        case "continue":
          this.p++;
          return this.node("Continue", line);
        case "export":
          this.p++;
          return this.statement();
        case "method": {
          this.p++;
          const fn = this.funcDef();
          fn.isMethod = true;
          return fn;
        }
        case "type":
          return this.typeDef();
        case "enum":
          return this.enumDef();
        case "import":
          throw new PineError("«import» (librerías) no está soportado en VANTAX CHARTS", line);
      }
    }
    if (tk.t === "op" && tk.v === "[") {
      // [a, b] = expr
      const save = this.p;
      this.p++;
      const names: string[] = [];
      while (this.is("ident")) {
        names.push(this.next().v);
        if (this.isOp(",")) this.p++;
        else break;
      }
      if (this.isOp("]") && (this.isOp("=", 1) || this.isOp(":=", 1))) {
        this.p++;
        const op = this.next().v;
        return this.node("TupleDecl", line, { names, reassign: op === ":=", expr: this.expression() });
      }
      this.p = save;
    }
    if (this.isFuncDef()) return this.funcDef();
    if (this.tryType()) {
      const name = this.next().v;
      this.expectOp("=");
      return this.node("VarDecl", line, { name, mode: "", expr: this.expression() });
    }
    if (tk.t === "ident" && this.peek(1)?.t === "op") {
      const op = this.peek(1).v;
      if (op === "=") {
        this.p += 2;
        return this.node("VarDecl", line, { name: tk.v, mode: "", expr: this.expression() });
      }
      if ([":=", "+=", "-=", "*=", "/=", "%="].includes(op)) {
        this.p += 2;
        return this.node("Assign", line, { name: tk.v, op, expr: this.expression() });
      }
    }
    const expr = this.expression();
    if (this.peek().t === "op" && [":=", "+=", "-=", "*=", "/=", "%="].includes(this.peek().v) && (expr.k === "Member" || (expr.k === "Ident" && expr.name.includes(".")))) {
      const op = this.next().v;
      return this.node("FieldAssign", line, { target: expr, op, expr: this.expression() });
    }
    return this.node("ExprStmt", line, { expr });
  }

  private typeDef(): Node {
    const line = this.next().line; // type
    const name = this.next();
    if (name.t !== "ident") throw new PineError("Falta el nombre del tipo", line);
    this.userTypes.add(name.v);
    this.skipNl();
    const fields: { name: string; def: Node | null }[] = [];
    if (this.is("indent")) {
      this.p++;
      this.skipNl();
      while (!this.is("dedent") && !this.is("eof")) {
        if (this.is("kw", "varip")) this.p++;
        this.tryType();
        const f = this.next();
        if (f.t !== "ident") throw new PineError("Campo no válido en el tipo", f.line);
        let def: Node | null = null;
        if (this.isOp("=")) {
          this.p++;
          def = this.expression();
        }
        fields.push({ name: f.v, def });
        this.skipNl();
      }
      if (this.is("dedent")) this.p++;
    }
    return this.node("TypeDef", line, { name: name.v, fields });
  }

  private enumDef(): Node {
    const line = this.next().line; // enum
    const name = this.next();
    if (name.t !== "ident") throw new PineError("Falta el nombre del enum", line);
    this.skipNl();
    const members: { name: string; title: string }[] = [];
    if (this.is("indent")) {
      this.p++;
      this.skipNl();
      while (!this.is("dedent") && !this.is("eof")) {
        const f = this.next();
        let title = f.v;
        if (this.isOp("=")) {
          this.p++;
          const t = this.next();
          title = t.v;
        }
        members.push({ name: f.v, title });
        this.skipNl();
      }
      if (this.is("dedent")) this.p++;
    }
    return this.node("EnumDef", line, { name: name.v, members });
  }

  private funcDef(): Node {
    const line = this.peek().line;
    const name = this.next().v;
    this.expectOp("(");
    const params: { name: string; def: Node | null; type: string | null }[] = [];
    while (!this.isOp(")")) {
      const typed = this.tryType();
      const ptype = typed ? this.lastType : null;
      const pn = this.next();
      if (pn.t !== "ident") throw new PineError("Parámetro no válido", pn.line);
      let def: Node | null = null;
      if (this.isOp("=")) {
        this.p++;
        def = this.expression();
      }
      params.push({ name: pn.v, def, type: ptype });
      if (this.isOp(",")) this.p++;
    }
    this.expectOp(")");
    this.expectOp("=>");
    const body = this.is("nl") ? this.block() : this.node("Block", line, { body: [this.node("ExprStmt", line, { expr: this.expression() })] });
    return this.node("FuncDef", line, { name, params, body });
  }

  private ifNode(): Node {
    const line = this.next().line; // if
    const cond = this.expression();
    const then = this.block();
    let els: Node | null = null;
    // else / else if
    const save = this.p;
    this.skipNl();
    if (this.is("kw", "else")) {
      this.p++;
      if (this.is("kw", "if")) {
        const inner = this.ifNode();
        els = this.node("Block", inner.line, { body: [inner] });
      } else els = this.block();
    } else this.p = save;
    return this.node("If", line, { cond, then, els });
  }

  private forNode(): Node {
    const line = this.next().line; // for
    if (this.isOp("[")) {
      this.p++;
      const a = this.next().v;
      this.expectOp(",");
      const b = this.next().v;
      this.expectOp("]");
      if (!this.is("kw", "in")) throw new PineError("Se esperaba «in»", line);
      this.p++;
      const arr = this.expression();
      return this.node("ForIn", line, { idx: a, name: b, arr, body: this.block() });
    }
    const name = this.next();
    if (name.t !== "ident") throw new PineError("Falta la variable del bucle", line);
    if (this.is("kw", "in")) {
      this.p++;
      const arr = this.expression();
      return this.node("ForIn", line, { idx: null, name: name.v, arr, body: this.block() });
    }
    this.expectOp("=");
    const from = this.expression();
    if (!this.is("kw", "to")) throw new PineError("Se esperaba «to» en el for", line);
    this.p++;
    const to = this.expression();
    let step: Node | null = null;
    if (this.is("kw", "by")) {
      this.p++;
      step = this.expression();
    }
    return this.node("For", line, { name: name.v, from, to, step, body: this.block() });
  }

  private switchNode(): Node {
    const line = this.next().line; // switch
    const subject = this.is("nl") ? null : this.expression();
    this.skipNl();
    if (!this.is("indent")) throw new PineError("Falta el bloque del switch", line);
    this.p++;
    const cases: { cond: Node | null; body: Node }[] = [];
    this.skipNl();
    while (!this.is("dedent") && !this.is("eof")) {
      let cond: Node | null = null;
      if (!this.isOp("=>")) cond = this.expression();
      this.expectOp("=>");
      const body = this.is("nl") ? this.block() : this.node("Block", line, { body: [this.statement()] });
      cases.push({ cond, body });
      this.skipNl();
    }
    if (this.is("dedent")) this.p++;
    return this.node("Switch", line, { subject, cases });
  }

  // ------------------------------------------------------------ expresiones

  expression(): Node {
    if (this.is("kw", "if")) return this.ifNode();
    if (this.is("kw", "switch")) return this.switchNode();
    return this.ternary();
  }

  private ternary(): Node {
    const cond = this.or();
    if (this.isOp("?")) {
      const line = this.next().line;
      const a = this.expression();
      this.expectOp(":");
      const b = this.expression();
      return this.node("Ternary", line, { cond, a, b });
    }
    return cond;
  }

  private or(): Node {
    let l = this.and();
    while (this.is("kw", "or")) {
      const line = this.next().line;
      l = this.node("Binary", line, { op: "or", l, r: this.and() });
    }
    return l;
  }
  private and(): Node {
    let l = this.equality();
    while (this.is("kw", "and")) {
      const line = this.next().line;
      l = this.node("Binary", line, { op: "and", l, r: this.equality() });
    }
    return l;
  }
  private equality(): Node {
    let l = this.comparison();
    while (this.isOp("==") || this.isOp("!=")) {
      const tk = this.next();
      l = this.node("Binary", tk.line, { op: tk.v, l, r: this.comparison() });
    }
    return l;
  }
  private comparison(): Node {
    let l = this.additive();
    while (this.isOp("<") || this.isOp(">") || this.isOp("<=") || this.isOp(">=")) {
      const tk = this.next();
      l = this.node("Binary", tk.line, { op: tk.v, l, r: this.additive() });
    }
    return l;
  }
  private additive(): Node {
    let l = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const tk = this.next();
      l = this.node("Binary", tk.line, { op: tk.v, l, r: this.multiplicative() });
    }
    return l;
  }
  private multiplicative(): Node {
    let l = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const tk = this.next();
      l = this.node("Binary", tk.line, { op: tk.v, l, r: this.unary() });
    }
    return l;
  }
  private unary(): Node {
    if (this.is("kw", "not")) {
      const line = this.next().line;
      return this.node("Unary", line, { op: "not", e: this.unary() });
    }
    if (this.isOp("-") || this.isOp("+")) {
      const tk = this.next();
      return this.node("Unary", tk.line, { op: tk.v, e: this.unary() });
    }
    return this.postfix();
  }

  private postfix(): Node {
    let e = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        const line = this.next().line;
        const name = this.next();
        if (name.t !== "ident" && name.t !== "kw") throw new PineError("Nombre no válido tras «.»", line);
        if (e.k === "Ident") e = this.node("Ident", e.line, { name: e.name + "." + name.v });
        else e = this.node("Member", line, { obj: e, prop: name.v });
        continue;
      }
      if (this.isOp("<") && this.is("ident", undefined, 1)) {
        // genéricos: array.new<float>(...)
        let j = this.p;
        let d = 0;
        let ok = false;
        for (; j < this.toks.length; j++) {
          const tk = this.toks[j];
          if (tk.t === "op" && tk.v === "<") d++;
          else if (tk.t === "op" && tk.v === ">") {
            d--;
            if (d === 0) {
              ok = this.toks[j + 1]?.t === "op" && this.toks[j + 1].v === "(";
              break;
            }
          } else if (tk.t !== "ident" && !(tk.t === "op" && (tk.v === "." || tk.v === ","))) break;
        }
        if (ok) {
          this.p = j + 1;
          continue;
        }
      }
      if (this.isOp("(")) {
        const line = this.next().line;
        const args: Node[] = [];
        const named: Record<string, Node> = {};
        while (!this.isOp(")")) {
          if (this.is("ident") && this.isOp("=", 1)) {
            const n = this.next().v;
            this.p++;
            named[n] = this.expression();
          } else args.push(this.expression());
          if (this.isOp(",")) this.p++;
          else if (!this.isOp(")")) throw new PineError("Se esperaba «,» o «)»", this.peek().line);
        }
        this.p++;
        e = this.node("Call", line, { callee: e, args, named });
        continue;
      }
      if (this.isOp("[")) {
        const line = this.next().line;
        const idx = this.expression();
        this.expectOp("]");
        e = this.node("Index", line, { obj: e, idx });
        continue;
      }
      return e;
    }
  }

  private primary(): Node {
    const tk = this.next();
    switch (tk.t) {
      case "num":
        return this.node("Num", tk.line, { v: parseFloat(tk.v), int: !/[.eE]/.test(tk.v) });
      case "str":
        return this.node("Str", tk.line, { v: tk.v });
      case "color":
        return this.node("Color", tk.line, { v: tk.v });
      case "ident":
        return this.node("Ident", tk.line, { name: tk.v });
      case "kw":
        if (tk.v === "true" || tk.v === "false") return this.node("Bool", tk.line, { v: tk.v === "true" });
        if (tk.v === "na") return this.node("Na", tk.line);
        break;
      case "op":
        if (tk.v === "(") {
          const e = this.expression();
          this.expectOp(")");
          return e;
        }
        if (tk.v === "[") {
          const items: Node[] = [];
          while (!this.isOp("]")) {
            items.push(this.expression());
            if (this.isOp(",")) this.p++;
          }
          this.p++;
          return this.node("ArrayLit", tk.line, { items });
        }
        break;
    }
    throw new PineError(`No se esperaba «${tk.v || tk.t}»`, tk.line);
  }
}

export function parsePine(src: string): Node {
  return new Parser(src).parseProgram();
}
