// Cálculo del Bias Score en base a los datos que la app SÍ puede traer en
// vivo (FRED + Twelve Data + CFTC pública). El documento de arquitectura
// original definía 4 módulos con pesos Macro 40%, Flujos 25%, Riesgo 15%,
// Técnico 20%. Desde que se añadió el sesgo por temporalidad (pedido de
// Esther, 05/10/2026: pestañas 15min/30min/1h/Diario en /mercado), los
// pesos ya NO son fijos — cada temporalidad tiene su propio esquema (ver
// TIMEFRAME_WEIGHTS más abajo): cuanto más corta la temporalidad, más peso
// se le da a Técnico (lo único que de verdad cambia intradía) y menos a
// Macro/Flujos (datos lentos — mensuales, semanales — que apenas aportan
// para decidir una entrada en M15/M30). El esquema "1day" es el que se
// reajustó primero (Macro 40%→25%, Técnico 20%→30%, Flujos 25%→30%) porque
// con el peso original, en semanas de inflación aún alta Y rendimientos
// reales subiendo por esa misma inflación, el módulo Macro salía casi
// neutro (sus propios indicadores se cancelaban entre sí) y aplastaba el
// total aunque Técnico y Flujos sí reflejaran una caída real del precio.
// Macro ya cubre tasas reales y nominales, curva 10Y/2Y y 10Y/3M,
// CPI, Core PCE, PPI y breakeven de inflación 10 años. Riesgo cubre VIX y
// el diferencial de crédito High Yield (OAS). Quedan dos módulos parciales:
// Flujos solo usa el posicionamiento de futuros (COT), todavía sin los
// flujos de ETF (GLD) ni las compras oficiales de bancos centrales (PBoC,
// dato del World Gold Council); y Riesgo no incluye el MOVE Index
// (propiedad de ICE, sin fuente gratuita — se muestra aparte, solo como
// referencia visual, en /mercado).
// Si un indicador puntual no está disponible en un momento dado, no se
// inventa: el módulo se marca "no disponible" y el score total se
// recalcula solo sobre los módulos con datos reales, con sus pesos
// reescalados.
//
// La calificación de cada indicador es una heurística direccional
// transparente (documentada al lado de cada número), no una fórmula
// econométrica validada. Es exactamente el mismo enfoque cualitativo
// (-100 a +100 por indicador, promediado por módulo) del panel original,
// aplicado solo a los indicadores que tenemos con datos reales.

import type { MarketSnapshot, TimeframeKey } from "./vantax-data";

export type { TimeframeKey };

// Etiquetas cortas para las pestañas de /mercado.
export const TIMEFRAME_LABEL: Record<TimeframeKey, string> = {
  "15min": "15min",
  "30min": "30min",
  "1h": "1h",
  "1day": "Diario",
};

// Pesos por temporalidad — ver nota al principio del archivo. Todas suman
// 1.0. Riesgo (VIX/HY OAS/DXY) se deja igual en las 3 temporalidades
// intradía: el VIX y el HY OAS son de cierre diario igual que en Diario,
// pero el DXY sí se actualiza casi en vivo (caché de 5 min), así que ese
// módulo no pierde del todo relevancia al acortar la temporalidad.
const TIMEFRAME_WEIGHTS: Record<TimeframeKey, { macro: number; flujos: number; riesgo: number; tecnico: number }> = {
  "15min": { macro: 0.05, flujos: 0.05, riesgo: 0.2, tecnico: 0.7 },
  "30min": { macro: 0.1, flujos: 0.1, riesgo: 0.2, tecnico: 0.6 },
  "1h": { macro: 0.15, flujos: 0.15, riesgo: 0.2, tecnico: 0.5 },
  "1day": { macro: 0.25, flujos: 0.3, riesgo: 0.15, tecnico: 0.3 },
};

export type BiasIndicator = {
  label: string;
  value: string;
  score: number | null; // -100..100
  note: string;
};

