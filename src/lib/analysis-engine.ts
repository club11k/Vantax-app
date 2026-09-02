import { anthropic, ANALYSIS_MODEL } from "@/lib/anthropic";
import { buildMarketSnapshot, MarketSnapshot } from "@/lib/vantax-data";
import { prisma } from "@/lib/prisma";

export type AnalysisImageInput = {
  label: string;
  mediaType: string;
  base64Data: string;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

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
    lines.push("");
    lines.push("NIVELES TÉCNICOS CLAVE DEL ORO (zonas de soporte/resistencia calculadas a partir de máximos y mínimos oscilantes reales de precio histórico — nunca inventadas):");
    if (t.levels && (t.levels.supports.length > 0 || t.levels.resistances.length > 0)) {
      if (t.levels.supports.length > 0) {
        lines.push(
          "- Soportes (de más cercano a más lejano del precio actual): " +
            t.levels.supports.map((s) => `$${s.level.toFixed(0)} (${s.touches} toque${s.touches > 1 ? "s" : ""})`).join(", ")
        );
      } else {
        lines.push("- Soportes: no se detectó ninguna zona clara por debajo del precio actual en el histórico disponible.");
      }
      if (t.levels.resistances.length > 0) {
        lines.push(
          "- Resistencias (de más cercana a más lejana del precio actual): " +
            t.levels.resistances.map((r2) => `$${r2.level.toFixed(0)} (${r2.touches} toque${r2.touches > 1 ? "s" : ""})`).join(", ")
        );
      } else {
        lines.push("- Resistencias: no se detectó ninguna zona clara por encima del precio actual en el histórico disponible.");
      }
    } else {
      lines.push("- No hay suficiente histórico de precio todavía para calcular zonas fiables.");
    }
  } else {
    lines.push("- No disponible (falta configurar un proveedor de precios intradía/históricos).");
  }

  return lines.join("\n");
}

export async function getSystemPrompt(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "analysis.system_prompt" } });
  const fallback =
    "Eres el analista de mercado de VANTAX. Le escribes directamente a una comunidad de traders que sigue tu " +
    "lectura semanal del oro (XAU/USD) y del dólar (DXY). Usas únicamente los datos de mercado que se te " +
    "proporcionan (tasas, inflación, liquidez, empleo, riesgo, posicionamiento y niveles técnicos) — nunca " +
    "inventas una cifra, un nivel de precio ni un dato que no esté en el snapshot. Si un dato no está " +
    "disponible, lo dices abiertamente en vez de rellenarlo. Nunca das una orden directa de compra/venta " +
    "(\"compra ahora\", \"vende\") ni te presentas como asesor financiero licenciado — hablas siempre en " +
    "términos de cómo TÚ lees el mercado (\"para mí\", \"lo veo como\", \"mi sesgo es\"), no como una " +
    "instrucción. Terminas siempre recordando, de forma natural y no como aviso legal aparte, que esto no es " +
    "asesoramiento financiero. Escribes siempre en español de España (tuteo con \"tú\", nunca voseo con " +
    "\"vos\"/\"podés\"/\"tenés\").\n\n" +
    "TONO Y ESTILO — esto es lo más importante: escribes como un analista experimentado que se comunica de " +
    "forma cercana y directa con su comunidad, no como un informe corporativo. Primera persona, frases " +
    "naturales, alguna pregunta retórica ocasional (\"¿me explico?\") si encaja, sin forzarla. Nada de listas " +
    "esquemáticas de viñetas para los motivos — tejes los datos dentro de la prosa, como si se lo estuvieras " +
    "explicando a alguien en una llamada. Evita el lenguaje absoluto o alarmista (\"sin duda\", \"seguro que\") " +
    "— habla en términos de sesgo y probabilidad. Puedes cerrar como mucho con un emoji discreto si aporta " +
    "cercanía, nunca más de uno y nunca en medio del texto.\n\n" +
    "ESTRUCTURA que debe seguir el análisis, en este orden: (1) un saludo breve y natural; (2) dónde cotiza " +
    "el oro ahora mismo y el rango en el que se mueve, usando los niveles técnicos calculados que se te dan " +
    "(nunca un rango inventado); (3) tu sesgo para el periodo en una frase clara (alcista / neutral / " +
    "bajista, con matices — \"neutral-bajista sin ser un drama\" es un buen ejemplo de precisión); (4) los " +
    "motivos principales, citando datos concretos del snapshot (tasas reales, Fed, inflación, fortaleza o " +
    "debilidad del dólar, posicionamiento/flujos) tejidos en prosa; (5) qué matiza o contradice ese sesgo — " +
    "nunca presentes solo el lado que confirma tu lectura; (6) qué evento o dato próximo del calendario puede " +
    "cambiar la lectura; (7) los niveles clave con precios concretos — soporte(s) por abajo y resistencia(s) " +
    "por arriba, usando exactamente los niveles técnicos que se te proporcionan, nunca un número inventado; " +
    "(8) un resumen final tipo \"así que resumiendo...\" que recapitula el plan (qué pasa si se mantiene el " +
    "rango, qué pasa si se pierde el soporte, qué pasa si se rompe la resistencia).\n\n" +
    "SI SE TE ADJUNTAN CAPTURAS DE GRÁFICO (varias temporalidades, cada una etiquetada): úsalas únicamente " +
    "como contexto visual para confirmar o matizar la estructura y tendencia (velas, figuras chartistas, " +
    "dónde reaccionó el precio en el pasado reciente) — nunca leas ni menciones un precio o nivel que veas " +
    "en la imagen si no coincide con los niveles técnicos calculados que se te dan en el snapshot; los " +
    "precios y niveles que comuniques deben salir siempre del snapshot numérico, no de tu lectura visual del " +
    "gráfico.";
  if (setting && typeof setting.value === "object" && setting.value !== null && "value" in (setting.value as any)) {
    return (setting.value as any).value as string;
  }
  return fallback;
}

