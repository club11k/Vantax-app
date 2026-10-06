// Aplica el resultado del día que manda el orquestador MT5 propio (ver
// mt5-orchestrator/ en la raíz del repo) a una cuenta de Journaly.
//
// Regla de integridad, no negociable: una entrada automática de MT5 NUNCA
// pisa una entrada que el usuario escribió a mano o confirmó a partir de una
// foto (source MANUAL o AI_PHOTO). Si ya existe una entrada así para ese día,
// se respeta tal cual y el sync de ese día se descarta en silencio (no es un
// error — es el comportamiento esperado: el usuario ya dejó constancia de su
// propio resultado). Solo se crea la entrada, o se actualiza una que a su vez
// ya era MT5_SYNC (para reflejar el resultado más reciente del día en curso).

import { prisma } from "@/lib/prisma";

export type Mt5JournalSyncReport = {
  accountId: string;
  resultAmount: number;
  // Fecha del resultado en formato YYYY-MM-DD. Si no se manda, se usa el día
  // de hoy (UTC) — el orquestador normalmente reporta el resultado del día
  // en curso en cada ciclo de sincronización.
  date?: string;
  // Saldo actual de la cuenta. Solo se usa para UNA cosa: si esta cuenta
  // todavía no tiene saldo inicial (JournalAccount.initialBalance === null,
  // el caso normal para una cuenta nueva, que ahora obliga a conectar MT5
  // en vez de pedirlo a mano), este es el primer saldo real que se lee y se
  // guarda como saldo inicial. En syncs siguientes, con el saldo ya puesto,
  // se ignora.
  balance?: number;
};

export type Mt5JournalSyncOutcome =
  | { ok: true; action: "created" | "updated"; entryId: string }
  | { ok: true; action: "skipped_manual_entry_exists" }
  | { ok: false; reason: string };

function todayUtcDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Primera vez que llega el saldo real (initialBalance todavía null): se
// guarda como saldo inicial el saldo ACTUAL menos la suma de todos los
// resultados ya registrados, para que "saldo inicial + resultados" dé
// exactamente el saldo real de MT5 y no se cuenten dos veces los días que
// ya estaban apuntados (06/10/2026: había cuentas con 17 días registrados
// y sin saldo).
async function captureInitialBalance(accountId: string, current: number | null, balance: number | undefined) {
  if (current !== null || typeof balance !== "number" || !Number.isFinite(balance)) return;
  try {
    const agg = await prisma.journalEntry.aggregate({ where: { accountId }, _sum: { resultAmount: true } });
    const sum = agg._sum.resultAmount ?? 0;
    await prisma.journalAccount.update({ where: { id: accountId }, data: { initialBalance: balance - sum } });
  } catch (err) {
    console.error("No se pudo fijar el saldo inicial de Journaly:", err);
  }
}

export async function applyJournalMt5Result(report: Mt5JournalSyncReport): Promise<Mt5JournalSyncOutcome> {
  const account = await prisma.journalAccount.findUnique({ where: { id: report.accountId } });
  if (!account) {
    return { ok: false, reason: "Cuenta de Journaly no encontrada." };
  }

  // Se llegó hasta aquí porque el orquestador ya leyó bien la cuenta en
  // MT5 — se registra como "última sincronización" tanto si el resultado
  // se aplica como si se descarta más abajo por haber ya una entrada
  // manual/foto ese día (en ambos casos la lectura en sí fue un éxito).
  // Y si es la PRIMERA vez que se sincroniza esta cuenta (initialBalance
  // todavía sin capturar), este saldo se guarda como saldo inicial — es el
  // único momento en que se toca ese campo.
  await prisma.journalAccount
    .update({
      where: { id: account.id },
      data: {
        lastSyncedAt: new Date(),
      },
    })
    .catch(() => {});

  let date: Date;
  if (report.date) {
    if (!DATE_RE.test(report.date)) {
      return { ok: false, reason: "Fecha inválida (se espera YYYY-MM-DD)." };
    }
    date = new Date(`${report.date}T00:00:00.000Z`);
  } else {
    date = todayUtcDateOnly();
  }

  const existing = await prisma.journalEntry.findUnique({
    where: { accountId_date: { accountId: account.id, date } },
  });

  // Ya hay una entrada de ese día puesta por el usuario (a mano o por foto):
  // no se toca, el sync automático cede el paso.
  if (existing && existing.source !== "MT5_SYNC") {
    await captureInitialBalance(account.id, account.initialBalance, report.balance);
    return { ok: true, action: "skipped_manual_entry_exists" };
  }

  try {
    const entry = await prisma.journalEntry.upsert({
      where: { accountId_date: { accountId: account.id, date } },
      update: {
        resultAmount: report.resultAmount,
        source: "MT5_SYNC",
      },
      create: {
        accountId: account.id,
        date,
        resultAmount: report.resultAmount,
        source: "MT5_SYNC",
      },
    });
    await captureInitialBalance(account.id, account.initialBalance, report.balance);
    return { ok: true, action: existing ? "updated" : "created", entryId: entry.id };
  } catch (err) {
    console.error("Error aplicando sync MT5 de Journaly:", err);
    return { ok: false, reason: "No se pudo guardar el resultado sincronizado." };
  }
}
