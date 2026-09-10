-- Columnas de seguimiento para el sync automático de V-COIN por lotaje
-- (Myfxbook): cuántos lotes del mes en curso ya se convirtieron en V-COIN,
-- para acreditar solo la diferencia en cada sincronización.
ALTER TABLE "PlayMt5Account" ADD COLUMN "lastCreditedLots" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlayMt5Account" ADD COLUMN "lastCreditedPeriod" TEXT;
