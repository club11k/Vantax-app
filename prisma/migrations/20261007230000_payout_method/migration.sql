-- Cashback de la tienda: el jugador elige cobrar en wallet USDT o a través del broker (UID).
CREATE TYPE "PlayPayoutMethod" AS ENUM ('WALLET', 'BROKER');
ALTER TABLE "PlayPayout" ADD COLUMN "method" "PlayPayoutMethod" NOT NULL DEFAULT 'WALLET';
ALTER TABLE "PlayPayout" ADD COLUMN "brokerUid" TEXT;
ALTER TABLE "PlayPayout" ALTER COLUMN "network" DROP NOT NULL;
ALTER TABLE "PlayPayout" ALTER COLUMN "wallet" DROP NOT NULL;
