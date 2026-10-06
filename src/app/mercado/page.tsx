import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMarketSnapshot } from "@/lib/vantax-data";
import { computeBiasScore } from "@/lib/bias-score";
import { fetchGoldNewsHeadlines } from "@/lib/telegram-news";
import { SessionsClock } from "@/components/market/SessionsClock";
import { BiasScorePanel } from "@/components/market/BiasScorePanel";
import { MarketFlowMap } from "@/components/market/MarketFlowMap";
import { TradingViewWidget } from "@/components/market/TradingViewWidget";
import { AppNav } from "@/components/AppNav";
import { SourceGroups } from "@/components/market/SourceGroups";
import { EconCalendar } from "@/components/market/EconCalendar";
import { getInvestingCalendar } from "@/lib/investing-calendar";

export const revalidate = 300; // recachea esta página cada 5 minutos

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// Formatea fechas al estilo español (DD/MM/AAAA) para el Mapa de Fuentes.
// Las fechas de FRED llegan como "2026-08-01" y las del COT (CFTC) como
// timestamp completo "2026-09-15T00:00:00.000" — ambas empiezan por
// AAAA-MM-DD, así que basta con leer esos 10 primeros caracteres y no hace
// falta parsear con Date() (evita líos de zona horaria en el servidor).
// Cualquier otro texto (p. ej. "hoy") se deja tal cual.
function fmtDateEs(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}

