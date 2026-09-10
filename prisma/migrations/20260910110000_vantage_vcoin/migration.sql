-- AlterTable
ALTER TABLE "User" ADD COLUMN "vCoinBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VantageIbAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountType" TEXT,
    "platform" TEXT,
    "lastCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vCoinEarned" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VantageIbAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VantageIbAccount_accountNumber_key" ON "VantageIbAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "VantageIbAccount_userId_idx" ON "VantageIbAccount"("userId");

-- AddForeignKey
ALTER TABLE "VantageIbAccount" ADD CONSTRAINT "VantageIbAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
