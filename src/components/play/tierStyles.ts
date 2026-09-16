// Colores y etiquetas de los tramos de Vantax Play — un único sitio para
// que la barra de progreso, el armario de cofres y cualquier otra pantalla
// futura (ranking, tienda) usen siempre los mismos colores.

export type PlayTierValue = "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO";

export const TIER_ORDER: PlayTierValue[] = ["BASICO", "INTERMEDIO", "EPICO", "LEGENDARIO"];

// Deliberadamente distintos entre sí y del color del cofre decorativo, tal y
// como pidió Esther. Legendario es lila a propósito.
export const TIER_COLOR: Record<PlayTierValue, string> = {
  BASICO: "#8B92A8",
  INTERMEDIO: "#63A88C",
  EPICO: "#D9A15B",
  LEGENDARIO: "#BBAAF7",
};

export const TIER_LABEL: Record<PlayTierValue, string> = {
  BASICO: "Básico",
  INTERMEDIO: "Intermedio",
  EPICO: "Épico",
  LEGENDARIO: "Legendario",
};

// Color del cofre decorativo / icono genérico: distinto a los 4 de arriba,
// para que siempre destaque sea cual sea el tramo actual.
export const CHEST_ACCENT_COLOR = "#C15A82";
