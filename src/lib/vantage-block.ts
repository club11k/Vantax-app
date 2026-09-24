import { prisma } from "@/lib/prisma";

// Bloqueo automático de acceso a TODA la app (login incluido) para usuarios
// que ya no están activos en el IB de Vantage: o bien se desvincularon
// (ibStatus = "UNLINKED", detectado solo via la Allocation Data API — ver
// syncVantageAllocations en src/lib/vantage-ib.ts), o bien llevan más de
// INACTIVITY_DAYS días sin operar en ninguna de sus cuentas de Vantage
// (lastTradeTime, detectado solo via commissionData). Un admin puede forzar
// el resultado a mano por cuenta desde /admin/vantage-clients
// (VantageIbAccount.manualActiveOverride) sin esperar al próximo sync.
//
// IMPORTANTE — a quién afecta: esto SOLO bloquea a usuarios que tienen
// alguna cuenta de Vantage vinculada (VantageIbAccount) — es decir, gente
// que en algún momento entró por el IB de Esther. Un usuario que nunca
// vinculó una cuenta de Vantage (solo usa Análisis vía Stripe, por ejemplo)
// no tiene ninguna fila aquí y esta regla no le afecta en absoluto.
//
// Si el usuario tiene VARIAS cuentas de Vantage, basta con que UNA esté
// activa para no bloquearlo — solo se bloquea si TODAS están inactivas o
// desvinculadas a la vez.
const INACTIVITY_DAYS = 30;

export type VantageBlockStatus =
  | { blocked: false }
  | { blocked: true; reason: "ib_unlinked" | "inactivity" };

function isAccountLinked(account: { ibStatus: string; manualActiveOverride: boolean | null }): boolean {
  if (account.manualActiveOverride !== null) return account.manualActiveOverride;
  return account.ibStatus === "LINKED";
}

function isAccountActive(account: {
  ibStatus: string;
  manualActiveOverride: boolean | null;
  lastTradeTime: Date | null;
}): boolean {
  if (!isAccountLinked(account)) return false;
  // Sin lastTradeTime todavía (cuenta recién vinculada, esperando su primer
  // sync de comisión) — no penalizamos por inactividad hasta que haya al
  // menos un dato real.
  if (!account.lastTradeTime) return true;
  const cutoff = Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  return account.lastTradeTime.getTime() >= cutoff;
}

export async function getVantageBlockStatus(userId: string): Promise<VantageBlockStatus> {
  const accounts = await prisma.vantageIbAccount.findMany({
    where: { userId },
    select: { ibStatus: true, manualActiveOverride: true, lastTradeTime: true },
  });

  if (accounts.length === 0) return { blocked: false };
  if (accounts.some(isAccountActive)) return { blocked: false };

  // Ninguna cuenta activa: para el mensaje, si TODAS están desvinculadas es
  // "salida del IB"; si al menos una sigue vinculada pero todas llevan más
  // de 30 días sin operar, es "inactividad".
  const allUnlinked = accounts.every((a) => !isAccountLinked(a));
  return { blocked: true, reason: allUnlinked ? "ib_unlinked" : "inactivity" };
}

// --- Aviso de 15 días sin operar (antes del bloqueo a los 30) ---
//
// A diferencia del bloqueo (automático del todo), el aviso lo dispara un
// admin a mano desde /admin/vantage-inactivity, cuenta por cuenta de
// Vantage. Aquí solo se calcula: (a) qué cuentas llevan ya 15+ días sin
// operar, vinculadas todavía al IB (para que el admin las vea en esa
// pantalla), y (b) si a un usuario YA avisado hay que seguir mostrándole el
// mensaje (deja de mostrarse solo si vuelve a operar, sin que nadie tenga
// que "cerrarlo" a mano).
export const WARNING_DAYS = 15;

export function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

export type VantageWarningStatus = {
  showBanner: boolean;
  daysSinceLastTrade: number | null;
};

// Para la campanita/banner que ve el propio usuario mientras usa la app
// (ver src/components/InactivityWarningBanner.tsx). Solo se activa si un
// admin ya pulsó "Avisar" (vantageInactivityWarnedAt) Y la cuenta SIGUE sin
// operar desde entonces — si vuelve a operar, deja de salir sin que nadie
// tenga que quitarlo a mano.
export async function getVantageWarningStatus(userId: string): Promise<VantageWarningStatus> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { vantageInactivityWarnedAt: true } });
  if (!user?.vantageInactivityWarnedAt) return { showBanner: false, daysSinceLastTrade: null };

  const accounts = await prisma.vantageIbAccount.findMany({
    where: { userId },
    select: { ibStatus: true, manualActiveOverride: true, lastTradeTime: true },
  });
  const linked = accounts.filter(isAccountLinked);
  if (linked.length === 0) return { showBanner: false, daysSinceLastTrade: null };

  let mostRecentTrade: Date | null = null;
  for (const a of linked) {
    if (a.lastTradeTime && (!mostRecentTrade || a.lastTradeTime > mostRecentTrade)) {
      mostRecentTrade = a.lastTradeTime;
    }
  }
  const days = daysSince(mostRecentTrade);

  // Si nunca ha operado (days === null) no mostramos el banner de "llevas
  // X días" — eso sería confuso; y si ya ha vuelto a operar hace menos de
  // WARNING_DAYS, tampoco.
  const showBanner = days !== null && days >= WARNING_DAYS;
  return { showBanner, daysSinceLastTrade: days };
}