export type BiasModule = {
  key: "macro" | "flujos" | "riesgo" | "tecnico";
  name: string;
  weight: number; // peso para la temporalidad con la que se calculó este resultado (ver TIMEFRAME_WEIGHTS)
  available: boolean;
  score: number | null; // -100..100, promedio de los indicadores del módulo
  unavailableReason?: string;
  indicators: BiasIndicator[];
};

export type BiasResult = {
  total: number | null; // -100..100
  label: string;
  modules: BiasModule[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function average(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function scoreLabel(score: number): string {
  if (score >= 40) return "Alcista fuerte (oro)";
  if (score >= 12) return "Sesgo alcista (oro)";
  if (score > -12) return "Neutral";
  if (score > -40) return "Sesgo bajista (oro)";
  return "Bajista fuerte (oro)";
}

export function computeBiasScore(snapshot: MarketSnapshot, timeframe: TimeframeKey = "1day"): BiasResult {
  const { macro, risk, flows, prices } = snapshot;
  const technical = snapshot.technicalByTimeframe[timeframe];
  const weights = TIMEFRAME_WEIGHTS[timeframe];

  // --- Módulo Macro & Tasas (peso: ver TIMEFRAME_WEIGHTS) ---
  const macroIndicators: BiasIndicator[] = [];

  if (macro.us10yTipsReal) {
    // Rendimiento real (TIPS 10y) alto = mayor coste de oportunidad de sostener oro = bajista.
    const v = macro.us10yTipsReal.value;
    const s = clamp((1.5 - v) * 40, -100, 100); // ~1.5% real ≈ neutral, referencia del documento
    macroIndicators.push({
      label: "TIPS 10 años (rendimiento real)",
      value: `${v.toFixed(2)}% (${macro.us10yTipsReal.date})`,
      score: s,
      note: "Real yield alto → mayor coste de oportunidad de sostener oro sin cupón.",
    });
  }

  if (macro.cpiYoY) {
    // Inflación por encima del objetivo del 2% de la Fed → suele ser soporte para el oro como cobertura.
    const v = macro.cpiYoY.value;
    const s = clamp((v - 2) * 35, -100, 100);
    macroIndicators.push({
      label: "CPI interanual",
      value: `${v.toFixed(2)}% (${macro.cpiYoY.date})`,
      score: s,
      note: "Por encima del objetivo del 2% de la Fed → soporte de cobertura para el oro.",
    });
  }

  if (macro.us10yNominal && macro.us2y) {
    // Pendiente de la curva 10y-2y: más plana/invertida = señal de riesgo de recesión = alcista para oro refugio.
    const spread = macro.us10yNominal.value - macro.us2y.value;
    const s = clamp(-spread * 45, -100, 100);
    macroIndicators.push({
      label: "Curva 10Y/2Y",
      value: `${macro.us10yNominal.value.toFixed(2)}% / ${macro.us2y.value.toFixed(2)}% (spread ${spread.toFixed(2)} pp)`,
      score: s,
      note: "Curva más plana o invertida → mayor señal de recesión → soporte de refugio para el oro.",
    });
  }

  if (macro.t3m10ySpread) {
    // Spread 10Y-3M: el más citado por la Fed como señal de recesión. Invertido (negativo) = alerta.
    const v = macro.t3m10ySpread.value;
    const s = clamp(-v * 45, -100, 100);
    // La nota tiene que reflejar el signo REAL del spread de hoy, no asumir
    // que siempre está invertido — antes decía "invertido" incluso con
    // spread positivo, contradiciendo el propio valor mostrado al lado.
    const spreadNote =
      v < 0
        ? "Spread invertido (negativo) → señal de recesión seguida de cerca por la Fed → soporte para el oro."
        : "Spread normal (positivo) → sin señal de recesión en la curva por ahora → resta soporte de refugio para el oro.";
    macroIndicators.push({
      label: "Curva 10Y/3M",
      value: `${v.toFixed(2)} pp (${macro.t3m10ySpread.date})`,
      score: s,
      note: spreadNote,
    });
  }

  if (macro.corePceYoY) {
    // PCE subyacente: el indicador de inflación que más vigila la Fed para su objetivo del 2%.
    const v = macro.corePceYoY.value;
    const s = clamp((v - 2) * 35, -100, 100);
    macroIndicators.push({
      label: "Core PCE interanual",
      value: `${v.toFixed(2)}% (${macro.corePceYoY.date})`,
      score: s,
      note: "Métrica de inflación oficial de la Fed; por encima del objetivo del 2% → soporte de cobertura para el oro.",
    });
  }

  if (macro.ppiYoY) {
    // PPI: indicador adelantado de presiones de costes, suele preceder al CPI.
    const v = macro.ppiYoY.value;
    const s = clamp((v - 2) * 20, -100, 100);
    macroIndicators.push({
      label: "PPI interanual",
      value: `${v.toFixed(2)}% (${macro.ppiYoY.date})`,
      score: s,
      note: "Indicador adelantado de presiones de precios en la cadena de producción.",
    });
  }

  if (macro.breakeven10y) {
    // Expectativas de inflación a 10 años implícitas en el mercado de bonos.
    const v = macro.breakeven10y.value;
    const s = clamp((v - 2.2) * 40, -100, 100);
    macroIndicators.push({
      label: "Breakeven de inflación 10 años",
      value: `${v.toFixed(2)}% (${macro.breakeven10y.date})`,
      score: s,
      note: "Expectativa de inflación implícita en bonos; por encima de ~2.2% → soporte de cobertura para el oro.",
    });
  }

  // --- Módulo Técnico & Microestructura (peso: ver TIMEFRAME_WEIGHTS) ---
  // Los periodos de EMA (fast/mid/slow) dependen de la temporalidad elegida
  // — ver TIMEFRAME_EMA_PERIODS en vantax-data.ts (9/21/50 en M15/M30,
  // 20/50/200 en H1/Diario). Por eso aquí la etiqueta y la nota se arman
  // con los periodos reales de `technical`, nunca con "EMA20/50/200" fijo.
  const tecnicoIndicators: BiasIndicator[] = [];

  if (technical.available && technical.emaFast !== null && technical.emaMid !== null && technical.emaSlow !== null) {
    const { emaFastPeriod, emaMidPeriod, emaSlowPeriod, emaFast, emaMid, emaSlow } = technical;
    const shortAboveMid = emaFast > emaMid;
    const midAboveLong = emaMid > emaSlow;
    const alignment = (shortAboveMid ? 1 : -1) + (midAboveLong ? 1 : -1);
    const s = alignment * 40; // -80..80: ambas medias alineadas alcistas o bajistas
    // La nota tiene que decir lo que de verdad muestran las medias de hoy —
    // antes siempre decía "alcista" aunque el orden real fuera el
    // contrario, contradiciendo el dato.
    const alignmentNote =
      alignment === 2
        ? `Medias cortas por encima de las largas (EMA${emaFastPeriod} > EMA${emaMidPeriod} > EMA${emaSlowPeriod}) → estructura de tendencia alcista.`
        : alignment === -2
        ? `Medias cortas por debajo de las largas (EMA${emaFastPeriod} < EMA${emaMidPeriod} < EMA${emaSlowPeriod}) → estructura de tendencia bajista.`
        : "Medias sin alineación clara (cruzadas entre sí) → estructura de tendencia indecisa/en transición.";
    tecnicoIndicators.push({
      label: `Alineación de medias (EMA${emaFastPeriod}/${emaMidPeriod}/${emaSlowPeriod})`,
      value: `EMA${emaFastPeriod} ${emaFast.toFixed(2)} · EMA${emaMidPeriod} ${emaMid.toFixed(2)} · EMA${emaSlowPeriod} ${emaSlow.toFixed(2)}`,
      score: s,
      note: alignmentNote,
    });
  }

  if (technical.available && technical.rsi14 !== null) {
    // RSI centrado en 50; > 70 sobrecompra (riesgo de corrección), < 30 sobreventa (riesgo de rebote).
    const s = clamp((technical.rsi14! - 50) * 2.2, -100, 100);
    tecnicoIndicators.push({
      label: "RSI (14)",
      value: technical.rsi14!.toFixed(1),
      score: s,
      note: "Momentum del precio; valores extremos (>70 / <30) señalan sobrecompra o sobreventa.",
    });
  }

  // --- Módulo Flujos & Posicionamiento (peso: ver TIMEFRAME_WEIGHTS) ---
  // Cubrimos la pata de futuros (COT) con datos públicos y gratuitos de la
  // CFTC. Los ETF (GLD) y las compras oficiales (PBoC) todavía no están
  // conectados — quedan para una siguiente vuelta.
  const flujosIndicators: BiasIndicator[] = [];

  if (flows.cotGoldManagedMoney && flows.cotGoldManagedMoney.netPrev !== null) {
    const { netCurrent, netPrev, openInterest, date } = flows.cotGoldManagedMoney;
    const change = netCurrent - netPrev!;
    const pctOfOpenInterest = change / openInterest;
    const s = clamp(pctOfOpenInterest * 1200, -100, 100);
    flujosIndicators.push({
      label: "Cambio semanal posicionamiento Managed Money (COT, oro COMEX)",
      value: `Neto ${netCurrent.toLocaleString("es-ES")} contratos (cambio ${change >= 0 ? "+" : ""}${change.toLocaleString("es-ES")}) · ${date}`,
      score: s,
      note: "Fondos especulativos ampliando posición neta larga → flujo comprador; recortándola → flujo vendedor.",
    });
  }

  if (flows.cotGoldManagedMoney && flows.cotGoldManagedMoney.cotIndex3y !== null) {
    const { cotIndex3y, date } = flows.cotGoldManagedMoney;
    // Señal de EXTREMO de posicionamiento (distinta de la de arriba, que
    // mide la dirección del flujo semana a semana): cuando el índice está
    // muy alto o muy bajo dentro de su rango de ~3 años, históricamente
    // aumenta el riesgo de un giro o toma de beneficios en sentido
    // contrario — lo que enseña Esther en el vídeo 3. Se pondera bastante
    // más suave que el cambio semanal porque es una señal de riesgo/
    // contexto (contraria), no de dirección del flujo.
    const extremo = cotIndex3y >= 80 ? "muy comprado" : cotIndex3y <= 20 ? "muy vendido" : "sin extremo";
    const s = clamp(-(cotIndex3y - 50) * 0.8, -100, 100);
    const cotIndexNote =
      cotIndex3y >= 80
        ? "Posicionamiento cerca del máximo de 3 años → riesgo de giro/toma de beneficios (señal contraria, resta soporte)."
        : cotIndex3y <= 20
        ? "Posicionamiento cerca del mínimo de 3 años → riesgo de rebote por cobertura de cortos (señal contraria, soporte para el oro)."
        : "Posicionamiento sin extremo dentro de su rango de 3 años → sin señal contraria relevante ahora mismo.";
    flujosIndicators.push({
      label: "COT Index (extremo de posicionamiento, ~3 años)",
      value: `${cotIndex3y.toFixed(0)}/100 (${extremo}) · ${date}`,
      score: s,
      note: cotIndexNote,
    });
  }

  // --- Módulo Intermercado & Riesgo (peso: ver TIMEFRAME_WEIGHTS) ---
  // Cubrimos el VIX (gratis en FRED). El MOVE Index (volatilidad de bonos)
  // es propiedad de ICE y no tiene fuente gratuita — se muestra solo como
  // referencia visual en /mercado, sin entrar en este cálculo.
  const riesgoIndicators: BiasIndicator[] = [];

  if (risk.vix) {
    const v = risk.vix.value;
    // ~16 puntos como zona de calma histórica reciente; VIX alto = aversión al riesgo = refugio en oro.
    const s = clamp((v - 16) * 6, -100, 100);
    riesgoIndicators.push({
      label: "VIX (índice de volatilidad CBOE)",
      value: `${v.toFixed(2)} (${risk.vix.date})`,
      score: s,
      note: "VIX elevado → aversión al riesgo → soporte de refugio para el oro. VIX bajo → apetito por riesgo → resta soporte.",
    });
  }

  if (risk.hyOas) {
    // Diferencial de crédito high-yield: se amplía cuando el mercado teme estrés financiero/crediticio.
    const v = risk.hyOas.value;
    const s = clamp((v - 3.5) * 25, -100, 100);
    riesgoIndicators.push({
      label: "High Yield OAS (diferencial de crédito)",
      value: `${v.toFixed(2)}% (${risk.hyOas.date})`,
      score: s,
      note: "Diferencial amplio → estrés de crédito/aversión al riesgo → soporte de refugio para el oro.",
    });
  }

  if (prices.dxy) {
    // Correlación inversa clásica oro-dólar (vídeo del módulo 7 de
    // intermercado de Esther): usamos el cambio del día del DXY, no su
    // nivel absoluto, porque no tenemos una referencia histórica de "DXY
    // neutral" tan clara como sí la tenemos para el VIX o el HY OAS.
    const pct = prices.dxy.percentChange;
    const s = clamp(-pct * 20, -100, 100);
    riesgoIndicators.push({
      label: "DXY (índice del dólar, correlación intermercado)",
      value: `${prices.dxy.price.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% hoy)`,
      score: s,
      note: "DXY subiendo (dólar fuerte) → presión bajista típica sobre el oro por correlación inversa; DXY bajando → soporte para el oro.",
    });
  }

  // Pesos según la temporalidad elegida — ver TIMEFRAME_WEIGHTS al
  // principio del archivo para el razonamiento completo de cada esquema.
  const modules: BiasModule[] = [
    {
      key: "macro",
      name: "Macro & Tasas",
      weight: weights.macro,
      available: macroIndicators.length > 0,
      score: average(macroIndicators.map((i) => i.score)),
      unavailableReason: macroIndicators.length === 0 ? "Falta configurar FRED_API_KEY." : undefined,
      indicators: macroIndicators,
    },
    {
      key: "flujos",
      name: "Flujos & Posicionamiento",
      weight: weights.flujos,
      available: flujosIndicators.length > 0,
      score: average(flujosIndicators.map((i) => i.score)),
      unavailableReason:
        flujosIndicators.length === 0
          ? "Reporte COT semanal de la CFTC sin datos suficientes todavía (necesita al menos 2 semanas publicadas). Los flujos de ETF (GLD) y compras oficiales (PBoC) todavía no están conectados."
          : undefined,
      indicators: flujosIndicators,
    },
    {
      key: "riesgo",
      name: "Intermercado & Riesgo",
      weight: weights.riesgo,
      available: riesgoIndicators.length > 0,
      score: average(riesgoIndicators.map((i) => i.score)),
      unavailableReason: riesgoIndicators.length === 0 ? "Falta configurar FRED_API_KEY (VIX)." : undefined,
      indicators: riesgoIndicators,
    },
    {
      key: "tecnico",
      name: "Técnico & Microestructura",
      weight: weights.tecnico,
      available: tecnicoIndicators.length > 0,
      score: average(tecnicoIndicators.map((i) => i.score)),
      unavailableReason: tecnicoIndicators.length === 0 ? "Falta configurar TWELVE_DATA_API_KEY." : undefined,
      indicators: tecnicoIndicators,
    },
  ];

  const availableModules = modules.filter((m) => m.available && m.score !== null);
  const weightSum = availableModules.reduce((sum, m) => sum + m.weight, 0);
  const total =
    weightSum > 0
      ? availableModules.reduce((sum, m) => sum + m.score! * m.weight, 0) / weightSum
      : null;

  return {
    total,
    label: total !== null ? scoreLabel(total) : "Sin datos suficientes",
    modules,
  };
}
