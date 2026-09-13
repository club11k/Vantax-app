-- Estado de vinculación al IB (activo/inactivo, entradas y salidas) y
-- actividad de trading (lastTradeTime) para cuentas de Vantage.
ALTER TABLE "VantageIbAccount" ADD COLUMN "vantageUserId" INTEGER;
ALTER TABLE "VantageIbAccount" ADD COLUMN "lastTradeTime" TIMESTAMP(3);
ALTER TABLE "VantageIbAccount" ADD COLUMN "ibStatus" TEXT NOT NULL DEFAULT 'LINKED';
ALTER TABLE "VantageIbAccount" ADD COLUMN "lastAllocationAt" TIMESTAMP(3);
ALTER TABLE "VantageIbAccount" ADD COLUMN "lastAllocationType" TEXT;

-- Historial crudo de eventos In/Out de la Allocation Data API de Vantage.
CREATE TABLE "VantageAllocationEvent" (
    "id" TEXT NOT NULL,
    "vantageUserId" INTEGER NOT NULL,
    "accountNumber" TEXT,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VantageAllocationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VantageAllocationEvent_accountNumber_idx" ON "VantageAllocationEvent"("accountNumber");
CREATE UNIQUE INDEX "VantageAllocationEvent_vantageUserId_occurredAt_type_key" ON "VantageAllocationEvent"("vantageUserId", "occurredAt", "type");
