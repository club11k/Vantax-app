-- Extiende Journaly para que el orquestador MT5 propio (mt5-orchestrator/ en
-- la raíz del repo) pueda rellenar el resultado del día solo, igual que ya
-- hace con Vantax Play.

-- Nueva fuente posible para una entrada del diario: la calculó el
-- orquestador MT5 a partir del historial real de la cuenta (no a mano, no
-- por foto).
ALTER TYPE "JournalEntrySource" ADD VALUE 'MT5_SYNC';

-- Credenciales investor opcionales por cuenta de Journaly (mismo cifrado que
-- ya usa Vantax Play). Todas opcionales: sin ellas, la cuenta sigue
-- funcionando exactamente igual que hasta ahora.
ALTER TABLE "JournalAccount" ADD COLUMN "investorLogin" TEXT;
ALTER TABLE "JournalAccount" ADD COLUMN "investorPasswordEnc" TEXT;
ALTER TABLE "JournalAccount" ADD COLUMN "mt5Server" TEXT;
