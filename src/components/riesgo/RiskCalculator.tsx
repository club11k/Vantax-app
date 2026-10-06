"use client";

import { useMemo, useState } from "react";

// Calculadora de riesgo — rediseño visual fase 2 (Esther, 06/10/2026).
// Los cálculos son EXACTAMENTE los mismos que antes (mismas fórmulas, mismo
// valor de pip, mismos valores por defecto); solo cambia cómo se presentan:
// resultado clave en grande, semáforo de riesgo en "Rangos con promedios",
// barras por entrada, gráficos de evolución en diaria/mensual y barra
// riesgo/beneficio en "Ratios".

type TopTab = "ratios" | "promedios" | "diaria" | "mensual";
type Mode = "lote" | "sl";
type RiskType = "pct" | "usd";

// Mismo valor que usa la calculadora de Riesgo Avanzado de Club 11K:
// a lote 0.01, 10 pips equivalen a 1 $ (0.01 lote × 10 $/pip/lote = 0.1 $/pip).
// Es una constante interna, no un campo que el usuario tenga que tocar.
const PIP_VALUE_PER_LOT = 10;

const RATIO_PRESETS = [1, 1.5, 2, 3, 4];

function parseNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pillStyle(active: boolean): React.CSSProperties {
  return active ? { borderColor: "var(--violet)", background: "var(--violet-dim)", color: "var(--violet-bright)" } : {};
}

/* Campo de número con su unidad dentro ($, pips, lotes...) */
function Field({
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="calc-field">
      <label>{label}</label>
      <div className="calc-input-wrap">
        <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        {unit && <span className="calc-unit">{unit}</span>}
      </div>
      {hint && <div className="calc-hint">{hint}</div>}
    </div>
  );
}

/* Gráfico de línea sencillo (SVG) para la evolución del balance */
function LineChart({ values, labelStart, labelEnd }: { values: number[]; labelStart: string; labelEnd: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const X = (i: number) => 20 + (i / (values.length - 1)) * 560;
  const Y = (v: number) => 220 - ((v - lo) / span) * 200;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 600 260" style={{ width: "100%", height: "auto" }} role="img" aria-label="Evolución del balance">
      <defs>
        <linearGradient id="calcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A78BFA" stopOpacity="0.32" />
          <stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#2E2447">
        <line x1="20" y1="20" x2="580" y2="20" />
        <line x1="20" y1="120" x2="580" y2="120" />
        <line x1="20" y1="220" x2="580" y2="220" />
      </g>
      <path d={`${line} L580 220 L20 220 Z`} fill="url(#calcArea)" />
      <path d={line} fill="none" stroke="#A78BFA" strokeWidth={3} strokeLinejoin="round" />
      <g fill="#A39DB3" fontSize="12" fontFamily="IBM Plex Mono, monospace">
        <text x="20" y="244">{labelStart}</text>
        <text x="580" y="244" textAnchor="end">
          {labelEnd}
        </text>
        <text x="24" y="38">{fmt(hi, 0)}</text>
        <text x="24" y="214">{fmt(lo, 0)}</text>
      </g>
    </svg>
  );
}

