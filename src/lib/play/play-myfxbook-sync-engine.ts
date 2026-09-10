// myfxbook-sync — el motor que de verdad reparte V-COIN por lotaje: recorre
// todos los jugadores con Myfxbook vinculado, lee cuántos lotes de XAUUSD
// operaron este mes, y acredita V-COIN solo por los lotes nuevos desde la
// última sincronización.
//
// Se lanza a mano desde /admin/settings (botón "Sincronizar ahora", igual
// que el sync de comisión de Vantage) — no hay cron automático todavía.
//
// Portado de club11k/vantax-play-backend (src/services/myfxbookSync.js),
// con dos diferencias importantes respecto al original:
//  1. El original volvía a acreditar el total de lotes del mes en CADA
//     sincronización (sin llevar cuenta de lo ya acreditado), lo que pagaba
//     lo mismo varias veces si el sync se ejecutaba más de una vez al mes.
//     Aquí se lleva un contador (PlayMt5Account.lastCreditedLots /
//     lastCreditedPeriod) y solo se acredita la diferencia, igual que ya
//     hace el sync de comisión de Vantage con lastCommission.
//  2. IMPORTANTE (regla de negocio de Esther): el V-COIN por lotaje solo
//     cuenta operaciones en XAUUSD — se preserva el mismo filtro que tenía
//     el original.

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/play/crypto";
import { findOrCreatePlayBroker } from "@/lib/play/brokers";
import { getPlayConfig, vcoinsForLots, type PlayAccountTypeValue } from "@/lib/play/vcoin-engine";
import {
  myfxbookLogin,
  myfxbookLogout,
  myfxbookGetMyAccounts,
  myfxbookGetHistory,
  brokerNameFromServer,
  detectAccountType,
  type MyfxbookAuth,
  type MyfxbookHistoryItem,
} from "@/lib/play/myfxbook";

function currentPeriodKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  return { periodStart, periodEnd };
}

// Suma los lotes operados en XAUUSD dentro del mes en curso a partir del
// historial que devuelve Myfxbook (cada operación cerrada trae closeTime y
// sizing.value en lotes). IMPORTANTE: solo cuenta XAUUSD, por regla del
// sistema de V-COIN.
function sumXauLotsThisMonth(history: MyfxbookHistoryItem[], now: Date): number {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return history
    .filter((h) => h.symbol === "XAUUSD" && h.closeTime)
    .filter((h) => {
      const [datePart] = String(h.closeTime).split(" ");
      const [day, month, year] = datePart.split("/").map(Number);
      if (!day || !month || !year) return false;
      const closed = new Date(year, month - 1, day);
      return closed >= startOfMonth;
    })
    .reduce((sum, h) => sum + (Number(h.sizing?.value) || 0), 0);
}

// Suma el beneficio/pérdida (en la moneda de la cuenta) de todas las
// operaciones (no solo XAUUSD) cerradas este mes, para calcular el % de
// ganancia mostrado al jugador — informativo, no afecta al cálculo de V-COIN.
function sumProfitThisMonth(history: MyfxbookHistoryItem[], now: Date): number {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return history
    .filter((h) => h.closeTime)
    .filter((h) => {
      const [datePart] = String(h.closeTime).split(" ");
      const [day, month, year] = datePart.split("/").map(Number);
      if (!day || !month || !year) return false;
      const closed = new Date(year, month - 1, day);
      return closed >= startOfMonth;
    })
    .reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
}

export type MyfxbookSyncResult = {
  totalLinkedPlayers: number;
  accountsSynced: number;
  accountsCredited: number;
  totalVCoinAwarded: number;
  skippedNoRate: boolean;
  errors: { userId: string; message: string }[];
};

