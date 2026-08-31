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

// Notas explicativas breves para categorías de datos cuyo nombre no es
// autoexplicativo a simple vista (p. ej. "breakeven" suena a bonos, pero es
// en realidad una expectativa de inflación derivada de precios de bonos).
const GROUP_NOTES: Record<string, string> = {
  inflacion:
    "Los datos \"breakeven\" no son un tipo de bono: son la expectativa de inflación que implica el mercado de bonos, calculada como la diferencia entre el rendimiento de un bono del Tesoro normal y el de un bono indexado a la inflación (TIPS) del mismo plazo. Si es alta, el mercado espera más inflación.",
};

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
    snapshot.macro.fedFundsRate && {
      name: "Tipos de Interés (Fed Funds)",
      value: Math.round(Math.max(0, Math.min(100, (snapshot.macro.fedFundsRate.value / 6) * 100))),
      label: `Fed Funds ${snapshot.macro.fedFundsRate.value.toFixed(2)}%`,
      color: "var(--gold-bright)",
    },
    snapshot.risk.vix && {
      name: "Índice de Volatilidad (VIX)",
      value: Math.round(Math.max(0, Math.min(100, (snapshot.risk.vix.value / 40) * 100))),
      label: `VIX ${snapshot.risk.vix.value.toFixed(1)}`,
      color: "var(--violet-bright)",
    },
    snapshot.risk.hyOas && {
      name: "Diferencial de Crédito (HY OAS)",
      value: Math.round(Math.max(0, Math.min(100, (snapshot.risk.hyOas.value / 10) * 100))),
      label: `HY OAS ${snapshot.risk.hyOas.value.toFixed(2)}%`,
      color: "var(--down)",
    },
    snapshot.macro.t3m10ySpread && {
      name: "Curva 10Y/3M",
      value: Math.round(Math.max(0, Math.min(100, 50 - snapshot.macro.t3m10ySpread.value * 25))),
      label: `${snapshot.macro.t3m10ySpread.value >= 0 ? "+" : ""}${snapshot.macro.t3m10ySpread.value.toFixed(2)} pp`,
      color: "var(--violet)",
    },
  ].filter(Boolean) as { name: string; value: number; label: string; color: string }[];

  type SourceItem = { label: string; value: string; date: string; source: string };
  const preciosItems: SourceItem[] = [];
  const tasasItems: SourceItem[] = [];
  const inflacionItems: SourceItem[] = [];
  const liquidezItems: SourceItem[] = [];
  const empleoItems: SourceItem[] = [];
  const riesgoItems: SourceItem[] = [];
  const flujosItems: SourceItem[] = [];

  if (snapshot.prices.gold) preciosItems.push({ label: "Oro spot (XAU/USD)", value: `$${snapshot.prices.gold.price}`, date: "hoy", source: "Twelve Data" });
  if (snapshot.prices.dxy) preciosItems.push({ label: "DXY", value: `${snapshot.prices.dxy.price}`, date: "hoy", source: "Twelve Data" });

  if (snapshot.macro.us10yNominal) tasasItems.push({ label: "US 10Y nominal (DGS10)", value: `${snapshot.macro.us10yNominal.value}%`, date: snapshot.macro.us10yNominal.date, source: "FRED — DGS10" });
  if (snapshot.macro.us10yTipsReal) tasasItems.push({ label: "US 10Y TIPS real (DFII10)", value: `${snapshot.macro.us10yTipsReal.value}%`, date: snapshot.macro.us10yTipsReal.date, source: "FRED — DFII10" });
  if (snapshot.macro.us2y) tasasItems.push({ label: "US 2Y (DGS2)", value: `${snapshot.macro.us2y.value}%`, date: snapshot.macro.us2y.date, source: "FRED — DGS2" });
  if (snapshot.macro.us5yTipsReal) tasasItems.push({ label: "US 5Y TIPS real (DFII5)", value: `${snapshot.macro.us5yTipsReal.value}%`, date: snapshot.macro.us5yTipsReal.date, source: "FRED — DFII5" });
  if (snapshot.macro.us30y) tasasItems.push({ label: "US 30Y (DGS30)", value: `${snapshot.macro.us30y.value}%`, date: snapshot.macro.us30y.date, source: "FRED — DGS30" });
  if (snapshot.macro.t3m10ySpread) tasasItems.push({ label: "Curva 10Y/3M (T10Y3M)", value: `${snapshot.macro.t3m10ySpread.value} pp`, date: snapshot.macro.t3m10ySpread.date, source: "FRED — T10Y3M" });
  if (snapshot.macro.fedFundsRate) tasasItems.push({ label: "Fed Funds efectivo (DFF)", value: `${snapshot.macro.fedFundsRate.value}%`, date: snapshot.macro.fedFundsRate.date, source: "FRED — DFF" });

  if (snapshot.macro.cpiYoY) inflacionItems.push({ label: "CPI interanual", value: `${snapshot.macro.cpiYoY.value.toFixed(2)}%`, date: snapshot.macro.cpiYoY.date, source: "FRED — CPIAUCSL" });
  if (snapshot.macro.coreCpiYoY) inflacionItems.push({ label: "Core CPI interanual", value: `${snapshot.macro.coreCpiYoY.value.toFixed(2)}%`, date: snapshot.macro.coreCpiYoY.date, source: "FRED — CPILFESL" });
  if (snapshot.macro.pceYoY) inflacionItems.push({ label: "PCE interanual", value: `${snapshot.macro.pceYoY.value.toFixed(2)}%`, date: snapshot.macro.pceYoY.date, source: "FRED — PCEPI" });
  if (snapshot.macro.corePceYoY) inflacionItems.push({ label: "Core PCE interanual", value: `${snapshot.macro.corePceYoY.value.toFixed(2)}%`, date: snapshot.macro.corePceYoY.date, source: "FRED — PCEPILFE" });
  if (snapshot.macro.ppiYoY) inflacionItems.push({ label: "PPI interanual", value: `${snapshot.macro.ppiYoY.value.toFixed(2)}%`, date: snapshot.macro.ppiYoY.date, source: "FRED — PPIACO" });
  if (snapshot.macro.breakeven10y) inflacionItems.push({ label: "Breakeven inflación 10Y", value: `${snapshot.macro.breakeven10y.value}%`, date: snapshot.macro.breakeven10y.date, source: "FRED — T10YIE" });
  if (snapshot.macro.breakeven5y) inflacionItems.push({ label: "Breakeven inflación 5Y", value: `${snapshot.macro.breakeven5y.value}%`, date: snapshot.macro.breakeven5y.date, source: "FRED — T5YIE" });
  if (snapshot.macro.breakeven5y5yFwd) inflacionItems.push({ label: "Breakeven forward 5Y5Y", value: `${snapshot.macro.breakeven5y5yFwd.value}%`, date: snapshot.macro.breakeven5y5yFwd.date, source: "FRED — T5YIFR" });
  if (snapshot.macro.michiganInflationExp) inflacionItems.push({ label: "Expectativa inflación (Michigan)", value: `${snapshot.macro.michiganInflationExp.value}%`, date: snapshot.macro.michiganInflationExp.date, source: "FRED — MICH" });

  if (snapshot.macro.m2YoY) liquidezItems.push({ label: "M2 (oferta monetaria) interanual", value: `${snapshot.macro.m2YoY.value.toFixed(2)}%`, date: snapshot.macro.m2YoY.date, source: "FRED — M2SL" });
  if (snapshot.liquidity.fedBalanceSheet) liquidezItems.push({ label: "Balance de la Fed", value: `$${snapshot.liquidity.fedBalanceSheet.value.toLocaleString("es-ES")} M`, date: snapshot.liquidity.fedBalanceSheet.date, source: "FRED — WALCL" });
  if (snapshot.liquidity.onRRP) liquidezItems.push({ label: "Overnight Reverse Repo (ON RRP)", value: `$${snapshot.liquidity.onRRP.value.toLocaleString("es-ES")} MM`, date: snapshot.liquidity.onRRP.date, source: "FRED — RRPONTSYD" });
  if (snapshot.liquidity.tga) liquidezItems.push({ label: "Treasury General Account (TGA)", value: `$${snapshot.liquidity.tga.value.toLocaleString("es-ES")} MM`, date: snapshot.liquidity.tga.date, source: "FRED — WDTGAL" });

  if (snapshot.macro.unemploymentRate) empleoItems.push({ label: "Tasa de desempleo", value: `${snapshot.macro.unemploymentRate.value}%`, date: snapshot.macro.unemploymentRate.date, source: "FRED — UNRATE" });
  if (snapshot.labor.nfpChange) empleoItems.push({ label: "Nóminas no agrícolas (cambio mensual)", value: `${snapshot.labor.nfpChange.value >= 0 ? "+" : ""}${snapshot.labor.nfpChange.value}k`, date: snapshot.labor.nfpChange.date, source: "FRED — PAYEMS" });
  if (snapshot.labor.participationRate) empleoItems.push({ label: "Tasa de participación laboral", value: `${snapshot.labor.participationRate.value}%`, date: snapshot.labor.participationRate.date, source: "FRED — CIVPART" });
  if (snapshot.labor.avgHourlyEarningsYoY) empleoItems.push({ label: "Ganancias medias por hora interanual", value: `${snapshot.labor.avgHourlyEarningsYoY.value.toFixed(2)}%`, date: snapshot.labor.avgHourlyEarningsYoY.date, source: "FRED — CES0500000003" });
  if (snapshot.labor.joltsOpenings) empleoItems.push({ label: "Vacantes JOLTS", value: `${snapshot.labor.joltsOpenings.value.toLocaleString("es-ES")}k`, date: snapshot.labor.joltsOpenings.date, source: "FRED — JTSJOL" });
  if (snapshot.labor.initialClaims) empleoItems.push({ label: "Solicitudes iniciales de desempleo", value: `${snapshot.labor.initialClaims.value.toLocaleString("es-ES")}`, date: snapshot.labor.initialClaims.date, source: "FRED — ICSA" });
  if (snapshot.activity.retailSalesMoM) empleoItems.push({ label: "Ventas minoristas mensual", value: `${snapshot.activity.retailSalesMoM.value.toFixed(2)}%`, date: snapshot.activity.retailSalesMoM.date, source: "FRED — RSXFS" });
  if (snapshot.activity.gdpRealYoY) empleoItems.push({ label: "PIB real interanual", value: `${snapshot.activity.gdpRealYoY.value.toFixed(2)}%`, date: snapshot.activity.gdpRealYoY.date, source: "FRED — GDPC1" });

  if (snapshot.risk.vix) riesgoItems.push({ label: "VIX (índice de volatilidad CBOE)", value: `${snapshot.risk.vix.value.toFixed(2)}`, date: snapshot.risk.vix.date, source: "FRED — VIXCLS" });
  if (snapshot.risk.hyOas) riesgoItems.push({ label: "High Yield OAS (diferencial de crédito)", value: `${snapshot.risk.hyOas.value}%`, date: snapshot.risk.hyOas.date, source: "FRED — BAMLH0A0HYM2" });

  if (snapshot.flows.cotGoldManagedMoney) flujosItems.push({ label: "Posicionamiento Managed Money — oro COMEX (COT)", value: `Neto ${snapshot.flows.cotGoldManagedMoney.netCurrent.toLocaleString("es-ES")} contratos`, date: snapshot.flows.cotGoldManagedMoney.date, source: "CFTC — Disaggregated COT" });

  const sourceGroups = [
    { key: "precios", title: "Precios", items: preciosItems },
    { key: "tasas", title: "Tasas y Política Monetaria", items: tasasItems },
    { key: "inflacion", title: "Inflación", items: inflacionItems },
    { key: "liquidez", title: "Liquidez", items: liquidezItems },
    { key: "empleo", title: "Empleo y Actividad", items: empleoItems },
    { key: "riesgo", title: "Riesgo e Intermercado", items: riesgoItems },
    { key: "flujos", title: "Flujos y Posicionamiento", items: flujosItems },
  ].filter((g) => g.items.length > 0);
  const totalSources = sourceGroups.reduce((sum, g) => sum + g.items.length, 0);

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
            { proName: "CAPITALCOM:OIL_BRENT", title: "Petróleo Brent (Cash)" },
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

      <div style={{ marginTop: 20, marginBottom: 16 }}>
        <MarketFlowMap />
      </div>

      <div style={{ marginTop: 4, marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
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

      <div className="panel-head" style={{ margin: "4px 0 10px 2px" }}>
        <span className="panel-title">Mapa de Fuentes — Valores Usados en esta Corrida</span>
        <span className="panel-sub">{totalSources} datos en vivo, agrupados por categoría</span>
      </div>
      {sourceGroups.length === 0 ? (
        <div className="panel" style={{ padding: 20, color: "var(--text-dim)" }}>
          Todavía no hay datos en vivo — configura FRED_API_KEY y TWELVE_DATA_API_KEY en Render → Environment.
        </div>
      ) : (
        sourceGroups.map((group) => (
          <div key={group.key} style={{ marginBottom: 20 }}>
            <div className="source-group-title">{group.title}</div>
            {GROUP_NOTES[group.key] && <div className="source-group-note">{GROUP_NOTES[group.key]}</div>}
            <div className="source-grid">
              {group.items.map((s, i) => (
                <div key={i} className="source-card">
                  <div className="source-card-label">{s.label}</div>
                  <div className="source-card-value">{s.value}</div>
                  <div className="source-card-meta">
                    <span>{s.date}</span>
                    <span>{s.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

