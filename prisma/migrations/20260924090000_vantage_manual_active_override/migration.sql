-- Bloqueo automático de acceso a VANTAX por salida del IB / 30 días sin
-- operar (ver src/lib/vantage-block.ts). Este campo permite forzar a mano,
-- por cuenta de Vantage, el resultado del cálculo automático:
-- NULL = automático (según ibStatus + lastTradeTime), TRUE = forzar activa,
-- FALSE = forzar inactiva.
ALTER TABLE "VantageIbAccount" ADD COLUMN "manualActiveOverride" BOOLEAN;