export async function syncAllMyfxbookAccounts(): Promise<MyfxbookSyncResult> {
  const config = await getPlayConfig();
  const result: MyfxbookSyncResult = {
    totalLinkedPlayers: 0,
    accountsSynced: 0,
    accountsCredited: 0,
    totalVCoinAwarded: 0,
    skippedNoRate: !config.vcoinRatePerLot || config.vcoinRatePerLot <= 0,
    errors: [],
  };

  if (result.skippedNoRate) return result;

  const links = await prisma.playMyfxbookLink.findMany();
  result.totalLinkedPlayers = links.length;

  const now = new Date();
  const period = currentPeriodKey(now);
  const { periodStart, periodEnd } = monthBounds(now);

  for (const link of links) {
    let auth: MyfxbookAuth | undefined;
    try {
      const password = decrypt(link.passwordEnc);
      if (!password) throw new Error("No se pudo descifrar la contraseña guardada.");
      auth = await myfxbookLogin(link.email, password);

      const accounts = await myfxbookGetMyAccounts(auth);
      if (!accounts.length) continue;

      const account = link.myfxbookAccountId
        ? accounts.find((a) => String(a.id) === link.myfxbookAccountId) || accounts[0]
        : accounts[0];

      const serverRaw = account.server as unknown;
      const server = typeof serverRaw === "string" ? serverRaw : (serverRaw as { name?: string } | null)?.name || "";
      const brokerName = brokerNameFromServer(server);
      const brokerId = await findOrCreatePlayBroker(brokerName);
      const accountNumber = String(account.login || account.accountId || account.id);

      const existing = await prisma.playMt5Account.findUnique({
        where: { brokerId_accountNumber: { brokerId, accountNumber } },
      });
      if (!existing) continue; // no debería pasar (se crea al vincular), pero por si acaso

      const detectedType = detectAccountType(server, account.name);
      const balance = Number(account.balance) || 0;
      const equity = Number(account.equity) || balance;

      const history = await myfxbookGetHistory(auth, account.id);
      const lotsThisMonth = sumXauLotsThisMonth(history, now);
      const profitAmount = sumProfitThisMonth(history, now);
      const profitPct = balance > 0 ? (profitAmount / balance) * 100 : 0;

      await prisma.playTradingStats.upsert({
        where: { accountId_periodStart_periodEnd: { accountId: existing.id, periodStart, periodEnd } },
        update: { lotsTraded: lotsThisMonth, profitPct, profitAmount },
        create: { accountId: existing.id, periodStart, periodEnd, lotsTraded: lotsThisMonth, profitPct, profitAmount },
      });

      result.accountsSynced += 1;

      if (!existing.ibActive) {
        // Cuenta todavía no activada manualmente en el IB — se actualizan
        // saldo/tipo detectado para que se vea en el panel, pero no se
        // acredita V-COIN hasta que un admin la marque activa.
        await prisma.playMt5Account.update({
          where: { id: existing.id },
          data: { balance, equity, accountType: detectedType, accountTypeVerified: true },
        });
        continue;
      }

      // Solo se acredita la diferencia de lotes desde el último sync de este
      // periodo (mes) — si empezó un mes nuevo, se parte de 0.
      const previousLots = existing.lastCreditedPeriod === period ? existing.lastCreditedLots : 0;
      const deltaLots = lotsThisMonth - previousLots;

      if (deltaLots <= 0) {
        await prisma.playMt5Account.update({
          where: { id: existing.id },
          data: {
            balance,
            equity,
            accountType: detectedType,
            accountTypeVerified: true,
            lastCreditedLots: Math.max(lotsThisMonth, 0),
            lastCreditedPeriod: period,
          },
        });
        continue;
      }

      const vCoinToAward = vcoinsForLots({ lots: deltaLots, accountType: detectedType as PlayAccountTypeValue, config });
      const vCoinToAwardInt = Math.round(vCoinToAward);

      if (vCoinToAwardInt <= 0) {
        await prisma.playMt5Account.update({
          where: { id: existing.id },
          data: { balance, equity, accountType: detectedType, accountTypeVerified: true, lastCreditedLots: lotsThisMonth, lastCreditedPeriod: period },
        });
        continue;
      }

      await prisma.$transaction([
        prisma.playMt5Account.update({
          where: { id: existing.id },
          data: {
            balance,
            equity,
            accountType: detectedType,
            accountTypeVerified: true,
            lastCreditedLots: lotsThisMonth,
            lastCreditedPeriod: period,
          },
        }),
        prisma.playVCoinTransaction.create({
          data: {
            userId: link.userId,
            accountId: existing.id,
            type: "LOTE",
            amount: vCoinToAward,
            description: `Sync automático Myfxbook (${deltaLots.toFixed(2)} lotes XAUUSD nuevos)`,
          },
        }),
        prisma.user.update({
          where: { id: link.userId },
          data: { vCoinBalance: { increment: vCoinToAwardInt } },
        }),
      ]);

      result.accountsCredited += 1;
      result.totalVCoinAwarded += vCoinToAwardInt;
    } catch (err: any) {
      result.errors.push({ userId: link.userId, message: err?.message || "Error desconocido." });
    } finally {
      await prisma.playMyfxbookLink.update({ where: { id: link.id }, data: { lastSyncedAt: new Date() } }).catch(() => {});
      if (auth) await myfxbookLogout(auth);
    }
  }

  return result;
}