export default async function MercadoPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as any).id as string;
  const isAdmin = (session.user as any).role === "ADMIN";

  // El acceso al Centro de Mercado lo concede un admin por separado del
  // acceso a Análisis (ver /admin/usuarios) — se comprueba en cada visita
  // porque un admin puede activarlo/desactivarlo en cualquier momento.
  if (!isAdmin) {
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { marketAccess: true } });
    if (!dbUser?.marketAccess) {
      return (
        <div className="container" style={{ paddingTop: 40, maxWidth: 640 }}>
          <div className="panel locked-panel">
            <span className="locked-icon">🔒</span>
            <div>
              <h1 style={{ fontSize: 20, marginTop: 0 }}>Acceso al Centro de Mercado pendiente</h1>
              <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 16 }}>
                Por ahora estamos dando acceso a la comunidad de forma manual. En cuanto activemos tu cuenta
                desde nuestro lado podrás entrar aquí y ver sesiones, gráficos, calendario y todos los datos en
                vivo.
              </p>
              <div className="btn-row">
                <AppNav isAdmin={isAdmin} active="mercado" />
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  const [snapshot, goldNews, investingCal] = await Promise.all([buildMarketSnapshot(), fetchGoldNewsHeadlines(), getInvestingCalendar()]);
  // Un BiasResult por temporalidad — BiasScorePanel (cliente) guarda en
  // estado cuál pestaña está activa y pinta el que corresponda, sin volver
  // a pedir datos al navegar entre pestañas.
  const biasByTimeframe = {
    "15min": computeBiasScore(snapshot, "15min"),
    "30min": computeBiasScore(snapshot, "30min"),
    "1h": computeBiasScore(snapshot, "1h"),
    "1day": computeBiasScore(snapshot, "1day"),
  };

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
      name: "Coste de Oportunidad (real yield)",
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

  // Oro spot con 2 decimales fijos y separador de miles ("2.415,30" en vez
  // de "2415.297" tal cual venía de la API) — pedido explícitamente porque
  // el número crudo era difícil de leer de un vistazo.
  if (snapshot.prices.gold)
    preciosItems.push({
      label: "Oro spot (XAU/USD)",
      value: `$${snapshot.prices.gold.price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      date: "hoy",
      source: "Twelve Data",
    });
  if (snapshot.prices.dxy) preciosItems.push({ label: "DXY", value: snapshot.prices.dxy.price.toFixed(2), date: "hoy", source: "Twelve Data" });
  if (snapshot.prices.silver)
    preciosItems.push({
      label: "Plata spot (XAG/USD)",
      value: `$${snapshot.prices.silver.price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      date: "hoy",
      source: "Twelve Data",
    });
  if (snapshot.prices.gold && snapshot.prices.silver && snapshot.prices.silver.price > 0) {
    const ratio = snapshot.prices.gold.price / snapshot.prices.silver.price;
    preciosItems.push({
      label: "Ratio Oro/Plata",
      value: ratio.toFixed(1),
      date: "hoy",
      source: "Calculado (oro ÷ plata, Twelve Data)",
    });
  }
  if (snapshot.prices.wti)
    preciosItems.push({
      label: "Petróleo WTI",
      value: `$${snapshot.prices.wti.price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      date: "hoy",
      source: "Twelve Data",
    });

  if (snapshot.macro.us10yNominal) tasasItems.push({ label: "US 10Y nominal (DGS10)", value: `${snapshot.macro.us10yNominal.value}%`, date: snapshot.macro.us10yNominal.date, source: "FRED — DGS10" });
  if (snapshot.macro.us10yTipsReal) tasasItems.push({ label: "US 10Y TIPS real (DFII10)", value: `${snapshot.macro.us10yTipsReal.value}%`, date: snapshot.macro.us10yTipsReal.date, source: "FRED — DFII10" });
  if (snapshot.macro.us2y) tasasItems.push({ label: "US 2Y (DGS2)", value: `${snapshot.macro.us2y.value}%`, date: snapshot.macro.us2y.date, source: "FRED — DGS2" });
  if (snapshot.macro.us5yTipsReal) tasasItems.push({ label: "US 5Y TIPS real (DFII5)", value: `${snapshot.macro.us5yTipsReal.value}%`, date: snapshot.macro.us5yTipsReal.date, source: "FRED — DFII5" });
  if (snapshot.macro.us30y) tasasItems.push({ label: "US 30Y (DGS30)", value: `${snapshot.macro.us30y.value}%`, date: snapshot.macro.us30y.date, source: "FRED — DGS30" });
  if (snapshot.macro.t3m10ySpread) tasasItems.push({ label: "Curva 10Y/3M (T10Y3M)", value: `${snapshot.macro.t3m10ySpread.value} pp`, date: snapshot.macro.t3m10ySpread.date, source: "FRED — T10Y3M" });
  if (snapshot.macro.t10y2ySpread) tasasItems.push({ label: "Curva 10Y/2Y (T10Y2Y)", value: `${snapshot.macro.t10y2ySpread.value} pp`, date: snapshot.macro.t10y2ySpread.date, source: "FRED — T10Y2Y" });
  if (snapshot.macro.fedFundsRate) tasasItems.push({ label: "Fed Funds efectivo (DFF)", value: `${snapshot.macro.fedFundsRate.value}%`, date: snapshot.macro.fedFundsRate.date, source: "FRED — DFF" });

  if (snapshot.macro.cpiYoY) inflacionItems.push({ label: "CPI interanual", value: `${snapshot.macro.cpiYoY.value.toFixed(2)}%`, date: snapshot.macro.cpiYoY.date, source: "FRED — CPIAUCSL" });
  if (snapshot.macro.coreCpiYoY) inflacionItems.push({ label: "Core CPI interanual", value: `${snapshot.macro.coreCpiYoY.value.toFixed(2)}%`, date: snapshot.macro.coreCpiYoY.date, source: "FRED — CPILFESL" });
  if (snapshot.macro.pceYoY) inflacionItems.push({ label: "PCE interanual", value: `${snapshot.macro.pceYoY.value.toFixed(2)}%`, date: snapshot.macro.pceYoY.date, source: "FRED — PCEPI" });
  if (snapshot.macro.corePceYoY) inflacionItems.push({ label: "Core PCE interanual", value: `${snapshot.macro.corePceYoY.value.toFixed(2)}%`, date: snapshot.macro.corePceYoY.date, source: "FRED — PCEPILFE" });
  if (snapshot.macro.ppiYoY) inflacionItems.push({ label: "PPI interanual", value: `${snapshot.macro.ppiYoY.value.toFixed(2)}%`, date: snapshot.macro.ppiYoY.date, source: "FRED — PPIFIS" });
  if (snapshot.macro.breakeven10y) inflacionItems.push({ label: "Breakeven inflación 10Y", value: `${snapshot.macro.breakeven10y.value}%`, date: snapshot.macro.breakeven10y.date, source: "FRED — T10YIE" });
  if (snapshot.macro.breakeven5y) inflacionItems.push({ label: "Breakeven inflación 5Y", value: `${snapshot.macro.breakeven5y.value}%`, date: snapshot.macro.breakeven5y.date, source: "FRED — T5YIE" });
  if (snapshot.macro.breakeven5y5yFwd) inflacionItems.push({ label: "Breakeven forward 5Y5Y", value: `${snapshot.macro.breakeven5y5yFwd.value}%`, date: snapshot.macro.breakeven5y5yFwd.date, source: "FRED — T5YIFR" });
  if (snapshot.macro.michiganInflationExp) inflacionItems.push({ label: "Expectativa inflación (Michigan)", value: `${snapshot.macro.michiganInflationExp.value}%`, date: snapshot.macro.michiganInflationExp.date, source: "FRED — MICH" });

  if (snapshot.macro.m2YoY) liquidezItems.push({ label: "M2 (oferta monetaria) interanual", value: `${snapshot.macro.m2YoY.value.toFixed(2)}%`, date: snapshot.macro.m2YoY.date, source: "FRED — M2SL" });
  if (snapshot.liquidity.fedBalanceSheet) liquidezItems.push({ label: "Balance de la Fed", value: `$${snapshot.liquidity.fedBalanceSheet.value.toLocaleString("es-ES")} M`, date: snapshot.liquidity.fedBalanceSheet.date, source: "FRED — WALCL" });
  // Se renombra el sufijo de "MM" a "mil M" -- con el TGA de abajo usando
  // "M" (millones) y este usando "MM" (miles de millones), las dos
  // abreviaturas se confundían a primera vista aunque cada una fuera
  // correcta en su propia unidad. "mil M" es inequívoco: mil millones.
  if (snapshot.liquidity.onRRP)
    liquidezItems.push({
      label: "Overnight Reverse Repo (ON RRP)",
      value: `$${snapshot.liquidity.onRRP.value.toLocaleString("es-ES", { maximumFractionDigits: 1 })} mil M`,
      date: snapshot.liquidity.onRRP.date,
      source: "FRED — RRPONTSYD",
    });
  // WDTGAL viene en MILLONES de dólares (confirmado en FRED), no en miles de
  // millones -- estaba etiquetado "MM" y parecía mil veces más grande de lo
  // real (947.317 MM ≈ 947 billones en vez de los ~947.000 millones/947 mil
  // millones reales). Ver también "Balance de la Fed" (WALCL) abajo, que sí
  // usa "M" correctamente para la misma unidad.
  if (snapshot.liquidity.tga) liquidezItems.push({ label: "Treasury General Account (TGA)", value: `$${snapshot.liquidity.tga.value.toLocaleString("es-ES")} M`, date: snapshot.liquidity.tga.date, source: "FRED — WDTGAL" });

  if (snapshot.macro.unemploymentRate) empleoItems.push({ label: "Tasa de desempleo", value: `${snapshot.macro.unemploymentRate.value}%`, date: snapshot.macro.unemploymentRate.date, source: "FRED — UNRATE" });
  if (snapshot.labor.nfpChange) empleoItems.push({ label: "Nóminas no agrícolas (cambio mensual)", value: `${snapshot.labor.nfpChange.value >= 0 ? "+" : ""}${snapshot.labor.nfpChange.value}k`, date: snapshot.labor.nfpChange.date, source: "FRED — PAYEMS" });
  if (snapshot.labor.participationRate) empleoItems.push({ label: "Tasa de participación laboral", value: `${snapshot.labor.participationRate.value}%`, date: snapshot.labor.participationRate.date, source: "FRED — CIVPART" });
  if (snapshot.labor.avgHourlyEarningsYoY) empleoItems.push({ label: "Ganancias medias por hora interanual", value: `${snapshot.labor.avgHourlyEarningsYoY.value.toFixed(2)}%`, date: snapshot.labor.avgHourlyEarningsYoY.date, source: "FRED — CES0500000003" });
  // JTSJOL viene en MILES de vacantes -- se mostraba tal cual con sufijo
  // "k" (p. ej. "7.181k"), técnicamente correcto pero pedido en formato de
  // millones, que es como se suele citar esta cifra en prensa (p. ej.
  // "7,18 M" en vez de "7.181k").
  if (snapshot.labor.joltsOpenings)
    empleoItems.push({
      label: "Vacantes JOLTS",
      value: `${(snapshot.labor.joltsOpenings.value / 1000).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`,
      date: snapshot.labor.joltsOpenings.date,
      source: "FRED — JTSJOL",
    });
  if (snapshot.labor.initialClaims) empleoItems.push({ label: "Solicitudes iniciales de desempleo", value: `${snapshot.labor.initialClaims.value.toLocaleString("es-ES")}`, date: snapshot.labor.initialClaims.date, source: "FRED — ICSA" });
  if (snapshot.activity.retailSalesMoM) empleoItems.push({ label: "Ventas minoristas mensual", value: `${snapshot.activity.retailSalesMoM.value.toFixed(2)}%`, date: snapshot.activity.retailSalesMoM.date, source: "FRED — RSXFS" });
  if (snapshot.activity.gdpRealYoY) empleoItems.push({ label: "PIB real interanual", value: `${snapshot.activity.gdpRealYoY.value.toFixed(2)}%`, date: snapshot.activity.gdpRealYoY.date, source: "FRED — GDPC1" });

  if (snapshot.risk.vix) riesgoItems.push({ label: "VIX (índice de volatilidad CBOE)", value: `${snapshot.risk.vix.value.toFixed(2)}`, date: snapshot.risk.vix.date, source: "FRED — VIXCLS" });
  if (snapshot.risk.hyOas) riesgoItems.push({ label: "High Yield OAS (diferencial de crédito)", value: `${snapshot.risk.hyOas.value}%`, date: snapshot.risk.hyOas.date, source: "FRED — BAMLH0A0HYM2" });
  // DXY también entra aquí (además de en Precios) porque ahora participa
  // en el Bias Score como indicador de correlación intermercado -- ver
  // bias-score.ts, módulo "Intermercado & Riesgo".
  if (snapshot.prices.dxy)
    riesgoItems.push({
      label: "DXY (índice del dólar) — correlación con el oro",
      value: `${snapshot.prices.dxy.price.toFixed(2)} (${snapshot.prices.dxy.percentChange >= 0 ? "+" : ""}${snapshot.prices.dxy.percentChange.toFixed(2)}% hoy)`,
      date: "hoy",
      source: "Twelve Data",
    });

  if (snapshot.flows.cotGoldManagedMoney) flujosItems.push({ label: "Gold Futures (GC) — Managed Money, neto", value: `Neto ${snapshot.flows.cotGoldManagedMoney.netCurrent.toLocaleString("es-ES")} contratos`, date: snapshot.flows.cotGoldManagedMoney.date, source: "CFTC — Disaggregated COT" });
  if (snapshot.flows.cotGoldManagedMoney) flujosItems.push({ label: "Open Interest — Gold Futures (GC)", value: `${snapshot.flows.cotGoldManagedMoney.openInterest.toLocaleString("es-ES")} contratos abiertos`, date: snapshot.flows.cotGoldManagedMoney.date, source: "CFTC — Disaggregated COT" });
  if (snapshot.flows.cotGoldMicro) flujosItems.push({ label: "Micro Gold Futures (10 oz) — Managed Money, neto", value: `Neto ${snapshot.flows.cotGoldMicro.netCurrent.toLocaleString("es-ES")} contratos`, date: snapshot.flows.cotGoldMicro.date, source: "CFTC — Disaggregated COT" });
  if (snapshot.flows.cotGoldManagedMoney?.cotIndex3y !== null && snapshot.flows.cotGoldManagedMoney?.cotIndex3y !== undefined) {
    const idx = snapshot.flows.cotGoldManagedMoney.cotIndex3y;
    const extremo = idx >= 80 ? "muy comprado" : idx <= 20 ? "muy vendido" : "sin extremo";
    flujosItems.push({
      label: "COT Index (~3 años) — extremo de posicionamiento",
      value: `${idx.toFixed(0)}/100 (${extremo})`,
      date: snapshot.flows.cotGoldManagedMoney.date,
      source: "CFTC — Disaggregated COT (calculado)",
    });
  }
  if (snapshot.flows.etfGoldHoldings) {
    const etf = snapshot.flows.etfGoldHoldings;
    const delta = etf.tonnesPrev !== null ? etf.tonnes - etf.tonnesPrev : null;
    const deltaStr = delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(2)} t vs. día anterior)` : "";
    flujosItems.push({
      label: "Tenencias ETF — SPDR Gold Shares (GLD)",
      value: `${etf.tonnes.toLocaleString("es-ES")} t${deltaStr}`,
      date: etf.date,
      source: "SPDR Gold Shares — CSV diario",
    });
  }

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
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="mercado" />
        </div>
      </div>

      {/* Accesos rápidos a cada sección (rediseño 06/10/2026) */}
      <nav className="mk-nav" aria-label="Secciones">
        <a href="#resumen">Resumen</a>
        <a href="#termometros">Termómetros</a>
        <a href="#graficos">Gráficos</a>
        <a href="#flujos">Flujos</a>
        <a href="#calendario">Calendario</a>
        <a href="#noticias">Noticias</a>
        <a href="#datos">Datos macro</a>
      </nav>

      {/*
        Este ticker-tape es un widget de TradingView independiente: pide los
        precios directamente al feed de TradingView desde el navegador, no
        pasa por nuestro backend ni por FRED. Confirmado con TradingView
        (tooltip real visto en producción): los símbolos "TVC:*" de VIX,
        índice del dólar y rendimientos de bonos del Tesoro dan "Este
        símbolo solo está disponible en TradingView" — son datos con
        licencia restringida para insertar en widgets externos (CBOE/ICE),
        no un símbolo mal escrito, así que NINGÚN símbolo "TVC:" para estos
        arregla el error.
        - Índice USD y VIX: sí existen como CFD del broker Capital.com
          (mismo proveedor que ya usamos para el petróleo Brent más abajo,
          que sí funciona), así que se sustituyen por esos.
        - Rendimientos de bonos del Tesoro (5Y/10Y/20Y/30Y): no existe un
          CFD equivalente insertable gratis en ningún broker de TradingView,
          así que se quitan de esta cinta — el dato real y correcto (FRED)
          ya se ve más abajo, en el Bias Score y en "Mapa de Fuentes".
      */}
      <TradingViewWidget
        height={46}
        src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
        config={{
          symbols: [
            { proName: "OANDA:XAUUSD", title: "Oro (XAU/USD)" },
            { proName: "TVC:GOLD", title: "Oro (spot)" },
            { proName: "CAPITALCOM:DXY", title: "Índice USD (DXY)" },
            { proName: "CAPITALCOM:VIX", title: "VIX" },
            { proName: "CAPITALCOM:OIL_BRENT", title: "Petróleo Brent (Cash)" },
          ],
          colorTheme: "dark",
          isTransparent: true,
          displayMode: "compact",
          locale: "es",
        }}
      />

      {/* Resumen arriba: Bias Score con selector de temporalidad + última hora
          (ajuste pedido el 06/10/2026: fuera la tarjeta de precios clave, el
          Bias Score completo sube aquí y ocupa ese hueco). */}
      <section id="resumen" className="mk-summary">
        <div id="sesgo" className="mk-summary-bias">
          <BiasScorePanel results={biasByTimeframe} isAdmin={isAdmin} />
        </div>
        {goldNews[0] ? (
          <a href={goldNews[0].url} target="_blank" rel="noopener noreferrer" className="panel mk-news-card">
            <span className="mk-news-tag">
              <span className="map-alert-pulse" />
              Última hora{goldNews[0].dateIso ? ` · ${fmtDateEs(goldNews[0].dateIso)}` : ""}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-line", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical" }}>
              {goldNews[0].text}
            </span>
            <span style={{ marginTop: "auto", fontSize: 13, fontWeight: 600, color: "#F9A8D4" }}>Leer en Telegram ↗</span>
          </a>
        ) : (
          <div className="panel" style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Sin titulares ahora mismo.</div>
        )}
      </section>

      <div className="panel-title" style={{ margin: "4px 0 10px 2px" }}>Sesiones de Mercado (hora real, UTC)</div>
      <SessionsClock />

      {gauges.length > 0 && (
        <section id="termometros" style={{ scrollMarginTop: 20 }}>
          <div className="panel-title" style={{ margin: "20px 0 10px 2px" }}>Termómetros de Temperatura Económica</div>
          <div className="mk-gauges" style={{ marginBottom: 24 }}>
            {gauges.map((g) => (
              <div key={g.name} className="mk-gauge">
                <span className="mk-gauge-name">{g.name}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 600, color: g.color }}>{g.value}</span>
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>/100</span>
                </span>
                <span className="mk-gauge-track">
                  <span style={{ width: `${g.value}%`, background: g.color }} />
                </span>
                <span className="g-desc">{g.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div id="graficos" className="grid-even" style={{ marginBottom: 16, scrollMarginTop: 20 }}>
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

      <section id="flujos" style={{ marginBottom: 24, scrollMarginTop: 20 }}>
        <MarketFlowMap news={goldNews} />
      </section>

      <div id="calendario" className="panel-title" style={{ margin: "4px 0 10px 2px", scrollMarginTop: 20 }}>Calendario Económico (Estados Unidos)</div>
      <EconCalendar ok={investingCal.ok} thisWeek={investingCal.thisWeek} nextWeek={investingCal.nextWeek} />
      <div style={{ marginBottom: 24 }} />

      <div id="noticias" className="panel-head" style={{ margin: "4px 0 10px 2px", scrollMarginTop: 20 }}>
        <span className="panel-title">Feed de Titulares — Club 11K Gold News</span>
        <a
          href="https://t.me/s/club11k_news"
          target="_blank"
          rel="noopener noreferrer"
          className="panel-sub"
          style={{ textDecoration: "underline" }}
        >
          Abrir canal en Telegram ↗
        </a>
      </div>
      {/*
        Antes aquí iba el widget genérico "Timeline" de TradingView
        (feedMode: market/forex) -- enseñaba GBP/USD, USD/JPY, EUR/USD, no
        noticias de oro (Esther lo detectó). Como ya existe el canal propio
        de noticias de oro filtradas con IA (@club11k_news, el bot
        gold-news-telegram-bot), tiene más sentido mostrar ESO aquí.

        Primer intento (descartado): incrustar t.me/s/club11k_news en un
        <iframe> -- Telegram bloquea que su página se muestre dentro de un
        marco (protección anti-framing del navegador), así que salía en
        blanco/con icono de error. La solución: el SERVIDOR de Vantax
        descarga esa misma página pública (fetchGoldNewsHeadlines, en
        src/lib/telegram-news.ts -- eso sí funciona, el bloqueo de framing
        solo aplica a un <iframe> en el navegador) y la parseamos para
        renderizar los titulares como HTML propio, no como iframe ajeno.
      */}
      {goldNews.length > 0 ? (
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goldNews.map((n) => (
            <a
              key={n.url}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                textDecoration: "none",
                color: "inherit",
                paddingBottom: 12,
                borderBottom: "1px solid var(--line)",
              }}
            >
              {n.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={n.photoUrl}
                  alt=""
                  width={64}
                  height={64}
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              )}
              <div>
                <div style={{ fontSize: 13.5, whiteSpace: "pre-line" }}>{n.text}</div>
                {n.dateIso && (
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{fmtDateEs(n.dateIso)}</div>
                )}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ padding: 20, color: "var(--text-dim)", fontSize: 13.5 }}>
          No se han podido cargar los titulares del canal ahora mismo —{" "}
          <a href="https://t.me/s/club11k_news" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
            ábrelo directamente en Telegram
          </a>
          .
        </div>
      )}

      <div id="datos" className="panel-head" style={{ margin: "24px 0 10px 2px", scrollMarginTop: 20 }}>
        <span className="panel-title">Mapa de Fuentes — Valores Usados en esta Corrida</span>
        <span className="panel-sub">{totalSources} datos en vivo, agrupados por categoría</span>
      </div>
      {sourceGroups.length === 0 ? (
        <div className="panel" style={{ padding: 20, color: "var(--text-dim)" }}>
          Todavía no hay datos en vivo — configura FRED_API_KEY y TWELVE_DATA_API_KEY en Render → Environment.
        </div>
      ) : (
        <SourceGroups groups={sourceGroups} />
      )}
    </div>
  );
}


