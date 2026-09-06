"use client";

import { useMemo, useState } from "react";

type TopTab = "ratios" | "promedios";
type Mode = "lote" | "sl";
type Direction = "compra" | "venta";
type RiskType = "pct" | "usd";

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
        <button className="btn" style={pillStyle(topTab === "ratios")} onClick={() => setTopTab("ratios")}>
          Ratios
        </button>
      </div>

      {topTab === "promedios" ? <PromediosCalculator /> : <RatiosCalculator />}
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
  const [pipValuePerLot, setPipValuePerLot] = useState("10");

  const [direction, setDirection] = useState<Direction>("compra");
  const [entryPrice, setEntryPrice] = useState("");
  const [priceStep, setPriceStep] = useState("0.01");

  const balanceNum = parseNum(balance);
  const lotajeNum = parseNum(lotaje);
  const distanciaNum = parseNum(distancia);
  const totalPipsSLNum = parseNum(totalPipsSL);
  const pipValueNum = parseNum(pipValuePerLot);
  const priceStepNum = parseNum(priceStep);
  const entryPriceNum = parseNum(entryPrice);

  const entries: PromedioEntry[] = useMemo(() => {
    if (distanciaNum <= 0 || totalPipsSLNum <= 0 || lotajeNum <= 0) return [];
    const rows: PromedioEntry[] = [];
    let n = 1;
    while (n <= 500) {
      const pipsPerdida = totalPipsSLNum - (n - 1) * distanciaNum;
      if (pipsPerdida <= 0) break;
      rows.push({ n, lote: lotajeNum, pipsPerdida, perdidaUsd: pipsPerdida * lotajeNum * pipValueNum });
      n++;
    }
    return rows;
  }, [distanciaNum, totalPipsSLNum, lotajeNum, pipValueNum]);

  const totalPerdida = entries.reduce((acc, e) => acc + e.perdidaUsd, 0);
  const drawdownPct = balanceNum > 0 ? (totalPerdida / balanceNum) * 100 : 0;
  const numEntradas = entries.length;
  const loteTotal = numEntradas * lotajeNum;

  // Con el mismo lote en todas las entradas, el precio medio (breakeven) de
  // la cesta es la media simple de los offsets de cada entrada respecto a
  // la primera (que se asume abierta al precio de mercado, offset 0).
  const avgOffsetPips = numEntradas > 0 ? (distanciaNum * (numEntradas - 1)) / 2 : 0;

  const priceLevels = useMemo(() => {
    if (entryPrice.trim() === "" || priceStepNum <= 0 || numEntradas === 0) return null;
    const breakevenDelta = avgOffsetPips * priceStepNum;
    const slDelta = totalPipsSLNum * priceStepNum;
    const breakevenPrice = direction === "compra" ? entryPriceNum - breakevenDelta : entryPriceNum + breakevenDelta;
    const slPrice = direction === "compra" ? entryPriceNum - slDelta : entryPriceNum + slDelta;
    return { breakevenPrice, slPrice };
  }, [entryPrice, entryPriceNum, priceStepNum, avgOffsetPips, totalPipsSLNum, numEntradas, direction]);

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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div>
            <label>Valor de 1 pip por lote estándar (1.00), en $</label>
            <input type="text" inputMode="decimal" value={pipValuePerLot} onChange={(e) => setPipValuePerLot(e.target.value)} />
          </div>
          <div>
            <label>Dirección</label>
            <div className="pill-row">
              <button className="btn" style={pillStyle(direction === "compra")} onClick={() => setDirection("compra")}>
                Compra
              </button>
              <button className="btn" style={pillStyle(direction === "venta")} onClick={() => setDirection("venta")}>
                Venta
              </button>
            </div>
          </div>
          <div>
            <label>Precio de la 1ª entrada (opcional)</label>
            <input type="text" inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="ej. 2450.30" />
          </div>
          <div>
            <label>Valor de 1 pip en precio</label>
            <input type="text" inputMode="decimal" value={priceStep} onChange={(e) => setPriceStep(e.target.value)} />
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

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>
              Precio medio de la cesta (breakeven)
            </div>
            <div style={{ fontSize: 18, fontFamily: "var(--font-mono)" }}>
              {avgOffsetPips > 0 ? `${fmt(avgOffsetPips, 1)} pips ${direction === "compra" ? "por debajo" : "por encima"} de tu 1ª entrada` : "—"}
            </div>
            {priceLevels && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Precio: {fmt(priceLevels.breakevenPrice, 2)}</div>
            )}
          </div>
          {priceLevels && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Precio del Stop Loss</div>
              <div style={{ fontSize: 18, fontFamily: "var(--font-mono)", color: "var(--down)" }}>{fmt(priceLevels.slPrice, 2)}</div>
            </div>
          )}
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
  const [direction, setDirection] = useState<Direction>("compra");

  const [balance, setBalance] = useState("1000");
  const [riskType, setRiskType] = useState<RiskType>("pct");
  const [riskValue, setRiskValue] = useState("1");

  const [pipValuePerLot, setPipValuePerLot] = useState("10");
  const [priceStep, setPriceStep] = useState("0.01");

  const [ratio, setRatio] = useState(2);
  const [ratioCustom, setRatioCustom] = useState("");

  const [lote, setLote] = useState("0.01");

  const [slPipsInput, setSlPipsInput] = useState("300");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  const effectiveRatio = ratioCustom.trim() !== "" ? parseNum(ratioCustom) : ratio;

  const balanceNum = parseNum(balance);
  const riskValueNum = parseNum(riskValue);
  const riskAmount = riskType === "pct" ? (balanceNum * riskValueNum) / 100 : riskValueNum;
  const riskPct = balanceNum > 0 ? (riskAmount / balanceNum) * 100 : 0;

  const pipValueNum = parseNum(pipValuePerLot);
  const priceStepNum = parseNum(priceStep);
  const entryPriceNum = parseNum(entryPrice);
  const stopPriceNum = parseNum(stopPrice);

  const slPipsFromPrices =
    entryPrice.trim() !== "" && stopPrice.trim() !== "" && priceStepNum > 0
      ? Math.abs(entryPriceNum - stopPriceNum) / priceStepNum
      : null;

  const loteNum = parseNum(lote);
  const slPipsManual = parseNum(slPipsInput);

  const result = useMemo(() => {
    if (mode === "lote") {
      const valuePerPip = loteNum * pipValueNum;
      const slPips = valuePerPip > 0 ? riskAmount / valuePerPip : 0;
      const tpPips = slPips * effectiveRatio;
      return { slPips, tpPips, lote: loteNum, gain: riskAmount * effectiveRatio };
    }
    const slPips = slPipsFromPrices ?? slPipsManual;
    const valuePerPipNeeded = slPips > 0 ? riskAmount / slPips : 0;
    const loteCalc = pipValueNum > 0 ? valuePerPipNeeded / pipValueNum : 0;
    const tpPips = slPips * effectiveRatio;
    return { slPips, tpPips, lote: loteCalc, gain: riskAmount * effectiveRatio };
  }, [mode, loteNum, pipValueNum, riskAmount, effectiveRatio, slPipsFromPrices, slPipsManual]);

  const loteRounded = Math.max(0, Math.floor(result.lote * 100) / 100);

  const priceLevels = useMemo(() => {
    if (entryPrice.trim() === "" || priceStepNum <= 0 || !Number.isFinite(result.slPips) || result.slPips <= 0) {
      return null;
    }
    const slDelta = result.slPips * priceStepNum;
    const tpDelta = result.tpPips * priceStepNum;
    const slPrice = direction === "compra" ? entryPriceNum - slDelta : entryPriceNum + slDelta;
    const tpPrice = direction === "compra" ? entryPriceNum + tpDelta : entryPriceNum - tpDelta;
    return { slPrice, tpPrice };
  }, [entryPrice, entryPriceNum, priceStepNum, result.slPips, result.tpPips, direction]);

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
          <div>
            <label>Dirección</label>
            <div className="pill-row">
              <button className="btn" style={pillStyle(direction === "compra")} onClick={() => setDirection("compra")}>
                Compra
              </button>
              <button className="btn" style={pillStyle(direction === "venta")} onClick={() => setDirection("venta")}>
                Venta
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <label>Valor de 1 pip por lote estándar (1.00), en $</label>
            <input type="text" inputMode="decimal" value={pipValuePerLot} onChange={(e) => setPipValuePerLot(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
              Por defecto 10 $ (el mismo valor que usa la calculadora de Riesgo Avanzado de Club 11K). Ajústalo si tu bróker usa otro contrato.
            </div>
          </div>
          <div>
            <label>Valor de 1 pip en precio</label>
            <input type="text" inputMode="decimal" value={priceStep} onChange={(e) => setPriceStep(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
              Solo se usa para mostrar los niveles de precio de SL/TP (opcional). En muchas plataformas 1 pip de oro = 0,01.
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
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <div>
                <label>Stop Loss (en pips)</label>
                <input type="text" inputMode="decimal" value={slPipsInput} onChange={(e) => setSlPipsInput(e.target.value)} disabled={slPipsFromPrices !== null} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>O, si lo prefieres, indica los precios y calculamos los pips por ti:</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <div>
                <label>Precio de entrada</label>
                <input type="text" inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="ej. 2450.30" />
              </div>
              <div>
                <label>Precio del Stop Loss</label>
                <input type="text" inputMode="decimal" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} placeholder="ej. 2447.30" />
              </div>
            </div>
            {slPipsFromPrices !== null && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Pips de Stop Loss calculados a partir de los precios: <strong>{fmt(slPipsFromPrices, 1)}</strong>
              </div>
            )}
          </>
        )}
        {mode === "lote" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div>
              <label>Precio de entrada (opcional, para ver niveles de precio)</label>
              <input type="text" inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="ej. 2450.30" />
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

        {priceLevels && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Precio de Stop Loss</div>
              <div style={{ fontSize: 18, fontFamily: "var(--font-mono)", color: "var(--down)" }}>{fmt(priceLevels.slPrice, 2)}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase" }}>Precio de Take Profit</div>
              <div style={{ fontSize: 18, fontFamily: "var(--font-mono)", color: "var(--up)" }}>{fmt(priceLevels.tpPrice, 2)}</div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {mode === "lote"
            ? `Con ${fmt(loteNum, 2)} lotes y un riesgo de $${fmt(riskAmount)}, tu Stop Loss debe ir a ${fmt(result.slPips, 1)} pips para no arriesgar más de eso. Con el ratio elegido, tu Take Profit queda en ${fmt(result.tpPips, 1)} pips.`
            : `Para arriesgar $${fmt(riskAmount)} con un Stop Loss de ${fmt(result.slPips, 1)} pips, usa ${fmt(loteRounded, 2)} lotes. Con el ratio elegido, tu Take Profit queda en ${fmt(result.tpPips, 1)} pips.`}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Esta calculadora es una ayuda de planificación: usa los pips y el valor por pip de tu propio bróker/plataforma para
        que los números coincidan exactamente con tu cuenta real antes de operar.
      </div>
    </div>
  );
}

