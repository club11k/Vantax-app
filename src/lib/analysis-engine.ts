import { anthropic, ANALYSIS_MODEL } from "@/lib/anthropic";
import { buildMarketSnapshot, MarketSnapshot } from "@/lib/vantax-data";
import { prisma } from "@/lib/prisma";

function fmtFred(v: { date: string; value: number } | null, suffix = "%", digits = 2): string {
  return v ? `${v.value.toFixed(digits)}${suffix} (${v.date})` : "no disponible";
}

function formatSnapshotForPrompt(snapshot: MarketSnapshot): string {
  const lines: string[] = [];
  const m = snapshot.macro;
  const liq = snapshot.liquidity;
  const lab = snapshot.labor;
  const act = snapshot.activity;
  const p = snapshot.prices;
  const t = snapshot.technical;
  const r = snapshot.risk;
  const f = snapshot.flows;

  lines.push(`Snapshot generado: ${snapshot.generatedAt}`);
  lines.push("");
  lines.push("MACRO — TASAS Y POLÍTICA MONETARIA:");
  lines.push(`- US 10Y nominal: ${fmtFred(m.us10yNominal)}`);
  lines.push(`- US 10Y TIPS (real): ${fmtFred(m.us10yTipsReal)}`);
  lines.push(`- US 5Y TIPS (real): ${fmtFred(m.us5yTipsReal)}`);
  lines.push(`- US 2Y: ${fmtFred(m.us2y)}`);
  lines.push(`- US 30Y: ${fmtFred(m.us30y)}`);
  lines.push(`- Curva 10Y/3M: ${fmtFred(m.t3m10ySpread, " pp")}`);
  lines.push(`- Tipo de interés Fed Funds (efectivo): ${fmtFred(m.fedFundsRate)}`);
  lines.push("");
  lines.push("MACRO — INFLACIÓN:");
  lines.push(`- CPI YoY: ${fmtFred(m.cpiYoY)}`);
  lines.push(`- Core CPI YoY: ${fmtFred(m.coreCpiYoY)}`);
  lines.push(`- PCE YoY: ${fmtFred(m.pceYoY)}`);
  lines.push(`- Core PCE YoY (referencia oficial de la Fed): ${fmtFred(m.corePceYoY)}`);
  lines.push(`- PPI YoY: ${fmtFred(m.ppiYoY)}`);
  lines.push(`- Breakeven de inflación 10Y: ${fmtFred(m.breakeven10y)}`);
  lines.push(`- Breakeven de inflación 5Y: ${fmtFred(m.breakeven5y)}`);
  lines.push(`- Breakeven forward 5Y5Y: ${fmtFred(m.breakeven5y5yFwd)}`);
  lines.push(`- Expectativa de inflación (encuesta Michigan): ${fmtFred(m.michiganInflationExp)}`);
  lines.push("");
  lines.push("MACRO — LIQUIDEZ Y BALANCE DE LA FED:");
  lines.push(`- Balance de la Fed (WALCL, millones USD): ${fmtFred(liq.fedBalanceSheet, "", 0)}`);
  lines.push(`- Overnight Reverse Repo (ON RRP, miles millones USD): ${fmtFred(liq.onRRP, "", 1)}`);
  lines.push(`- Treasury General Account (TGA, miles millones USD): ${fmtFred(liq.tga, "", 1)}`);
  lines.push(`- M2 (oferta monetaria) YoY: ${fmtFred(m.m2YoY)}`);
  lines.push("");
  lines.push("MACRO — EMPLEO Y ACTIVIDAD:");
  lines.push(`- Tasa de desempleo: ${fmtFred(m.unemploymentRate)}`);
  lines.push(`- Nóminas no agrícolas (cambio mensual, miles): ${fmtFred(lab.nfpChange, "", 0)}`);
  lines.push(`- Tasa de participación laboral: ${fmtFred(lab.participationRate)}`);
  lines.push(`- Ganancias medias por hora YoY: ${fmtFred(lab.avgHourlyEarningsYoY)}`);
  lines.push(`- Vacantes JOLTS (miles): ${fmtFred(lab.joltsOpenings, "", 0)}`);
  lines.push(`- Solicitudes iniciales de desempleo: ${fmtFred(lab.initialClaims, "", 0)}`);
  lines.push(`- Ventas minoristas MoM: ${fmtFred(act.retailSalesMoM)}`);
  lines.push(`- PIB real YoY: ${fmtFred(act.gdpRealYoY)}`);
  lines.push("");
  lines.push("PRECIOS:");
  lines.push(`- Oro (XAU/USD): ${p.gold ? `$${p.gold.price} (${p.gold.percentChange >= 0 ? "+" : ""}${p.gold.percentChange}% hoy)` : "no disponible — configurar TWELVE_DATA_API_KEY"}`);
  lines.push(`- DXY: ${p.dxy ? `${p.dxy.price} (${p.dxy.percentChange >= 0 ? "+" : ""}${p.dxy.percentChange}% hoy)` : "no disponible — configurar TWELVE_DATA_API_KEY"}`);
  lines.push("");
  lines.push("RIESGO E INTERMERCADO:");
  lines.push(`- VIX: ${fmtFred(r.vix, "", 2)}`);
  lines.push(`- High Yield OAS (diferencial de crédito): ${fmtFred(r.hyOas)}`);
  lines.push(`- MOVE Index: no disponible (dato propietario de ICE, sin fuente gratuita).`);
  lines.push("");
  lines.push("FLUJOS Y POSICIONAMIENTO:");
  if (f.cotGoldManagedMoney) {
    const c = f.cotGoldManagedMoney;
    lines.push(`- COT Managed Money oro (neto): ${c.netCurrent.toLocaleString("es-ES")} contratos, semana anterior ${c.netPrev?.toLocaleString("es-ES") ?? "n/d"} (${c.date}), open interest ${c.openInterest.toLocaleString("es-ES")}`);
  } else {
    lines.push("- COT Managed Money oro: no disponible.");
  }
  lines.push("- Flujos de ETF (GLD) y compras oficiales de bancos centrales (PBoC/World Gold Council): no disponible, sin fuente gratuita conectada todavía.");
  lines.push("");
  lines.push("TÉCNICO (oro, diario):");
  if (t.available) {
    lines.push(`- EMA20: ${t.ema20?.toFixed(2)} | EMA50: ${t.ema50?.toFixed(2)} | EMA100: ${t.ema100?.toFixed(2)} | EMA200: ${t.ema200?.toFixed(2)}`);
    lines.push(`- RSI(14): ${t.rsi14?.toFixed(1)}`);
  } else {
    lines.push("- No disponible (falta configurar un proveedor de precios intradía/históricos).");
  }

  return lines.join("\n");
}

