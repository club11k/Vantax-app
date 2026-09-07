"use client";

import { useMemo, useState } from "react";

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
  return active
    ? { borderColor: "var(--violet)", background: "var(--violet-dim)", color: "var(--violet-bright)" }
    : {};
}

export function RiskCalculator() {
  const [topTab, setTopTab] = useState<TopTab>("promedios");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="pill-row">
        <button className="btn" style={pillStyle(topTab === "promedios")} onClick={() => setTopTab("promedios")}>
          Rangos con promedios
        </button>
        <button className="btn" style={pillStyle(topTab === "diaria")} onClick={() => setTopTab("diaria")}>
          Calculadora diaria
        </button>
        <button className="btn" style={pillStyle(topTab === "mensual")} onClick={() => setTopTab("mensual")}>
          Calculadora mensual
        </button>
        <button className="btn" style={pillStyle(topTab === "ratios")} onClick={() => setTopTab("ratios")}>
          Ratios
        </button>
      </div>

      {topTab === "promedios" && <PromediosCalculator />}
      {topTab === "diaria" && <DiariaCalculator />}
      {topTab === "mensual" && <MensualCalculator />}
      {topTab === "ratios" && <RatiosCalculator />}
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <div>
            <label>Balance inicial ($)</label>
            <input type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div>
            <label>Pips diarios</label>
            <input type="text" inputMode="decimal" value={pipsDiarios} onChange={(e) => setPipsDiarios(e.target.value)} />
          </div>
          <div>
            <label>Lotaje</label>
            <input type="text" inputMode="decimal" value={lotaje} onChange={(e) => setLotaje(e.target.value)} />
          </div>
          <div>
            <label>Días operados</label>
            <input type="text" inputMode="decimal" value={diasOperados} onChange={(e) => setDiasOperados(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Total pips</div>
          <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{fmt(totalPips, 0)}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Total ganancia ($)</div>
          <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--up)" }}>+{fmt(totalGanancia)}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Balance final ($)</div>
          <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{fmt(balanceFinal)}</div>
        </div>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Indica los días operados para ver la tabla día a día.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Día</th>
                <th>Pips</th>
                <th>Ganancia $</th>
                <th>Ganancia acumulada $</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dia}>
                  <td>{r.dia}</td>
                  <td>{fmt(r.pips, 0)}</td>
                  <td style={{ color: "var(--up)" }}>+{fmt(r.ganancia)}</td>
                  <td style={{ color: "var(--up)" }}>+{fmt(r.acumulada)}</td>
                  <td>{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <div>
            <label>Balance inicial ($)</label>
            <input type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div>
            <label>Pips diarios</label>
            <input type="text" inputMode="decimal" value={pipsDiarios} onChange={(e) => setPipsDiarios(e.target.value)} />
          </div>
          <div>
            <label>Lotaje</label>
            <input type="text" inputMode="decimal" value={lotaje} onChange={(e) => setLotaje(e.target.value)} />
          </div>
          <div>
            <label>Días operados al mes</label>
            <input type="text" inputMode="decimal" value={diasOperadosMes} onChange={(e) => setDiasOperadosMes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Pips mensuales</div>
          <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{fmt(pipsMensuales, 0)}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Ganancia mensual ($)</div>
          <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--up)" }}>+{fmt(ganMensual)}</div>
        </div>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Capital inicial</th>
              <th>Gan. acumuladas</th>
              <th>Capital total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mes}>
                <td>{r.mes}</td>
                <td>{fmt(r.capitalInicial)}</td>
                <td style={{ color: "var(--up)" }}>+{fmt(r.ganAcumuladas)}</td>
                <td>{fmt(r.capitalTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div>
            <label>Balance cuenta ($)</label>
            <input type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div>
            <label>Lotaje (igual en cada entrada)</label>
            <input type="text" inputMode="decimal" value={lotaje} onChange={(e) => setLotaje(e.target.value)} />
          </div>
          <div>
            <label>Distancia entre promedios (pips)</label>
            <input type="text" inputMode="decimal" value={distancia} onChange={(e) => setDistancia(e.target.value)} />
          </div>
          <div>
            <label>Total de pips en SL (ej. 600)</label>
            <input type="text" inputMode="decimal" value={totalPipsSL} onChange={(e) => setTotalPipsSL(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
              Es el movimiento máximo en contra que asumes: ahí se cierra toda la cesta (tu Stop Loss).
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        {entries.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            Ajusta el lotaje, la distancia entre promedios y el total de pips en SL para ver la escalera de entradas.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Lote</th>
                <th>Pips pérdida</th>
                <th>Pérdida ($)</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.n}>
                  <td>{e.n}</td>
                  <td>{fmt(e.lote, 2)}</td>
                  <td>{fmt(e.pipsPerdida, 0)}</td>
                  <td style={{ color: "var(--down)" }}>-{fmt(e.perdidaUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Nº de entradas</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{numEntradas}</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Lote total de la cesta</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{fmt(loteTotal, 2)}</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Pérdida total ($)</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--down)" }}>-{fmt(totalPerdida)}</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Drawdown (%)</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--down)" }}>-{fmt(Math.abs(drawdownPct))}%</div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Precio medio de la cesta (breakeven)
          </div>
          <div style={{ fontSize: 18, fontFamily: "var(--font-mono)" }}>
            {avgOffsetPips > 0 ? `${fmt(avgOffsetPips, 1)} pips desde tu 1ª entrada` : "—"}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          El precio medio es el nivel al que, si vuelve el mercado, toda la cesta queda en 0 (sin contar spread/swap) —
          calculado con el mismo lote en cada entrada, separadas {fmt(distanciaNum, 0)} pips entre sí.
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="pill-row">
        <button className="btn" style={pillStyle(mode === "lote")} onClick={() => setMode("lote")}>
          Desde mi lote → calcular Stop Loss
        </button>
        <button className="btn" style={pillStyle(mode === "sl")} onClick={() => setMode("sl")}>
          Desde mi Stop Loss → calcular lote
        </button>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div>
            <label>Balance de la cuenta ($)</label>
            <input type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div>
            <label>Riesgo por operación</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="text" inputMode="decimal" value={riskValue} onChange={(e) => setRiskValue(e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="btn" style={{ padding: "10px 12px", ...pillStyle(riskType === "pct") }} onClick={() => setRiskType("pct")}>
                %
              </button>
              <button type="button" className="btn" style={{ padding: "10px 12px", ...pillStyle(riskType === "usd") }} onClick={() => setRiskType("usd")}>
                $
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ marginBottom: 0 }}>Ratio riesgo : beneficio</label>
        <div className="pill-row">
          {RATIO_PRESETS.map((r) => (
            <button
              key={r}
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
            placeholder="Personalizado"
            value={ratioCustom}
            onChange={(e) => setRatioCustom(e.target.value)}
            style={{ width: 130 }}
          />
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {mode === "lote" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div>
              <label>Lote a operar</label>
              <input type="text" inputMode="decimal" value={lote} onChange={(e) => setLote(e.target.value)} />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div>
              <label>Stop Loss (en pips)</label>
              <input type="text" inputMode="decimal" value={slPipsInput} onChange={(e) => setSlPipsInput(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
          Resultado — ratio 1 : {fmt(effectiveRatio, effectiveRatio % 1 === 0 ? 0 : 1)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Riesgo asumido</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--down)" }}>
              -${fmt(riskAmount)} <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({fmt(riskPct, 2)}%)</span>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>
              {mode === "lote" ? "Stop Loss necesario" : "Lote recomendado"}
            </div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>
              {mode === "lote" ? `${fmt(result.slPips, 1)} pips` : `${fmt(loteRounded, 2)} lotes`}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Take Profit</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{fmt(result.tpPips, 1)} pips</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Beneficio potencial</div>
            <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--up)" }}>+${fmt(result.gain)}</div>
          </div>
        </div>

        {mode === "sl" && (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Lote exacto sin redondear: {fmt(result.lote, 4)} — se muestra redondeado hacia abajo a 0.01 para no superar el riesgo elegido.
          </div>
        )}

        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {mode === "lote"
            ? `Con ${fmt(loteNum, 2)} lotes y un riesgo de $${fmt(riskAmount)}, tu Stop Loss debe ir a ${fmt(result.slPips, 1)} pips para no arriesgar más de eso. Con el ratio elegido, tu Take Profit queda en ${fmt(result.tpPips, 1)} pips.`
            : `Para arriesgar $${fmt(riskAmount)} con un Stop Loss de ${fmt(result.slPips, 1)} pips, usa ${fmt(loteRounded, 2)} lotes. Con el ratio elegido, tu Take Profit queda en ${fmt(result.tpPips, 1)} pips.`}
        </div>
      </div>
    </div>
  );
}

