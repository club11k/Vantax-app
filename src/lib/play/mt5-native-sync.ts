// Acreditación de V-COIN/progreso a partir de datos leídos directamente de
// MT5 (terminales propios en una VPS, sin pasar por Myfxbook) — ver
// mt5-orchestrator/ en la raíz del repo para el lado Python que llama a
// estos endpoints.
//
// Es la única fuente de datos de Vantax Play (Myfxbook ya no forma parte
// del proyecto): "solo se acredita la diferencia de lotes desde el último
// sync", usando currentPeriodKey/monthBounds de src/lib/play/period-utils.ts.
//
// Desde que MT5 es obligatorio para TODO el mundo (ver src/lib/mt5-gate.ts
// y /completar-mt5), esta es también la fuente de verdad de
// VantageIbAccount.lastTradeTime y del V-COIN de esas cuentas — antes salía
// de la comisión que reportaba la API del IB de Vantage (ver
// src/lib/vantage-ib.ts), que ya NO reparte V-COIN (decisión de Esther:
// sustituido del todo por lotaje real). La API de Vantage se sigue usando
// solo para lo que solo ella sabe: si la cuenta sigue dentro del IB o se
// salió (ibStatus, ver src/lib/vantage-block.ts, que no cambia).

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
  /** ISO 8601 de la última operación cerrada (ventana ~35 días), o null si no hay ninguna. */
  lastTradeTime?: string | null;
};

export type Mt5SyncOutcome =
  | { ok: true; credited: boolean; vCoinAwarded: number }
  | { ok: false; error: string };

// Cuenta VantageIbAccount hermana de esta PlayMt5Account (mismo número de
// cuenta y mismo usuario) — solo existe si el bróker es Vantage (ver
// linkMt5Account en src/lib/play/link-mt5-account.ts). Puede no haber
// ninguna (bróker distinto de Vantage), y entonces simplemente no hay nada
// que actualizar de ese lado.
async function findLinkedVantageAccountId(userId: string, accountNumber: string): Promise<string | null> {
  const linked = await prisma.vantageIbAccount.findFirst({
    where: { userId, accountNumber },
    select: { id: true },
  });
  return linked?.id ?? null;
}

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
  const lastTradeTime = report.lastTradeTime ? new Date(report.lastTradeTime) : null;

  const linkedVantageAccountId = await findLinkedVantageAccountId(account.userId, account.accountNumber);

  // Se actualiza siempre que hay dato nuevo, pase lo que pase con el
  // V-COIN — la actividad real (para el bloqueo por 30 días) no depende de
  // si hubo lotes nuevos que acreditar.
  async function syncLinkedVantageAccount() {
    if (!linkedVantageAccountId) return;
    await prisma.vantageIbAccount.update({
      where: { id: linkedVantageAccountId },
      data: { lastTradeTime, lastSyncedAt: now },
    });
  }

  await prisma.playTradingStats.upsert({
    where: { accountId_periodStart_periodEnd: { accountId: account.id, periodStart, periodEnd } },
    update: { lotsTraded: lotsThisMonth, profitPct, profitAmount },
    create: { accountId: account.id, periodStart, periodEnd, lotsTraded: lotsThisMonth, profitPct, profitAmount },
  });

  if (!account.ibActive) {
    await prisma.playMt5Account.update({ where: { id: account.id }, data: { balance, equity, lastSyncedAt: now } });
    await syncLinkedVantageAccount();
    return { ok: true, credited: false, vCoinAwarded: 0 };
  }

  const previousLots = account.lastCreditedPeriod === period ? account.lastCreditedLots : 0;
  const deltaLots = lotsThisMonth - previousLots;

  if (deltaLots <= 0) {
    await prisma.playMt5Account.update({
      where: { id: account.id },
      data: { balance, equity, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period, lastSyncedAt: now },
    });
    await syncLinkedVantageAccount();
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
    await syncLinkedVantageAccount();
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
    ...(linkedVantageAccountId
      ? [
          prisma.vantageIbAccount.update({
            where: { id: linkedVantageAccountId },
            data: { lastTradeTime, lastSyncedAt: now, vCoinEarned: { increment: vCoinToAwardInt } },
          }),
        ]
      : []),
  ]);

  return { ok: true, credited: true, vCoinAwarded: vCoinToAwardInt };
}
