// Motor de "Progreso del Trader": la barra que se va llenando con los lotes
// de XAUUSD que el jugador opera, organizada en tramos (Básico → Intermedio
// → Épico → Legendario). Al completar el tramo actual se desbloquea el
// cofre de ese tramo y se pasa al siguiente — un ciclo sin límite de días
// fijo por ahora (ver nota más abajo).
//
// Se alimenta con el MISMO delta de lotes que ya usa el sync de V-COIN por
// lotaje (src/lib/play/mt5-native-sync.ts) — así nunca se cuenta un lote dos
// veces ni se necesita un contador aparte.
//
// NOTA sobre "días de ciclo" (tierGoals.daysLimit): el sistema viejo tenía
// pensado un cron diario que fuera contando cycleDay. Aquí no hay cron
// automático todavía (los syncs son manuales, igual que el resto de Vantax
// Play) — así que cycleDay se recalcula "de paso" como los días reales
// transcurridos desde cycleStartedAt, pero NO se usa para forzar un reinicio
// del ciclo si se pasan los días: el progreso solo avanza de tramo al
// llegar a los lotes objetivo, nunca por overtime. Si en el futuro hay cron,
// aquí es donde habría que añadir esa lógica.

import { prisma } from "@/lib/prisma";
import type { PlayTier } from "@prisma/client";

export const TIER_ORDER: PlayTier[] = ["BASICO", "INTERMEDIO", "EPICO", "LEGENDARIO"];

export type UnlockedChestInfo = { tier: PlayTier; chestId: string | null };

async function getTierGoalsMap(): Promise<Map<PlayTier, { lotsTarget: number; daysLimit: number }>> {
  const goals = await prisma.playTierGoal.findMany();
  const map = new Map<PlayTier, { lotsTarget: number; daysLimit: number }>();
  for (const g of goals) map.set(g.tier, { lotsTarget: g.lotsTarget, daysLimit: g.daysLimit });
  return map;
}

// Suma de lotes que hace falta completar en TODOS los tramos anteriores al
// dado, para poder comparar el progreso de jugadores en tramos distintos con
// una sola cifra (se usa solo para el ranking "vas por delante de X
// personas", nunca se le muestra en crudo al jugador).
function cumulativeLotsBeforeTier(tierIndex: number, goals: Map<PlayTier, { lotsTarget: number }>): number {
  let sum = 0;
  for (let i = 0; i < tierIndex; i++) {
    sum += goals.get(TIER_ORDER[i])?.lotsTarget ?? 0;
  }
  return sum;
}

// Aplica los lotes nuevos (delta) al progreso del jugador. Si con eso se
// completa uno o varios tramos de golpe (una sesión con muchos lotes), va
// desbloqueando cofre tras cofre hasta que sobren menos lotes de los que
// hacen falta para el siguiente tramo. Al llegar a Legendario, se queda ahí:
// cada vez que se vuelve a completar se desbloquea otro cofre Legendario.
export async function applyProgressLots(userId: string, deltaLots: number): Promise<UnlockedChestInfo[]> {
  if (!(deltaLots > 0)) return [];

  const goals = await getTierGoalsMap();
  const unlocked: UnlockedChestInfo[] = [];

  const progress = await prisma.playPlayerProgress.upsert({
    where: { userId },
    create: { userId, tierIndex: 0, cycleLots: 0, cycleDay: 0, cycleStartedAt: new Date() },
    update: {},
  });

  let tierIndex = progress.tierIndex;
  let cycleLots = progress.cycleLots + deltaLots;
  let cycleStartedAt = progress.cycleStartedAt;

  // Bucle por si de una sola tacada se completan varios tramos.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tier = TIER_ORDER[Math.min(tierIndex, TIER_ORDER.length - 1)];
    const target = goals.get(tier)?.lotsTarget ?? Infinity;
    if (cycleLots < target) break;

    cycleLots -= target;
    const chest = await prisma.playChest.findUnique({ where: { tier } });
    if (chest) {
      await prisma.playUserChest.create({ data: { userId, chestId: chest.id, unlockedAt: new Date() } });
    }
    unlocked.push({ tier, chestId: chest?.id ?? null });

    if (tierIndex < TIER_ORDER.length - 1) tierIndex += 1;
    // Si ya está en Legendario se queda ahí, pero sigue pudiendo desbloquear
    // otro cofre Legendario cada vez que vuelve a completar el tramo.
    cycleStartedAt = new Date();
  }

  const cycleDay = Math.max(0, Math.floor((Date.now() - cycleStartedAt.getTime()) / 86_400_000));

  await prisma.playPlayerProgress.update({
    where: { userId },
    data: { tierIndex, cycleLots, cycleStartedAt, cycleDay },
  });

  return unlocked;
}

export type ProgressForDisplay = {
  tier: PlayTier;
  tierIndex: number;
  barFillPercent: number; // 0-100, ya calculado — al jugador nunca se le dan los lotes/días en crudo
  aheadOfCount: number; // "vas por delante de X personas"
  pendingChests: { id: string; tier: PlayTier; label: string; kind: "self" }[];
  pendingGifts: { id: string; tier: PlayTier; rewardType: "VCOIN" | "ARTICLE"; label: string; kind: "gift" }[];
};

// Todo lo que necesita la pantalla de jugador: dónde va su barra, cuántos le
// llevan la delantera, y qué cofres tiene pendientes de abrir (propios o
// regalados por admin) — sin exponer nunca lotes/días concretos.
export async function getProgressForDisplay(userId: string): Promise<ProgressForDisplay> {
  const goals = await getTierGoalsMap();

  const [progress, allProgress, pendingChests, pendingGifts, chests] = await Promise.all([
    prisma.playPlayerProgress.upsert({
      where: { userId },
      create: { userId, tierIndex: 0, cycleLots: 0, cycleDay: 0, cycleStartedAt: new Date() },
      update: {},
    }),
    prisma.playPlayerProgress.findMany({ select: { userId: true, tierIndex: true, cycleLots: true } }),
    prisma.playUserChest.findMany({
      where: { userId, openedAt: null },
      include: { chest: true },
      orderBy: { unlockedAt: "asc" },
    }),
    prisma.playPlayerGift.findMany({ where: { userId, delivered: false }, orderBy: { createdAt: "asc" } }),
    prisma.playChest.findMany(),
  ]);

  const tier = TIER_ORDER[Math.min(progress.tierIndex, TIER_ORDER.length - 1)];
  const target = goals.get(tier)?.lotsTarget ?? 0;
  const barFillPercent = target > 0 ? Math.max(0, Math.min(100, Math.round((progress.cycleLots / target) * 100))) : 0;

  const myScore = cumulativeLotsBeforeTier(progress.tierIndex, goals) + progress.cycleLots;
  const aheadOfCount = allProgress.filter((p) => {
    if (p.userId === userId) return false;
    const score = cumulativeLotsBeforeTier(p.tierIndex, goals) + p.cycleLots;
    return score < myScore;
  }).length;

  const chestByTier = new Map(chests.map((c) => [c.tier, c]));

  return {
    tier,
    tierIndex: progress.tierIndex,
    barFillPercent,
    aheadOfCount,
    pendingChests: pendingChests.map((uc) => ({
      id: uc.id,
      tier: uc.chest.tier,
      label: uc.chest.label,
      kind: "self" as const,
    })),
    pendingGifts: pendingGifts.map((g) => ({
      id: g.id,
      tier: g.tier,
      rewardType: g.rewardType,
      label: chestByTier.get(g.tier)?.label ?? `Cofre ${g.tier}`,
      kind: "gift" as const,
    })),
  };
}
