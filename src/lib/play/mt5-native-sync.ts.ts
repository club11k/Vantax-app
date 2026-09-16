// Acreditación de V-COIN/progreso a partir de datos leídos directamente de
// MT5 (terminales propios en una VPS, sin pasar por Myfxbook) — ver
// mt5-orchestrator/ en la raíz del repo para el lado Python que llama a
// estos endpoints.
//
// Comparte exactamente la misma lógica de "solo se acredita la diferencia
// de lotes desde el último sync" que ya usa src/lib/play/myfxbook-sync.ts
// (currentPeriodKey/monthBounds reutilizados de ahí), así que las dos
// fuentes de datos pueden convivir sin pagar dos veces el mismo lote: cada
// PlayMt5Account solo tiene UNA fuente activa a la vez en la práctica (o
// Myfxbook, o el lector MT5 propio), pero el mecanismo de delta es el mismo
// por si algún día hiciera falta.

import { prisma } from "@/lib/prisma";
import { getPlayConfig, vcoinsForLots, type PlayAccountTypeValue } from "@/lib/play/vcoin-engine";
import { applyProgressLots } from "@/lib/play/progress-engine";
import { currentPeriodKey, monthBounds } from "@/lib/play/myfxbook-sync";

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
    await prisma.playMt5Account.update({ where: { id: account.id }, data: { balance, equity } });
    return { ok: true, credited: false, vCoinAwarded: 0 };
  }

  const previousLots = account.lastCreditedPeriod === period ? account.lastCreditedLots : 0;
  const deltaLots = lotsThisMonth - previousLots;

  if (deltaLots <= 0) {
    await prisma.playMt5Account.update({
      where: { id: account.id },
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period },
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
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period },
    });
    return { ok: true, credited: false, vCoinAwarded: 0 };
  }

  await prisma.$transaction([
    prisma.playMt5Account.update({
      where: { id: account.id },
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period },
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
