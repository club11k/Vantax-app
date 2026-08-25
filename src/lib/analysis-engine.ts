import { anthropic, ANALYSIS_MODEL } from "@/lib/anthropic";
import { buildMarketSnapshot, MarketSnapshot } from "@/lib/vantax-data";
import { prisma } from "@/lib/prisma";

function formatSnapshotForPrompt(snapshot: MarketSnapshot): string {
  const lines: string[] = [];
  const m = snapshot.macro;
  const p = snapshot.prices;
  const t = snapshot.technical;

  lines.push(`Snapshot generado: ${snapshot.generatedAt}`);
  lines.push("");
  lines.push("MACRO:");
  lines.push(`- US 10Y nominal: ${m.us10yNominal ? `${m.us10yNominal.value}% (${m.us10yNominal.date})` : "no disponible"}`);
  lines.push(`- US 10Y TIPS (real): ${m.us10yTipsReal ? `${m.us10yTipsReal.value}% (${m.us10yTipsReal.date})` : "no disponible"}`);
  lines.push(`- US 2Y: ${m.us2y ? `${m.us2y.value}% (${m.us2y.date})` : "no disponible"}`);
  lines.push(`- CPI YoY: ${m.cpiYoY ? `${m.cpiYoY.value.toFixed(2)}% (${m.cpiYoY.date})` : "no disponible"}`);
  lines.push(`- Core CPI YoY: ${m.coreCpiYoY ? `${m.coreCpiYoY.value.toFixed(2)}% (${m.coreCpiYoY.date})` : "no disponible"}`);
  lines.push(`- Tasa de desempleo: ${m.unemploymentRate ? `${m.unemploymentRate.value}% (${m.unemploymentRate.date})` : "no disponible"}`);
  lines.push("");
  lines.push("PRECIOS:");
  lines.push(`- Oro (XAU/USD): ${p.gold ? `$${p.gold.price} (${p.gold.percentChange >= 0 ? "+" : ""}${p.gold.percentChange}% hoy)` : "no disponible — configurar TWELVE_DATA_API_KEY"}`);
  lines.push(`- DXY: ${p.dxy ? `${p.dxy.price} (${p.dxy.percentChange >= 0 ? "+" : ""}${p.dxy.percentChange}% hoy)` : "no disponible — configurar TWELVE_DATA_API_KEY"}`);
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
    "Sos el motor de análisis de VANTAX para XAU/USD y DXY. Usás únicamente los datos provistos. Nunca das recomendaciones de compra/venta directas ni te presentás como asesor financiero licenciado.";
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
