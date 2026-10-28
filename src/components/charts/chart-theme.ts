// Estilo del gráfico propio de VANTAX CHARTS (28/10/2026): fondo negro,
// velas alcistas moradas y bajistas blancas (paleta pasada por Esther), con un
// acabado limpio y moderno (sin rejilla marcada, tipografía fina, etiquetas
// redondeadas).

export const CHART_BG = "#000000";
export const UP = "#9B30FF";
export const DOWN = "#F5F3FF";
export const ACCENT = "#A78BFA";
export const TEXT = "#8E88A8";
export const FONT = "Sora, Inter, 'Segoe UI', system-ui, sans-serif";

export const INDICATOR_COLORS = ["#C084FC", "#FFFFFF", "#F472B6", "#60A5FA", "#FBBF24"];

export function chartStyles(type: "candle_solid" | "candle_stroke" | "ohlc" | "area") {
  return {
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: "rgba(255,255,255,0.035)", style: "solid" as const, dashedValue: [2, 2] },
      vertical: { show: false, size: 1, color: "rgba(255,255,255,0.03)", style: "solid" as const, dashedValue: [2, 2] },
    },
    candle: {
      type,
      bar: {
        compareRule: "current_open" as const,
        upColor: UP,
        downColor: DOWN,
        noChangeColor: TEXT,
        upBorderColor: UP,
        downBorderColor: DOWN,
        noChangeBorderColor: TEXT,
        upWickColor: UP,
        downWickColor: DOWN,
        noChangeWickColor: TEXT,
      },
      area: {
        lineSize: 2,
        lineColor: UP,
        smooth: true,
        value: "close",
        backgroundColor: [
          { offset: 0, color: "rgba(155,48,255,0.02)" },
          { offset: 1, color: "rgba(155,48,255,0.28)" },
        ],
        point: { show: true, color: UP, radius: 4, rippleColor: "rgba(155,48,255,0.35)", rippleRadius: 9, animation: true, animationDuration: 1200 },
      },
      priceMark: {
        show: true,
        high: { show: true, color: TEXT, textOffset: 5, textSize: 10, textFamily: FONT, textWeight: "normal" },
        low: { show: true, color: TEXT, textOffset: 5, textSize: 10, textFamily: FONT, textWeight: "normal" },
        last: {
          show: true,
          upColor: UP,
          downColor: "#E9E4FF",
          noChangeColor: TEXT,
          line: { show: true, style: "dashed" as const, dashedValue: [4, 4], size: 1 },
          text: {
            show: true,
            style: "fill" as const,
            color: "#0B0612",
            size: 11,
            paddingLeft: 6,
            paddingTop: 4,
            paddingRight: 6,
            paddingBottom: 4,
            borderRadius: 4,
            borderSize: 0,
            family: FONT,
            weight: 600,
          },
        },
      },
      tooltip: {
        showRule: "always" as const,
        showType: "standard" as const,
        title: { show: false, size: 12, family: FONT, weight: 600, color: "#E9E4FF", marginLeft: 10, marginTop: 8, marginRight: 8, marginBottom: 4, template: "{ticker} · {period}" },
        legend: { size: 11, family: FONT, weight: "normal", color: TEXT, marginLeft: 10, marginTop: 8, marginRight: 4, marginBottom: 4, defaultValue: "—" },
      },
    },
    indicator: {
      lines: INDICATOR_COLORS.map((color) => ({ style: "solid" as const, smooth: false, size: 1.4, dashedValue: [2, 2], color })),
      bars: [
        {
          style: "fill" as const,
          borderStyle: "solid" as const,
          borderSize: 1,
          borderDashedValue: [2, 2],
          upColor: "rgba(155,48,255,0.55)",
          downColor: "rgba(245,243,255,0.45)",
          noChangeColor: TEXT,
        },
      ],
      lastValueMark: { show: false },
      tooltip: {
        title: { size: 11, family: FONT, weight: 600, color: TEXT, marginLeft: 10, marginTop: 6, marginRight: 4, marginBottom: 2 },
        legend: { size: 11, family: FONT, weight: "normal", color: TEXT, marginLeft: 6, marginTop: 6, marginRight: 4, marginBottom: 2 },
      },
    },
    xAxis: {
      axisLine: { show: false },
      tickLine: { show: false },
      tickText: { show: true, color: TEXT, family: FONT, size: 10.5, weight: "normal", marginStart: 6, marginEnd: 6 },
    },
    yAxis: {
      axisLine: { show: false },
      tickLine: { show: false },
      tickText: { show: true, color: TEXT, family: FONT, size: 10.5, weight: "normal", marginStart: 8, marginEnd: 8 },
    },
    separator: { size: 1, color: "rgba(255,255,255,0.06)", fill: true, activeBackgroundColor: "rgba(167,139,250,0.15)" },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: "dashed" as const, dashedValue: [4, 4], size: 1, color: "rgba(196,181,253,0.45)" },
        text: { show: true, style: "fill" as const, color: "#0B0612", size: 11, family: FONT, weight: 600, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4, borderSize: 0, backgroundColor: ACCENT },
      },
      vertical: {
        show: true,
        line: { show: true, style: "dashed" as const, dashedValue: [4, 4], size: 1, color: "rgba(196,181,253,0.45)" },
        text: { show: true, style: "fill" as const, color: "#0B0612", size: 11, family: FONT, weight: 600, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4, borderSize: 0, backgroundColor: ACCENT },
      },
    },
    overlay: {
      point: { color: ACCENT, borderColor: "rgba(167,139,250,0.35)", borderSize: 1, radius: 5, activeColor: ACCENT, activeBorderColor: "rgba(167,139,250,0.45)", activeBorderSize: 3, activeRadius: 5 },
      line: { style: "solid" as const, smooth: false, color: "#C4B5FD", size: 1.5, dashedValue: [4, 4] },
      rect: { style: "fill" as const, color: "rgba(155,48,255,0.14)", borderColor: "#C4B5FD", borderSize: 1, borderRadius: 2, borderStyle: "solid" as const, borderDashedValue: [2, 2] },
      polygon: { style: "fill" as const, color: "rgba(155,48,255,0.14)", borderColor: "#C4B5FD", borderSize: 1, borderStyle: "solid" as const, borderDashedValue: [2, 2] },
      text: { style: "fill" as const, color: "#FFFFFF", size: 12, family: FONT, weight: 500, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderStyle: "solid" as const, borderDashedValue: [2, 2], borderSize: 0, borderRadius: 4, borderColor: ACCENT, backgroundColor: "rgba(124,58,237,0.85)" },
    },
  };
}