export function RiskCalculator() {
  const [topTab, setTopTab] = useState<TopTab>("promedios");
  const tabs: { key: TopTab; label: string }[] = [
    { key: "promedios", label: "Rangos con promedios" },
    { key: "diaria", label: "Calculadora diaria" },
    { key: "mensual", label: "Calculadora mensual" },
    { key: "ratios", label: "Ratios" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="calc-tabs" role="tablist" aria-label="Calculadoras">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={topTab === t.key}
            className={`calc-tab ${topTab === t.key ? "active" : ""}`}
            onClick={() => setTopTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {topTab === "promedios" && <PromediosCalculator />}
      {topTab === "diaria" && <DiariaCalculator />}
      {topTab === "mensual" && <MensualCalculator />}
      {topTab === "ratios" && <RatiosCalculator />}

      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Cálculo con valor estándar del pip (lote 0,01 = 0,10 $ por pip), sin spread ni swap. Herramienta orientativa.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña "Calculadora diaria": réplica de la pestaña "Calculadora    */
/* diaria" de Club 11K — pips fijos cada día de trading, ganancia      */
/* acumulada día a día hasta el balance final.                        */
/* ------------------------------------------------------------------ */

type DiaRow = { dia: number; pips: number; ganancia: number; acumulada: number; balance: number };

function DiariaCalculator() {
  const [balance, setBalance] = useState("10000");
  const [pipsDiarios, setPipsDiarios] = useState("500");
  const [lotaje, setLotaje] = useState("0.03");
  const [diasOperados, setDiasOperados] = useState("22");

  const balanceNum = parseNum(balance);
  const pipsNum = parseNum(pipsDiarios);
  const lotajeNum = parseNum(lotaje);
  const diasNum = Math.max(0, Math.min(366, Math.round(parseNum(diasOperados))));

  const ganPorDia = pipsNum * lotajeNum * PIP_VALUE_PER_LOT;

  const rows: DiaRow[] = useMemo(() => {
    const out: DiaRow[] = [];
    let acumulada = 0;
    for (let d = 1; d <= diasNum; d++) {
      acumulada += ganPorDia;
      out.push({ dia: d, pips: pipsNum, ganancia: ganPorDia, acumulada, balance: balanceNum + acumulada });
    }
    return out;
  }, [diasNum, ganPorDia, pipsNum, balanceNum]);

  const totalPips = pipsNum * diasNum;
  const totalGanancia = ganPorDia * diasNum;
  const balanceFinal = balanceNum + totalGanancia;
  const pctGanancia = balanceNum > 0 ? (totalGanancia / balanceNum) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 14 }}>
        <Field label="Balance inicial" unit="$" value={balance} onChange={setBalance} />
        <Field label="Pips diarios" unit="pips" value={pipsDiarios} onChange={setPipsDiarios} />
        <Field label="Lotaje" unit="lotes" value={lotaje} onChange={setLotaje} />
        <Field label="Días operados" unit="días" value={diasOperados} onChange={setDiasOperados} />
      </div>

      <div className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 16 }}>
        <div>
          <div className="calc-big-label">Balance final</div>
          <div className="calc-big" style={{ fontSize: "clamp(26px, 4vw, 34px)" }}>{fmt(balanceFinal)} $</div>
        </div>
        <div>
          <div className="calc-big-label">Ganancia total</div>
          <div className="calc-big" style={{ fontSize: 26, color: "var(--up)" }}>+{fmt(totalGanancia)} $</div>
          <div className="calc-hint" style={{ marginTop: 2 }}>+{fmt(pctGanancia, 1)} % sobre el balance</div>
        </div>
        <div>
          <div className="calc-big-label">Por día</div>
          <div className="calc-big" style={{ fontSize: 26 }}>+{fmt(ganPorDia)} $</div>
        </div>
        <div>
          <div className="calc-big-label">Total pips</div>
          <div className="calc-big" style={{ fontSize: 26 }}>{fmt(totalPips, 0)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>Indica los días operados para ver la evolución día a día.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div className="panel" style={{ flex: "3 1 440px", minWidth: 0 }}>
            <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Evolución del balance</h2>
            <LineChart values={[balanceNum, ...rows.map((r) => r.balance)]} labelStart="Inicio" labelEnd={`Día ${diasNum}`} />
          </div>
          <div className="panel" style={{ flex: "2 1 320px", minWidth: 0 }}>
            <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Día a día</h2>
            <div className="calc-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Pips</th>
                    <th style={{ textAlign: "right" }}>Acumulado $</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.dia}>
                      <td>{r.dia}</td>
                      <td>{fmt(r.pips, 0)}</td>
                      <td style={{ color: "var(--up)", textAlign: "right", fontFamily: "var(--font-mono)" }}>+{fmt(r.acumulada)}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmt(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña "Calculadora mensual": réplica de la pestaña "Calculadora   */
/* mensual" de Club 11K — proyección a 12 meses reinvirtiendo siempre  */
/* sobre el mismo capital inicial (sin componer el lote).             */
/* ------------------------------------------------------------------ */

type MesRow = { mes: number; capitalInicial: number; ganAcumuladas: number; capitalTotal: number };

function MensualCalculator() {
  const [balance, setBalance] = useState("10000");
  const [pipsDiarios, setPipsDiarios] = useState("500");
  const [lotaje, setLotaje] = useState("0.01");
  const [diasOperadosMes, setDiasOperadosMes] = useState("22");

  const balanceNum = parseNum(balance);
  const pipsNum = parseNum(pipsDiarios);
  const lotajeNum = parseNum(lotaje);
  const diasMesNum = parseNum(diasOperadosMes);

  const pipsMensuales = pipsNum * diasMesNum;
  const ganMensual = pipsMensuales * lotajeNum * PIP_VALUE_PER_LOT;

  const rows: MesRow[] = useMemo(() => {
    const out: MesRow[] = [];
    for (let m = 1; m <= 12; m++) {
      const ganAcumuladas = ganMensual * m;
      out.push({ mes: m, capitalInicial: balanceNum, ganAcumuladas, capitalTotal: balanceNum + ganAcumuladas });
    }
    return out;
  }, [ganMensual, balanceNum]);

  const finalAnual = rows[rows.length - 1]?.capitalTotal ?? balanceNum;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 14 }}>
        <Field label="Balance inicial" unit="$" value={balance} onChange={setBalance} />
        <Field label="Pips diarios" unit="pips" value={pipsDiarios} onChange={setPipsDiarios} />
        <Field label="Lotaje" unit="lotes" value={lotaje} onChange={setLotaje} />
        <Field label="Días operados al mes" unit="días" value={diasOperadosMes} onChange={setDiasOperadosMes} />
      </div>

      <div className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 16 }}>
        <div>
          <div className="calc-big-label">Capital a 12 meses</div>
          <div className="calc-big" style={{ fontSize: "clamp(26px, 4vw, 34px)" }}>{fmt(finalAnual)} $</div>
        </div>
        <div>
          <div className="calc-big-label">Ganancia mensual</div>
          <div className="calc-big" style={{ fontSize: 26, color: "var(--up)" }}>+{fmt(ganMensual)} $</div>
        </div>
        <div>
          <div className="calc-big-label">Pips mensuales</div>
          <div className="calc-big" style={{ fontSize: 26 }}>{fmt(pipsMensuales, 0)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div className="panel" style={{ flex: "3 1 440px", minWidth: 0 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Evolución del capital</h2>
          <LineChart values={[balanceNum, ...rows.map((r) => r.capitalTotal)]} labelStart="Inicio" labelEnd="Mes 12" />
        </div>
        <div className="panel" style={{ flex: "2 1 320px", minWidth: 0 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Mes a mes</h2>
          <div className="calc-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th style={{ textAlign: "right" }}>Gan. acumuladas</th>
                  <th style={{ textAlign: "right" }}>Capital total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.mes}>
                    <td>{r.mes}</td>
                    <td style={{ color: "var(--up)", textAlign: "right", fontFamily: "var(--font-mono)" }}>+{fmt(r.ganAcumuladas)}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmt(r.capitalTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Cada mes reparte la misma ganancia mensual sobre el capital inicial (no compone el lote mes a mes) — igual que
        tu calculadora mensual de Club 11K.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña "Rangos con promedios": réplica y ampliación de la pestaña  */
/* "Riesgo Avanzado" de la calculadora de Club 11K — una escalera de   */
/* entradas separadas por una distancia fija en pips, mismo lote en   */
/* todas, hasta el total de pips que definas como Stop Loss.          */
/* ------------------------------------------------------------------ */

type PromedioEntry = { n: number; lote: number; pipsPerdida: number; perdidaUsd: number };

// Semáforo de riesgo según el % de la cuenta que se pierde si salta el SL.
function riskLevel(dd: number) {
  if (dd < 5) return { label: "RIESGO BAJO", color: "#C4B5FD", bg: "rgba(167,139,250,0.16)" };
  if (dd < 15) return { label: "RIESGO MODERADO", color: "#E8B84A", bg: "rgba(232,184,74,0.14)" };
  if (dd < 30) return { label: "RIESGO ALTO", color: "#FDBA74", bg: "rgba(253,186,116,0.14)" };
  return { label: "RIESGO EXTREMO", color: "#F472B6", bg: "rgba(244,114,182,0.14)" };
}

function PromediosCalculator() {
  const [balance, setBalance] = useState("300");
  const [lotaje, setLotaje] = useState("0.01");
  const [distancia, setDistancia] = useState("100");
  const [totalPipsSL, setTotalPipsSL] = useState("600");

  const balanceNum = parseNum(balance);
  const lotajeNum = parseNum(lotaje);
  const distanciaNum = parseNum(distancia);
  const totalPipsSLNum = parseNum(totalPipsSL);

  const entries: PromedioEntry[] = useMemo(() => {
    if (distanciaNum <= 0 || totalPipsSLNum <= 0 || lotajeNum <= 0) return [];
    const rows: PromedioEntry[] = [];
    let n = 1;
    while (n <= 500) {
      const pipsPerdida = totalPipsSLNum - (n - 1) * distanciaNum;
      if (pipsPerdida <= 0) break;
      rows.push({ n, lote: lotajeNum, pipsPerdida, perdidaUsd: pipsPerdida * lotajeNum * PIP_VALUE_PER_LOT });
      n++;
    }
    return rows;
  }, [distanciaNum, totalPipsSLNum, lotajeNum]);

  const totalPerdida = entries.reduce((acc, e) => acc + e.perdidaUsd, 0);
  const drawdownPct = balanceNum > 0 ? (totalPerdida / balanceNum) * 100 : 0;
  const numEntradas = entries.length;
  const loteTotal = numEntradas * lotajeNum;

  // Con el mismo lote en todas las entradas, el precio medio (breakeven) de
  // la cesta es la media simple de los offsets de cada entrada respecto a
  // la primera (que se asume abierta al precio de mercado, offset 0).
  const avgOffsetPips = numEntradas > 0 ? (distanciaNum * (numEntradas - 1)) / 2 : 0;

  const dd = Math.abs(drawdownPct);
  const lvl = riskLevel(dd);
  // Escala no lineal para la barra: 0-5-15-30-100 % ocupan un cuarto cada tramo.
  const meter = dd <= 5 ? (dd / 5) * 25 : dd <= 15 ? 25 + ((dd - 5) / 10) * 25 : dd <= 30 ? 50 + ((dd - 15) / 15) * 25 : 75 + (Math.min(100, dd) - 30) / 70 * 25;
  const maxLoss = entries.length ? entries[0].perdidaUsd : 1;

  return (
    <div className="calc-layout">
      <div className="panel calc-inputs">
        <h2 style={{ fontSize: 18, margin: 0 }}>Datos de la cesta</h2>
        <Field label="Balance cuenta" unit="$" value={balance} onChange={setBalance} />
        <Field label="Lotaje (igual en cada entrada)" unit="lotes" value={lotaje} onChange={setLotaje} />
        <Field label="Distancia entre promedios" unit="pips" value={distancia} onChange={setDistancia} />
        <Field
          label="Total de pips en SL"
          unit="pips"
          value={totalPipsSL}
          onChange={setTotalPipsSL}
          hint="Es el movimiento máximo en contra que asumes: ahí se cierra toda la cesta (tu Stop Loss)."
        />
      </div>

      <div className="calc-results">
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 18, borderColor: lvl.color + "66" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div className="calc-big-label">Si salta el Stop Loss pierdes</div>
              <div className="calc-big" style={{ color: lvl.color }}>-{fmt(totalPerdida)} $</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <span className="calc-risk-badge" style={{ background: lvl.bg, color: lvl.color }}>
                {lvl.label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: lvl.color }}>
                -{fmt(dd)} % de la cuenta
              </span>
            </div>
          </div>
          <div>
            <div className="calc-meter">
              <div className="calc-meter-fill" style={{ width: `${meter}%`, background: lvl.color }} />
            </div>
            <div className="calc-meter-scale">
              <span>0 %</span>
              <span>5 %</span>
              <span>15 %</span>
              <span>30 %</span>
              <span>100 %</span>
            </div>
          </div>
          <div className="calc-mini-grid">
            <div className="calc-mini">
              <span>Nº de entradas</span>
              <b>{numEntradas}</b>
            </div>
            <div className="calc-mini">
              <span>Lote total de la cesta</span>
              <b>{fmt(loteTotal, 2)}</b>
            </div>
            <div className="calc-mini">
              <span>Breakeven</span>
              <b>{avgOffsetPips > 0 ? fmt(avgOffsetPips, 1) : "—"}</b>
              <small>pips desde tu 1.ª entrada</small>
            </div>
          </div>
          <div className="calc-hint" style={{ marginTop: 0 }}>
            El precio medio es el nivel al que, si vuelve el mercado, toda la cesta queda en 0 (sin contar spread/swap) —
            calculado con el mismo lote en cada entrada, separadas {fmt(distanciaNum, 0)} pips entre sí.
          </div>
        </div>

        <div className="panel">
          <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Pérdida por entrada</h2>
          {entries.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>
              Ajusta el lotaje, la distancia entre promedios y el total de pips en SL para ver la escalera de entradas.
            </p>
          ) : (
            <div className="calc-scroll" style={{ maxHeight: 420 }}>
              {entries.map((e) => (
                <div key={e.n} className="calc-entry">
                  <span className="calc-entry-n">{e.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
                      {fmt(e.pipsPerdida, 0)} pips · {fmt(e.lote, 2)} lotes
                    </span>
                    <div className="calc-entry-bar">
                      <span style={{ width: `${(e.perdidaUsd / maxLoss) * 100}%` }} />
                    </div>
                  </div>
                  <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--down)" }}>-{fmt(e.perdidaUsd)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña "Ratios": calculadora de Stop Loss / Take Profit a partir   */
/* de un ratio riesgo:beneficio (1:1, 1:2, 1:3...) para una operación  */
/* suelta (sin escalera de promedios).                                */
/* ------------------------------------------------------------------ */

function RatiosCalculator() {
  const [mode, setMode] = useState<Mode>("lote");

  const [balance, setBalance] = useState("1000");
  const [riskType, setRiskType] = useState<RiskType>("pct");
  const [riskValue, setRiskValue] = useState("1");

  const [ratio, setRatio] = useState(2);
  const [ratioCustom, setRatioCustom] = useState("");

  const [lote, setLote] = useState("0.01");
  const [slPipsInput, setSlPipsInput] = useState("300");

  const effectiveRatio = ratioCustom.trim() !== "" ? parseNum(ratioCustom) : ratio;

  const balanceNum = parseNum(balance);
  const riskValueNum = parseNum(riskValue);
  const riskAmount = riskType === "pct" ? (balanceNum * riskValueNum) / 100 : riskValueNum;
  const riskPct = balanceNum > 0 ? (riskAmount / balanceNum) * 100 : 0;

  const loteNum = parseNum(lote);
  const slPipsManual = parseNum(slPipsInput);

  const result = useMemo(() => {
    if (mode === "lote") {
      const valuePerPip = loteNum * PIP_VALUE_PER_LOT;
      const slPips = valuePerPip > 0 ? riskAmount / valuePerPip : 0;
      const tpPips = slPips * effectiveRatio;
      return { slPips, tpPips, lote: loteNum, gain: riskAmount * effectiveRatio };
    }
    const slPips = slPipsManual;
    const valuePerPipNeeded = slPips > 0 ? riskAmount / slPips : 0;
    const loteCalc = valuePerPipNeeded / PIP_VALUE_PER_LOT;
    const tpPips = slPips * effectiveRatio;
    return { slPips, tpPips, lote: loteCalc, gain: riskAmount * effectiveRatio };
  }, [mode, loteNum, riskAmount, effectiveRatio, slPipsManual]);

  const loteRounded = Math.max(0, Math.floor(result.lote * 100) / 100);
  const rrTotal = 1 + Math.max(0, effectiveRatio);

  return (
    <div className="calc-layout">
      <div className="panel calc-inputs">
        <div className="calc-tabs" role="tablist" aria-label="Modo" style={{ alignSelf: "stretch" }}>
          <button type="button" role="tab" aria-selected={mode === "lote"} className={`calc-tab ${mode === "lote" ? "active" : ""}`} onClick={() => setMode("lote")} style={{ flex: 1 }}>
            Lote → Stop Loss
          </button>
          <button type="button" role="tab" aria-selected={mode === "sl"} className={`calc-tab ${mode === "sl" ? "active" : ""}`} onClick={() => setMode("sl")} style={{ flex: 1 }}>
            Stop Loss → lote
          </button>
        </div>

        <Field label="Balance de la cuenta" unit="$" value={balance} onChange={setBalance} />

        <div className="calc-field">
          <label>Riesgo por operación</label>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="calc-input-wrap" style={{ flex: 1 }}>
              <input type="text" inputMode="decimal" value={riskValue} onChange={(e) => setRiskValue(e.target.value)} aria-label="Riesgo por operación" />
            </div>
            <button type="button" className="btn" style={{ padding: "0 14px", ...pillStyle(riskType === "pct") }} onClick={() => setRiskType("pct")}>
              %
            </button>
            <button type="button" className="btn" style={{ padding: "0 14px", ...pillStyle(riskType === "usd") }} onClick={() => setRiskType("usd")}>
              $
            </button>
          </div>
        </div>

        {mode === "lote" ? (
          <Field label="Lote a operar" unit="lotes" value={lote} onChange={setLote} />
        ) : (
          <Field label="Stop Loss" unit="pips" value={slPipsInput} onChange={setSlPipsInput} />
        )}

        <div className="calc-field">
          <label>Ratio riesgo : beneficio</label>
          <div className="pill-row">
            {RATIO_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                className="btn"
                style={pillStyle(ratioCustom.trim() === "" && ratio === r)}
                onClick={() => {
                  setRatio(r);
                  setRatioCustom("");
                }}
              >
                1 : {r}
              </button>
            ))}
            <input
              type="text"
              inputMode="decimal"
              placeholder="Otro"
              value={ratioCustom}
              onChange={(e) => setRatioCustom(e.target.value)}
              style={{ width: 100 }}
              aria-label="Ratio personalizado"
            />
          </div>
        </div>
      </div>

      <div className="calc-results">
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="calc-big-label">Resultado — ratio 1 : {fmt(effectiveRatio, effectiveRatio % 1 === 0 ? 0 : 1)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between" }}>
            <div>
              <div className="calc-big-label">{mode === "lote" ? "Stop Loss necesario" : "Lote recomendado"}</div>
              <div className="calc-big">{mode === "lote" ? `${fmt(result.slPips, 1)} pips` : `${fmt(loteRounded, 2)} lotes`}</div>
            </div>
            <div>
              <div className="calc-big-label">Take Profit</div>
              <div className="calc-big" style={{ color: "var(--up)" }}>{fmt(result.tpPips, 1)} pips</div>
            </div>
          </div>

          <div>
            <div className="calc-rr" aria-hidden="true">
              <span style={{ width: `${(1 / rrTotal) * 100}%`, background: "var(--down)" }} />
              <span style={{ width: `${(Math.max(0, effectiveRatio) / rrTotal) * 100}%`, background: "var(--violet)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 14 }}>
              <span style={{ color: "var(--down)" }}>
                Riesgo -{fmt(riskAmount)} $ ({fmt(riskPct, 2)} %)
              </span>
              <span style={{ color: "var(--up)" }}>Beneficio +{fmt(result.gain)} $</span>
            </div>
          </div>

          {mode === "sl" && (
            <div className="calc-hint" style={{ marginTop: 0 }}>
              Lote exacto sin redondear: {fmt(result.lote, 4)} — se muestra redondeado hacia abajo a 0.01 para no superar el riesgo elegido.
            </div>
          )}

          <div className="calc-hint" style={{ marginTop: 0 }}>
            {mode === "lote"
              ? `Con ${fmt(loteNum, 2)} lotes y un riesgo de $${fmt(riskAmount)}, tu Stop Loss debe ir a ${fmt(result.slPips, 1)} pips para no arriesgar más de eso. Con el ratio elegido, tu Take Profit queda en ${fmt(result.tpPips, 1)} pips.`
              : `Para arriesgar $${fmt(riskAmount)} con un Stop Loss de ${fmt(result.slPips, 1)} pips, usa ${fmt(loteRounded, 2)} lotes. Con el ratio elegido, tu Take Profit queda en ${fmt(result.tpPips, 1)} pips.`}
          </div>
        </div>
      </div>
    </div>
  );
}