export async function generateAnalysis(format: "MENSAJE" | "TECNICO", images?: AnalysisImageInput[]) {
  const snapshot = await buildMarketSnapshot();
  const snapshotText = formatSnapshotForPrompt(snapshot);
  const systemPrompt = await getSystemPrompt();

  const validImages = (images ?? []).filter((img) => ALLOWED_IMAGE_TYPES.has(img.mediaType));

  const formatInstruction =
    format === "MENSAJE"
      ? "Escribe el análisis siguiendo al pie de la letra la estructura y el tono que se describen en tus " +
        "instrucciones (saludo, precio y rango, sesgo en una frase, motivos tejidos en prosa citando datos " +
        "concretos, matices en contra, próximo catalizador, niveles clave con precios reales, resumen final). " +
        "Extensión objetivo: 300-450 palabras. Es el formato que la comunidad de traders lee cada semana, así " +
        "que prioriza que suene a una persona real hablándoles, no a un informe."
      : "Devuelve el análisis en formato técnico/estadístico: primero una lista de los indicadores clave con " +
        "su valor y una lectura de una línea cada uno (alcista/bajista/neutral para el oro); después, un " +
        "bloque \"NIVELES CLAVE\" con los soportes y resistencias exactos que se te dan en los datos (nunca " +
        "inventados); después, un Bias Score (-100 a 100) con su desglose por módulo (Macro, Flujos, Riesgo, " +
        "Técnico). Todo en texto plano bien estructurado, sin markdown de tablas complejas. Termina con el " +
        "mismo recordatorio de que no es asesoramiento financiero, integrado de forma natural.";

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string } }
  > = [];

  if (validImages.length > 0) {
    userContent.push({
      type: "text",
      text:
        `Te adjunto ${validImages.length} captura(s) de gráfico de referencia (una por temporalidad), solo ` +
        "como contexto visual de estructura y tendencia — los precios y niveles que uses deben salir siempre " +
        "de los datos numéricos que te doy después, nunca de una lectura del precio en la imagen.",
    });
    for (const img of validImages) {
      userContent.push({ type: "text", text: `Temporalidad: ${img.label}` });
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: img.base64Data,
        },
      });
    }
  }

  userContent.push({
    type: "text",
    text: `Estos son los datos de mercado de hoy:\n\n${snapshotText}\n\n${formatInstruction}`,
  });

  const message = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const content = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("\n");

  return { content, snapshot };
}

