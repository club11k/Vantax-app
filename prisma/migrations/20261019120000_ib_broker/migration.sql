-- IB de VT Markets además de Vantage: cada cuenta IB y cada evento de
-- entrada/salida indican de qué broker son. Lo existente queda como VANTAGE.
ALTER TABLE "VantageIbAccount" ADD COLUMN "broker" TEXT NOT NULL DEFAULT 'VANTAGE';
DROP INDEX "VantageIbAccount_accountNumber_key";
CREATE UNIQUE INDEX "VantageIbAccount_broker_accountNumber_key" ON "VantageIbAccount"("broker", "accountNumber");

ALTER TABLE "VantageAllocationEvent" ADD COLUMN "broker" TEXT NOT NULL DEFAULT 'VANTAGE';
DROP INDEX "VantageAllocationEvent_vantageUserId_occurredAt_type_key";
CREATE UNIQUE INDEX "VantageAllocationEvent_broker_vantageUserId_occurredAt_type_key" ON "VantageAllocationEvent"("broker", "vantageUserId", "occurredAt", "type");

-- Cuentas de VT Markets que ya estaban dadas de alta en Vantax Play: se
-- enlazan con el IB de VT Markets igual que las nuevas.
INSERT INTO "VantageIbAccount" ("id", "userId", "broker", "accountNumber", "updatedAt")
SELECT 'vt_' || a."id", a."userId", 'VTMARKETS', a."accountNumber", CURRENT_TIMESTAMP
FROM "PlayMt5Account" a
JOIN "PlayBroker" b ON b."id" = a."brokerId"
WHERE lower(regexp_replace(b."name", '[[:space:]._-]+', '', 'g')) IN ('vtmarkets', 'vtmarket', 'vt')
ON CONFLICT DO NOTHING;
