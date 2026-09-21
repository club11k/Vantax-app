// Acreditación de V-COIN/progreso a partir de datos leídos directamente de
// MT5 (terminales propios en una VPS, sin pasar por Myfxbook) — ver
// mt5-orchestrator/ en la raíz del repo para el lado Python que llama a
// estos endpoints.
//
// Es la única fuente de datos de Vantax Play (Myfxbook ya no forma parte
// del proyecto): "solo se acredita la diferencia de lotes desde el último
// sync", usando currentPeriodKey/monthBounds de src/lib/play/period-utils.ts.

import { prisma } from "@/lib/prisma";
import { getPlayConfig, vcoinsForLots, type PlayAccountTypeValue } from "@/lib/play/vcoin-engine";
import { applyProgressLots } from "@/lib/play/progress-engine";
import { currentPeriodKey, monthBounds } from "@/lib/play/period-utils";

export type Mt5SyncReport = {
  accountId: string;
  balance: number;
  equity: number;
  /** Lotes de XAUUSD cerrados en lo que va del mes, ya sumados por el lector Python. */
  lotsThisMonth: number;
  /** Beneficio/pérdida (moneda de la cuenta) de todas las operaciones cerradas este mes. */
  profitAmount?: number;
};

export type Mt5SyncOutcome =
  | { ok: true; credited: boolean; vCoinAwarded: number }
  | { ok: false; error: string };

export async function applyMt5SyncResult(report: Mt5SyncReport): Promise<Mt5SyncOutcome> {
  const account = await prisma.playMt5Account.findUnique({ where: { id: report.accountId } });
  if (!account) return { ok: false, error: "Cuenta no encontrada." };

  const now = new Date();
  const period = currentPeriodKey(now);
  const { periodStart, periodEnd } = monthBounds(now);
  const balance = Number(report.balance) || 0;
  const equity = Number(report.equity) || balance;
  const lotsThisMonth = Math.max(0, Number(report.lotsThisMonth) || 0);
  const profitAmount = Number(report.profitAmount) || 0;
  const profitPct = balance > 0 ? (profitAmount / balance) * 100 : 0;

  await prisma.playTradingStats.upsert({
    where: { accountId_periodStart_periodEnd: { accountId: account.id, periodStart, periodEnd } },
    update: { lotsTraded: lotsThisMonth, profitPct, profitAmount },
    create: { accountId: account.id, periodStart, periodEnd, lotsTraded: lotsThisMonth, profitPct, profitAmount },
  });

  if (!account.ibActive) {
    await prisma.playMt5Account.update({ where: { id: account.id }, data: { balance, equity, lastSyncedAt: now } });
    return { ok: true, credited: false, vCoinAwarded: 0 };
  }

  const previousLots = account.lastCreditedPeriod === period ? account.lastCreditedLots : 0;
  const deltaLots = lotsThisMonth - previousLots;

  if (deltaLots <= 0) {
    await prisma.playMt5Account.update({
      where: { id: account.id },
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period, lastSyncedAt: now },
    });
    return { ok: true, credited: false, vCoinAwarded: 0 };
  }

  // Progreso del Trader (barra + cofres): mismo delta que el V-COIN, nunca
  // se cuenta un lote dos veces entre las dos cosas.
  await applyProgressLots(account.userId, deltaLots);

  const config = await getPlayConfig();
  const vCoinToAward = vcoinsForLots({ lots: deltaLots, accountType: account.accountType as PlayAccountTypeValue, config });
  const vCoinToAwardInt = Math.round(vCoinToAward);

  if (vCoinToAwardInt <= 0) {
    await prisma.playMt5Account.update({
      where: { id: account.id },
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period, lastSyncedAt: now },
    });
    return { ok: true, credited: false, vCoinAwarded: 0 };
  }

  await prisma.$transaction([
    prisma.playMt5Account.update({
      where: { id: account.id },
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period, lastSyncedAt: now },
    }),
    prisma.playVCoinTransaction.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        type: "LOTE",
        amount: vCoinToAward,
        description: `Sync MT5 propio (${deltaLots.toFixed(2)} lotes XAUUSD nuevos)`,
      },
    }),
    prisma.user.update({ where: { id: account.userId }, data: { vCoinBalance: { increment: vCoinToAwardInt } } }),
  ]);

  return { ok: true, credited: true, vCoinAwarded: vCoinToAwardInt };
}
