-- Aviso manual de inactividad (15 días sin operar) — ver
-- src/lib/vantage-block.ts (getVantageWarningStatus) y el panel nuevo
-- /admin/vantage-inactivity.
ALTER TABLE "User" ADD COLUMN "vantageInactivityWarnedAt" TIMESTAMP(3);
