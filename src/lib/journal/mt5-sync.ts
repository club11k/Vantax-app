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

export async function applyJournalMt5Result(report: Mt5JournalSyncReport): Promise<Mt5JournalSyncOutcome> {
  const account = await prisma.journalAccount.findUnique({ where: { id: report.accountId } });
  if (!account) {
    return { ok: false, reason: "Cuenta de Journaly no encontrada." };
  }

  // Se llegó hasta aquí porque el orquestador ya leyó bien la cuenta en
  // MT5 — se registra como "última sincronización" tanto si el resultado
  // se aplica como si se descarta más abajo por haber ya una entrada
  // manual/foto ese día (en ambos casos la lectura en sí fue un éxito).
  await prisma.journalAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } }).catch(() => {});

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
    return { ok: true, action: existing ? "updated" : "created", entryId: entry.id };
  } catch (err) {
    console.error("Error aplicando sync MT5 de Journaly:", err);
    return { ok: false, reason: "No se pudo guardar el resultado sincronizado." };
  }
}
