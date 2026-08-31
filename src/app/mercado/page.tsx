import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { buildMarketSnapshot } from "@/lib/vantax-data";
import { computeBiasScore } from "@/lib/bias-score";
import { SessionsClock } from "@/components/market/SessionsClock";
import { MarketFlowMap } from "@/components/market/MarketFlowMap";
import { TradingViewWidget } from "@/components/market/TradingViewWidget";

export const revalidate = 300; // recachea esta página cada 5 minutos

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function scoreColor(score: number | null) {
  if (score === null) return "var(--text-dim)";
  if (score > 8) return "var(--up)";
  if (score < -8) return "var(--down)";
  return "var(--text-muted)";
}

export default async function MercadoPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const snapshot = await buildMarketSnapshot();
  const bias = computeBiasScore(snapshot);

  const gauges = [
    snapshot.prices.gold && {
      name: "Momentum del Oro",
      value: Math.round(Math.max(0, Math.min(100, 50 + snapshot.prices.gold.percentChange * 12))),
      label: `${fmtPct(snapshot.prices.gold.percentChange)} hoy`,
      color: "var(--gold-bright)",
    },
    snapshot.prices.dxy && {
      name: "Fortaleza del USD (DXY)",
      value: Math.round(Math.max(0, Math.min(100, 50 + snapshot.prices.dxy.percentChange * 25))),
      label: `${fmtPct(snapshot.prices.dxy.percentChange)} hoy`,
      color: "var(--text-muted)",
    },
    snapshot.macro.cpiYoY && {
      name: "Temperatura de Inflación",
      value: Math.round(Math.max(0, Math.min(100, ((snapshot.macro.cpiYoY.value - 1) / 4) * 100))),
      label: `CPI ${snapshot.macro.cpiYoY.value.toFixed(1)}% YoY`,
      color: "var(--down)",
    },
    snapshot.macro.us10yTipsReal && {
      name: "Costo de Oportunidad (real yield)",
      value: Math.round(Math.max(0, Math.min(100, (snapshot.macro.us10yTipsReal.value / 3.5) * 100))),
      label: `TIPS 10y ${snapshot.macro.us10yTipsReal.value.toFixed(2)}%`,
      color: "var(--violet)",
    },
    snapshot.macro.us10yNominal && {
      name: "Tipos de Interés (US 10Y)",
      value: Math.round(Math.max(0, Math.min(100, (snapshot.macro.us10yNominal.value / 6) * 100))),
      label: `US 10Y ${snapshot.macro.us10yNominal.value.toFixed(2)}%`,
      color: "var(--gold-bright)",
    },
    snapshot.risk.vix && {
      name: "Índice de Volatilidad (VIX)",
      value: Math.round(Math.max(0, Math.min(100, (snapshot.risk.vix.value / 40) * 100))),
      label: `VIX ${snapshot.risk.vix.value.toFixed(1)}`,
      color: "var(--violet-bright)",
    },
  ].filter(Boolean) as { name: string; value: number; label: string; color: string }[];

  const sources: { label: string; value: string; date: string; source: string }[] = [];
  if (snapshot.prices.gold) sources.push({ label: "Oro spot (XAU/USD)", value: `$${snapshot.prices.gold.price}`, date: "hoy", source: "Twelve Data" });
  if (snapshot.prices.dxy) sources.push({ label: "DXY", value: `${snapshot.prices.dxy.price}`, date: "hoy", source: "Twelve Data" });
  if (snapshot.macro.us10yNominal) sources.push({ label: "US 10Y nominal (DGS10)", value: `${snapshot.macro.us10yNominal.value}%`, date: snapshot.macro.us10yNominal.date, source: "FRED — DGS10" });
  if (snapshot.macro.us10yTipsReal) sources.push({ label: "US 10Y TIPS real (DFII10)", value: `${snapshot.macro.us10yTipsReal.value}%`, date: snapshot.macro.us10yTipsReal.date, source: "FRED — DFII10" });
  if (snapshot.macro.us2y) sources.push({ label: "US 2Y (DGS2)", value: `${snapshot.macro.us2y.value}%`, date: snapshot.macro.us2y.date, source: "FRED — DGS2" });
  if (snapshot.macro.cpiYoY) sources.push({ label: "CPI interanual", value: `${snapshot.macro.cpiYoY.value.toFixed(2)}%`, date: snapshot.macro.cpiYoY.date, source: "FRED — CPIAUCSL" });
  if (snapshot.macro.coreCpiYoY) sources.push({ label: "Core CPI interanual", value: `${snapshot.macro.coreCpiYoY.value.toFixed(2)}%`, date: snapshot.macro.coreCpiYoY.date, source: "FRED — CPILFESL" });
  if (snapshot.macro.unemploymentRate) sources.push({ label: "Tasa de desempleo", value: `${snapshot.macro.unemploymentRate.value}%`, date: snapshot.macro.unemploymentRate.date, source: "FRED — UNRATE" });
  if (snapshot.risk.vix) sources.push({ label: "VIX (índice de volatilidad CBOE)", value: `${snapshot.risk.vix.value.toFixed(2)}`, date: snapshot.risk.vix.date, source: "FRED — VIXCLS" });
  if (snapshot.flows.cotGoldManagedMoney) sources.push({ label: "Posicionamiento Managed Money — oro COMEX (COT)", value: `Neto ${snapshot.flows.cotGoldManagedMoney.netCurrent.toLocaleString("es-ES")} contratos`, date: snapshot.flows.cotGoldManagedMoney.date, source: "CFTC — Disaggregated COT" });

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX · Centro de mercado
          </div>
          <h1 style={{ fontSize: 26, margin: "4px 0 0" }}>
            XAU<span style={{ color: "var(--gold-bright)" }}>/</span>USD · DXY
          </h1>
        </div>
        <Link href="/dashboard" className="btn">Volver a mi panel</Link>
      </div>

      <TradingViewWidget
        height={46}
        src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
        config={{
          symbols: [
            { proName: "OANDA:XAUUSD", title: "Oro (XAU/USD)" },
            { proName: "TVC:GOLD", title: "Oro (spot)" },
            { proName: "FRED:DTWEXBGS", title: "USD ponderado (Fed)" },
            { proName: "FRED:VIXCLS", title: "VIX" },
            { proName: "FRED:DCOILBRENTEU", title: "Petróleo Brent" },
            { proName: "FRED:DGS5", title: "US 5Y" },
            { proName: "FRED:DGS10", title: "US 10Y" },
            { proName: "FRED:DGS20", title: "US 20Y" },
            { proName: "FRED:DGS30", title: "US 30Y" },
          ],
          colorTheme: "dark",
          isTransparent: true,
          displayMode: "compact",
          locale: "es",
        }}
      />

      <div style={{ marginTop: 20, marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        Bias Score — Motor de Scoring Algorítmico
      </div>
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="bias-panel">
          <div className="bias-score-box">
            <div className="bias-score-num" style={{ color: scoreColor(bias.total) }}>
              {bias.total !== null ? `${bias.total >= 0 ? "+" : ""}${bias.total.toFixed(0)}` : "—"}
            </div>
            <div className="bias-score-label">{bias.label}</div>
            <div className="bias-score-formula">
              Bias Score = promedio ponderado
              <br />
              de los módulos con datos disponibles
              <br />
              (pesos originales: 0.40 Macro + 0.25 Flujos
              <br />
              + 0.15 Riesgo + 0.20 Técnico)
            </div>
          </div>
          <div className="bias-modules">
            {bias.modules.map((mod) => (
              <div key={mod.key}>
                {mod.available && mod.score !== null ? (
                  <div className="bias-mod-row">
                    <div className="bias-mod-name">
                      {mod.name}
                      <span className="bias-mod-weight">peso {(mod.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="bias-mod-track">
                      <div className="bias-mod-zero" />
                      <div
                        className="bias-mod-fill"
                        style={{
                          [mod.score >= 0 ? "left" : "right"]: "50%",
                          width: `${Math.abs(mod.score) / 2}%`,
                          background: mod.score >= 0 ? "var(--up)" : "var(--down)",
                        } as React.CSSProperties}
                      />
                    </div>
                    <div className="bias-mod-score" style={{ color: mod.score >= 0 ? "var(--up)" : "var(--down)" }}>
                      {mod.score >= 0 ? "+" : ""}
                      {mod.score.toFixed(0)}
                    </div>
                  </div>
                ) : (
                  <div className="bias-mod-row">
                    <div className="bias-mod-name">
                      {mod.name}
                      <span className="bias-mod-weight">peso {(mod.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="bias-mod-unavailable">No disponible — {mod.unavailableReason}</div>
                  </div>
                )}
              </div>
            ))}

            <details className="indicators" style={{ marginTop: 6 }}>
              <summary>Ver los indicadores subyacentes y cómo se calificó cada uno</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Valor</th>
                      <th>Score</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bias.modules
                      .flatMap((m) => m.indicators)
                      .map((ind, i) => (
                        <tr key={i}>
                          <td>{ind.label}</td>
                          <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{ind.value}</td>
                          <td style={{ color: ind.score === null ? "var(--text-dim)" : ind.score >= 0 ? "var(--up)" : "var(--down)" }}>
                            {ind.score !== null ? `${ind.score >= 0 ? "+" : ""}${ind.score.toFixed(0)}` : "—"}
                          </td>
                          <td style={{ fontSize: 12 }}>{ind.note}</td>
                        </tr>
                      ))}
                    {bias.modules.every((m) => m.indicators.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ color: "var(--text-dim)" }}>
                          Todavía no hay datos — configura FRED_API_KEY y TWELVE_DATA_API_KEY en Render.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <MarketFlowMap />
      </div>

      <div className="panel-title" style={{ margin: "4px 0 10px 2px" }}>Sesiones de Mercado (hora real, UTC)</div>
      <SessionsClock />

      {gauges.length > 0 && (
        <>
          <div className="panel-title" style={{ margin: "20px 0 10px 2px" }}>Termómetros de Temperatura Económica</div>
          <div className="gauges" style={{ marginBottom: 24 }}>
            {gauges.map((g) => (
              <div key={g.name} className="gauge-card">
                <div className="g-name">{g.name}</div>
                <div className="therm">
                  <div className="therm-fill" style={{ height: `${g.value}%`, background: g.color }} />
                </div>
                <div className="g-value" style={{ color: g.color }}>
                  {g.value}
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>/100</span>
                </div>
                <div className="g-desc">{g.label}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid-even" style={{ marginBottom: 16 }}>
        <TradingViewWidget
          height={420}
          src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
          config={{
            symbol: "OANDA:XAUUSD",
            interval: "5",
            theme: "dark",
            style: "1",
            locale: "es",
            hide_top_toolbar: true,
            hide_legend: false,
            allow_symbol_change: false,
            save_image: false,
          }}
        />
        <TradingViewWidget
          height={420}
          src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
          config={{
            symbol: "CAPITALCOM:DXY",
            interval: "5",
            theme: "dark",
            style: "1",
            locale: "es",
            hide_top_toolbar: true,
            hide_legend: false,
            allow_symbol_change: false,
            save_image: false,
          }}
        />
      </div>

      <div className="panel-title" style={{ margin: "4px 0 10px 2px" }}>Calendario Económico (Estados Unidos)</div>
      <TradingViewWidget
        height={420}
        src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
        config={{
          width: "100%",
          height: 420,
          colorTheme: "dark",
          isTransparent: true,
          locale: "es",
          countryFilter: "us",
          importanceFilter: "0,1",
        }}
      />
      <div style={{ marginBottom: 24 }} />

      <div className="panel-head" style={{ margin: "4px 0 10px 2px" }}>
        <span className="panel-title">MOVE Index — Volatilidad de Bonos del Tesoro</span>
        <span className="panel-sub">Solo referencia visual — no entra en el cálculo del Bias Score (fuente propietaria de ICE, sin acceso gratuito)</span>
      </div>
      <div className="panel" style={{ padding: 20 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
          El MOVE Index es propiedad de ICE (Intercontinental Exchange) y no está disponible en los
          widgets públicos/gratuitos de TradingView (ni siquiera con cuenta Premium — es una
          restricción de licencia del dato, no de la cuenta del usuario). Para verlo en vivo, se puede
          consultar directo en{" "}
          <a href="https://www.tradingview.com/symbols/TVC-MOVE/" target="_blank" rel="noreferrer" style={{ color: "var(--violet-bright)" }}>
            tradingview.com/symbols/TVC-MOVE
          </a>
          . No entra en el cálculo del Bias Score de todas formas — solo era referencia visual.
        </p>
      </div>

      <div className="panel-title" style={{ margin: "24px 0 10px 2px" }}>Feed de Titulares</div>
      <TradingViewWidget
        height={400}
        src="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
        config={{
          width: "100%",
          height: 400,
          feedMode: "market",
          market: "forex",
          colorTheme: "dark",
          isTransparent: true,
          displayMode: "regular",
          locale: "es",
        }}
      />

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="panel-head">
          <span className="panel-title">Mapa de Fuentes — Valores Usados en esta Corrida</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dato</th>
                <th>Valor</th>
                <th>Fecha del dato</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i}>
                  <td>{s.label}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{s.value}</td>
                  <td>{s.date}</td>
                  <td>{s.source}</td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--text-dim)" }}>
                    Todavía no hay datos en vivo — configura FRED_API_KEY y TWELVE_DATA_API_KEY en Render → Environment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

