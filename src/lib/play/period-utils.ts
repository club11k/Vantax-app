// Utilidades de periodo (mes en curso), compartidas por los sitios que
// necesitan agrupar lotaje/beneficio por mes — antes vivían en
// myfxbook-sync.ts, ahora aquí porque Myfxbook ya no es parte del proyecto
// (todo el sync de Vantax Play/Journaly pasa por mt5-orchestrator/, ver
// src/lib/play/mt5-native-sync.ts).

export function currentPeriodKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  return { periodStart, periodEnd };
}
