// Ranking mensual por ligas de Vantax Play (pestaña "RANKING"): cada liga
// es un tramo del Progreso del Trader (Bronce=Básico, Plata=Intermedio,
// Oro=Épico, Diamante=Legendario) y dentro de cada una se ordena a los
// jugadores por V-COIN ganado en lo que va de mes. Se "reinicia solo" cada
// mes porque no hay ningún contador propio: se suma PlayVCoinTransaction
// del mes en curso cada vez que se pide el ranking, igual que ya se hace
// con el lotaje/beneficio mensual en /admin/players.

import { prisma } from "@/lib/prisma";
import { TIER_ORDER } from "@/lib/play/progress-engine";
import type { PlayTier } from "@prisma/client";

export type LeagueRow = { publicId: string; vcoin: number; isMe: boolean };
export type LeagueBoard = { tier: PlayTier; players: LeagueRow[] };

export async function getMonthlyLeagueRanking(viewerUserId: string): Promise<LeagueBoard[]> {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

  const [progressRows, txSums] = await Promise.all([
    prisma.playPlayerProgress.findMany({ select: { userId: true, tierIndex: true } }),
    prisma.playVCoinTransaction.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    }),
  ]);

  const vcoinByUser = new Map(txSums.map((t) => [t.userId, Math.round(t._sum.amount ?? 0)]));

  // Solo entran al ranking los jugadores que ya completaron su registro
  // (tienen publicId) — nunca se enseña el nombre real, igual que en el
  // resto de Vantax Play.
  const userIds = progressRows.map((p) => p.userId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, publicId: { not: null } },
        select: { id: true, publicId: true },
      })
    : [];
  const publicIdByUser = new Map(users.map((u) => [u.id, u.publicId as string]));

  const byTier = new Map<PlayTier, LeagueRow[]>(TIER_ORDER.map((t) => [t, [] as LeagueRow[]]));
  for (const p of progressRows) {
    const publicId = publicIdByUser.get(p.userId);
    if (!publicId) continue;
    const tier = TIER_ORDER[Math.min(p.tierIndex, TIER_ORDER.length - 1)];
    byTier.get(tier)!.push({
      publicId,
      vcoin: vcoinByUser.get(p.userId) ?? 0,
      isMe: p.userId === viewerUserId,
    });
  }

  return TIER_ORDER.map((tier) => ({
    tier,
    players: (byTier.get(tier) ?? []).sort((a, b) => b.vcoin - a.vcoin),
  }));
}