export async function getSystemPrompt(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "analysis.system_prompt" } });
  const fallback =
    "Eres el motor de análisis de VANTAX para XAU/USD y DXY. Usas únicamente los datos provistos. Nunca das recomendaciones de compra/venta directas ni te presentas como asesor financiero licenciado. " +
    "Escribe siempre en español de España (tuteo con \"tú\", nunca voseo con \"vos\"/\"podés\"/\"tenés\").";
  if (setting && typeof setting.value === "object" && setting.value !== null && "value" in (setting.value as any)) {
    return (setting.value as any).value as string;
  }
  return fallback;
}

export async function generateAnalysis(format: "MENSAJE" | "TECNICO") {
  const snapshot = await buildMarketSnapshot();
  const snapshotText = formatSnapshotForPrompt(snapshot);
  const systemPrompt = await getSystemPrompt();

  const formatInstruction =
    format === "MENSAJE"
      ? "Escribí el análisis como un mensaje breve y claro, en tono de analista hablándole directo al usuario (estilo chat/mensaje de texto, 150-250 palabras), sin jerga innecesaria, terminando con un recordatorio corto de que no es asesoramiento financiero."
      : "Devolvé el análisis en formato técnico/estadístico: una lista de los indicadores clave con su valor y una lectura de una línea cada uno (alcista/bajista/neutral para el oro), seguido de un Bias Score (-100 a 100) con su desglose, todo en texto plano bien estructurado (sin markdown de tablas complejas). Terminá con el mismo recordatorio de que no es asesoramiento financiero.";

  const message = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1200,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Estos son los datos de mercado de hoy:\n\n${snapshotText}\n\n${formatInstruction}`,
      },
    ],
  });

  const content = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("\n");

  return { content, snapshot };
}


