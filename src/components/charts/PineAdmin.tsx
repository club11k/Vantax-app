"use client";

import { useEffect, useRef, useState } from "react";

// Panel de admin de VANTAX CHARTS (28/10/2026): crear, probar y publicar
// indicadores pegando el código Pine de TradingView tal cual.

export type AdminIndicator = {
  id: string;
  name: string;
  description: string;
  code?: string;
  visibility?: "ALL" | "ADMIN" | "SELECTED";
  accessCount?: number;
};

type TestResult = { error: string | null; warnings: string[]; title?: string };

const VIS_LABEL = { ALL: "Todos", ADMIN: "Solo admin", SELECTED: "Usuarios elegidos" } as const;

const EXAMPLE = `//@version=5
indicator("Mi indicador", overlay=true)
len = input.int(20, "Periodo")
plot(ta.ema(close, len), "EMA", color=color.purple, linewidth=2)
`;

export function PineAdmin({
  indicators,
  onClose,
  onReload,
  onTest,
  onClearTest,
}: {
  indicators: AdminIndicator[];
  onClose: () => void;
  onReload: () => Promise<void>;
  onTest: (code: string) => Promise<TestResult>;
  onClearTest: () => void;
}) {
  const [editing, setEditing] = useState<AdminIndicator | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [visibility, setVisibility] = useState<"ALL" | "ADMIN" | "SELECTED">("ADMIN");
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "edit">("list");

  useEffect(() => () => onClearTest(), [onClearTest]);

  function open(ind: AdminIndicator | null) {
    setEditing(ind);
    setName(ind?.name ?? "");
    setDescription(ind?.description ?? "");
    setCode(ind?.code ?? EXAMPLE);
    setVisibility(ind?.visibility ?? "ADMIN");
    setResult(null);
    setMsg(null);
    setView("edit");
    onClearTest();
  }

  async function test() {
    setBusy(true);
    setResult(null);
    setMsg("Calculando en el gráfico…");
    const r = await onTest(code);
    setBusy(false);
    setMsg(null);
    setResult(r);
    if (!r.error && !name.trim() && r.title) setName(r.title);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setMsg("Comprobando en el gráfico…");
    const r = await onTest(code);
    setResult(r);
    setMsg(null);
    if (r.error) {
      setBusy(false);
      setMsg("Corrige el error antes de guardar.");
      return;
    }
    const body = JSON.stringify({ name: name.trim() || r.title || "Indicador", description, code, visibility });
    const res = await fetch(editing ? `/api/charts/indicators/${editing.id}` : "/api/charts/indicators", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      setMsg(json?.error ?? "No se ha podido guardar.");
      return;
    }
    onClearTest();
    await onReload();
    if (!editing && json?.id) setEditing({ id: json.id, name, description, code, visibility });
    setMsg("Guardado ✓ Ya aparece en «Indicadores» para quien tenga acceso.");
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`¿Borrar el indicador «${editing.name}»? Desaparecerá del gráfico de todos los usuarios.`)) return;
    setBusy(true);
    await fetch(`/api/charts/indicators/${editing.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    onClearTest();
    await onReload();
    setView("list");
  }

  return (
    <div className="pa-drawer" role="dialog" aria-label="Crear indicadores">
      <div className="pa-head">
        {view === "edit" ? (
          <button type="button" className="pa-back" onClick={() => { onClearTest(); setView("list"); }}>
            ← Indicadores
          </button>
        ) : (
          <b>Crear indicadores</b>
        )}
        <button type="button" className="pc-x" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>

      {view === "list" ? (
        <div className="pa-body">
          <p className="pa-help">
            Pega aquí el código Pine de tus indicadores de TradingView. Pruébalo en el gráfico y, cuando esté bien, elige quién lo puede usar.
          </p>
          <button type="button" className="pa-primary" onClick={() => open(null)}>
            + Nuevo indicador
          </button>
          <div className="pa-list">
            {indicators.length === 0 && <div className="pc-empty">Aún no has creado ningún indicador.</div>}
            {indicators.map((ind) => (
              <button key={ind.id} type="button" className="pa-item" onClick={() => open(ind)}>
                <span className="pa-item-name">{ind.name}</span>
                <span className={`pa-badge v-${(ind.visibility ?? "ADMIN").toLowerCase()}`}>
                  {VIS_LABEL[ind.visibility ?? "ADMIN"]}
                  {ind.visibility === "SELECTED" ? ` · ${ind.accessCount ?? 0}` : ""}
                </span>
                {ind.description && <span className="pa-item-desc">{ind.description}</span>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="pa-body">
          <label className="pa-label">Nombre</label>
          <input className="pa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Club 11K Pro Zones" maxLength={80} />
          <label className="pa-label">Descripción (opcional)</label>
          <input className="pa-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué hace, para qué sirve…" maxLength={500} />
          <label className="pa-label">Quién lo puede usar</label>
          <div className="pa-seg">
            {(["ADMIN", "ALL", "SELECTED"] as const).map((v) => (
              <button key={v} type="button" className={visibility === v ? "active" : ""} onClick={() => setVisibility(v)}>
                {VIS_LABEL[v]}
              </button>
            ))}
          </div>
          <label className="pa-label">Código Pine</label>
          <CodeArea value={code} onChange={setCode} errorLine={errorLine(result?.error)} />
          <div className="pa-actions">
            <button type="button" className="pa-secondary" onClick={test} disabled={busy}>
              ▶ Probar en el gráfico
            </button>
            <button type="button" className="pa-primary" onClick={save} disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {result && (
            <div className={`pa-result ${result.error ? "err" : "ok"}`}>
              {result.error ? (
                <>
                  <b>No se puede usar todavía</b>
                  <span>{result.error}</span>
                </>
              ) : (
                <>
                  <b>Funciona ✓</b>
                  <span>Ya lo ves en el gráfico (solo tú, hasta que lo guardes).</span>
                </>
              )}
              {result.warnings.map((w) => (
                <span key={w} className="pa-warn">
                  ⚠ {w}
                </span>
              ))}
            </div>
          )}
          {msg && <div className="pa-msg">{msg}</div>}
          {editing && visibility === "SELECTED" && <AccessList indicatorId={editing.id} onChange={onReload} />}
          {editing && (
            <button type="button" className="pa-danger" onClick={remove} disabled={busy}>
              Borrar indicador
            </button>
          )}
          <details className="pa-details">
            <summary>¿Qué partes de Pine funcionan?</summary>
            <p>
              <b>Sí:</b> ta.* (sma, ema, rma, wma, hma, rsi, macd, bb, atr, stoch, cci, dmi, supertrend, sar, pivothigh/low, highest/lowest, crossover…), math.*, inputs (se pueden cambiar
              desde el gráfico), plot, plotshape, plotchar, plotarrow, hline, fill, bgcolor, box, line, label, linefill, arrays, if/for/while/switch, funciones propias, tipos propios (type), method, enum, var, time() con sesiones, request.security y request.security_lower_tf (cualquier temporalidad de minutos, horas, días, semanas o meses, y otros símbolos del bróker),
              Pine v4, v5 y v6.
            </p>
            <p>
              <b>No:</b> temporalidades de segundos, strategy, library/import, map y matrix. Las tablas y barcolor se ignoran.
            </p>
            <p>La hora de las funciones de tiempo (hour, time con sesión…) es UTC salvo que el script indique la zona horaria, por ejemplo «Europe/Madrid».</p>
          </details>
        </div>
      )}
    </div>
  );
}

function errorLine(err: string | null | undefined): number | null {
  const m = err ? /^Línea (\d+)/.exec(err) : null;
  return m ? +m[1] : null;
}

function CodeArea({ value, onChange, errorLine }: { value: string; onChange: (v: string) => void; errorLine: number | null }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;
  return (
    <div className="pa-code">
      <div className="pa-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? "err" : ""}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            const t = el.selectionEnd;
            const next = value.slice(0, s) + "    " + value.slice(t);
            onChange(next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = s + 4;
            });
          }
        }}
      />
    </div>
  );
}

function AccessList({ indicatorId, onChange }: { indicatorId: string; onChange: () => Promise<void> }) {
  const [users, setUsers] = useState<{ id: string; email: string; name: string | null }[] | null>(null);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/charts/indicators/${indicatorId}/access`, { cache: "no-store" }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setUsers(json?.users ?? []);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorId]);

  async function add() {
    setErr(null);
    const res = await fetch(`/api/charts/indicators/${indicatorId}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setErr(json?.error ?? "No se ha podido dar acceso.");
      return;
    }
    setEmail("");
    await load();
    await onChange();
  }

  async function remove(userId: string) {
    await fetch(`/api/charts/indicators/${indicatorId}/access?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
    await load();
    await onChange();
  }

  return (
    <div className="pa-access">
      <label className="pa-label">Usuarios con acceso</label>
      <div className="pa-row">
        <input
          className="pa-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email del usuario"
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button type="button" className="pa-secondary" onClick={add}>
          Dar acceso
        </button>
      </div>
      {err && <div className="pa-msg err">{err}</div>}
      {users === null ? (
        <div className="pc-empty">Cargando…</div>
      ) : users.length === 0 ? (
        <div className="pc-empty">Nadie tiene acceso todavía.</div>
      ) : (
        users.map((u) => (
          <div key={u.id} className="pa-user">
            <span>{u.email}</span>
            <button type="button" className="pc-x" onClick={() => remove(u.id)} aria-label="Quitar acceso">
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}
