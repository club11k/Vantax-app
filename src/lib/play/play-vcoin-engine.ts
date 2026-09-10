// vcoin-engine (Vantax Play) — única fuente de verdad para:
//  - convertir lotes operados en V-COIN (según tipo de cuenta normal/cent)
//  - determinar el tramo (básico/intermedio/épico/legendario) según saldo
//
// Portado de club11k/vantax-play-backend (src/services/vcoinEngine.js). La
// configuración vive en el modelo Setting de VANTAX (clave/valor genérico),
// bajo las claves "play.*", en vez de en una tabla `config` de una sola fila
// como en el proyecto original.
//
// Nota: igual que en el proyecto original, esta tasa fija (no por tramos)
// es la que usa el cálculo automático — la tabla PlayVCoinScale existe en el
// esquema para una futura escala por rangos, pero todavía no está conectada
// aquí (tampoco lo estaba en el original).

import { prisma } from "@/lib/prisma";

export type PlayAccountTypeValue = "NORMAL" | "CENT";

export type PlayConfig = {
  vcoinRatePerLot: number;
  centFactor: number;
  tierBasicoMin: number;
  tierIntermedioMin: number;
  tierEpicoMin: number;
  tierLegendarioMin: number;
};

const DEFAULT_CONFIG: PlayConfig = {
  vcoinRatePerLot: 10,
  centFactor: 0.01,
  tierBasicoMin: 0,
  tierIntermedioMin: 200,
  tierEpicoMin: 1000,
  tierLegendarioMin: 5000,
};

const SETTING_KEYS: Record<keyof PlayConfig, string> = {
  vcoinRatePerLot: "play.vcoin_rate_per_lot",
  centFactor: "play.cent_factor",
  tierBasicoMin: "play.tier_basico_min",
  tierIntermedioMin: "play.tier_intermedio_min",
  tierEpicoMin: "play.tier_epico_min",
  tierLegendarioMin: "play.tier_legendario_min",
};

function readSettingNumber(value: unknown, fallback: number): number {
  const raw = value && typeof value === "object" && "value" in (value as any) ? (value as any).value : value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

export async function getPlayConfig(): Promise<PlayConfig> {
  const keys = Object.values(SETTING_KEYS);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const config = { ...DEFAULT_CONFIG };
  for (const field of Object.keys(SETTING_KEYS) as (keyof PlayConfig)[]) {
    const settingKey = SETTING_KEYS[field];
    if (byKey.has(settingKey)) {
      config[field] = readSettingNumber(byKey.get(settingKey), DEFAULT_CONFIG[field]);
    }
  }
  return config;
}

export function vcoinsForLots(params: { lots: number; accountType: PlayAccountTypeValue; config: PlayConfig }): number {
  const { lots, accountType, config } = params;
  const factor = accountType === "CENT" ? config.centFactor : 1;
  const raw = Number(lots) * config.vcoinRatePerLot * factor;
  return Math.round(raw * 100) / 100;
}

export const PLAY_TIERS = ["BASICO", "INTERMEDIO", "EPICO", "LEGENDARIO"] as const;
export type PlayTierValue = (typeof PLAY_TIERS)[number];

export function tierForBalance(params: { balance: number; accountType: PlayAccountTypeValue; config: PlayConfig }): PlayTierValue {
  const { balance, accountType, config } = params;
  // El saldo de cuentas Cent se normaliza a "equivalente normal" antes de
  // comparar con los umbrales (que siempre se definen en unidades normales).
  const normalizedBalance = accountType === "CENT" ? Number(balance) * config.centFactor : Number(balance);

  if (normalizedBalance >= config.tierLegendarioMin) return "LEGENDARIO";
  if (normalizedBalance >= config.tierEpicoMin) return "EPICO";
  if (normalizedBalance >= config.tierIntermedioMin) return "INTERMEDIO";
  return "BASICO";
}
