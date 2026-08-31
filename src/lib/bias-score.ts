// Cálculo del Bias Score en base a los datos que la app SÍ puede traer en
// vivo (FRED + Twelve Data + CFTC pública). El documento de arquitectura
// original define 4 módulos (Macro 40%, Flujos 25%, Riesgo 15%, Técnico
// 20%). Todos están cubiertos con fuentes gratuitas, aunque de forma
// parcial en dos casos: Flujos solo usa el posicionamiento de futuros (COT),
// todavía sin los flujos de ETF (GLD) ni las compras oficiales (PBoC); y
// Riesgo solo usa el VIX, sin el MOVE Index (propiedad de ICE, sin fuente
// gratuita — se muestra aparte, solo como referencia visual, en /mercado).
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

import type { MarketSnapshot } from "./vantax-data";

export type BiasIndicator = {
  label: string;
  value: string;
  score: number | null; // -100..100
  note: string;
};

export type BiasModule = {
  key: "macro" | "flujos" | "riesgo" | "tecnico";
  name: string;
  weight: number; // peso original según el documento de arquitectura
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

export function computeBiasScore(snapshot: MarketSnapshot): BiasResult {
  const { macro, technical, risk, flows } = snapshot;

  // --- Módulo Macro & Tasas (peso 40%) ---
  const macroIndicators: BiasIndicator[] = [];

  if (macro.us10yTipsReal) {
    // Rendimiento real (TIPS 10y) alto = mayor costo de oportunidad de sostener oro = bajista.
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

  // --- Módulo Técnico & Microestructura (peso 20%) ---
  const tecnicoIndicators: BiasIndicator[] = [];

  if (technical.available && technical.ema20 !== null && technical.ema50 !== null && technical.ema200 !== null) {
    const alignment =
      (technical.ema20! > technical.ema50! ? 1 : -1) + (technical.ema50! > technical.ema200! ? 1 : -1);
    const s = alignment * 40; // -80..80: ambas medias alineadas alcistas o bajistas
    tecnicoIndicators.push({
      label: "Alineación de medias (EMA20/50/200)",
      value: `EMA20 ${technical.ema20!.toFixed(2)} · EMA50 ${technical.ema50!.toFixed(2)} · EMA200 ${technical.ema200!.toFixed(2)}`,
      score: s,
      note: "Medias cortas por encima de las largas → estructura de tendencia alcista.",
    });
  }

  if (technical.available && technical.rsi14 !== null) {
    // RSI centrado en 50; > 70 sobrecompra (riesgo de corrección), < 30 sobreventa (riesgo de rebote).
    const s = clamp((technical.rsi14! - 50) * 2.2, -100, 100);
    tecnicoIndicators.push({
      label: "RSI (14, diario)",
      value: technical.rsi14!.toFixed(1),
      score: s,
      note: "Momentum del precio; valores extremos (>70 / <30) señalan sobrecompra o sobreventa.",
    });
  }

  // --- Módulo Flujos & Posicionamiento (peso 25%) ---
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

  // --- Módulo Intermercado & Riesgo (peso 15%) ---
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

  const modules: BiasModule[] = [
    {
      key: "macro",
      name: "Macro & Tasas",
      weight: 0.4,
      available: macroIndicators.length > 0,
      score: average(macroIndicators.map((i) => i.score)),
      unavailableReason: macroIndicators.length === 0 ? "Falta configurar FRED_API_KEY." : undefined,
      indicators: macroIndicators,
    },
    {
      key: "flujos",
      name: "Flujos & Posicionamiento",
      weight: 0.25,
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
      weight: 0.15,
      available: riesgoIndicators.length > 0,
      score: average(riesgoIndicators.map((i) => i.score)),
      unavailableReason: riesgoIndicators.length === 0 ? "Falta configurar FRED_API_KEY (VIX)." : undefined,
      indicators: riesgoIndicators,
    },
    {
      key: "tecnico",
      name: "Técnico & Microestructura",
      weight: 0.2,
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


