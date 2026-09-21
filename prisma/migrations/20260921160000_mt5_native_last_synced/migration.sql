-- Fecha de la última sincronización con éxito del orquestador MT5 propio
-- (mt5-orchestrator/), tanto para cuentas de Vantax Play como de Journaly.
-- Myfxbook queda fuera del proyecto: todo el sync pasa ahora por aquí.
ALTER TABLE "PlayMt5Account" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "JournalAccount" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
