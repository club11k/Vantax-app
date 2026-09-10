-- Vantax Play (fase 1: base de datos + registro de jugador) — migración
-- escrita a mano (mismo motivo que en el resto de este repo: prisma
-- generate/migrate no tiene acceso a red en el entorno donde se escribió
-- este cambio, así que no se pudo generar con `prisma migrate dev`).
-- Traduce el esquema completo de club11k/vantax-play-backend
-- (src/db/schema.sql) a los modelos Prisma con prefijo "Play".

-- CreateEnum
CREATE TYPE "PlayAccountType" AS ENUM ('NORMAL', 'CENT');

-- CreateEnum
CREATE TYPE "PlayTier" AS ENUM ('BASICO', 'INTERMEDIO', 'EPICO', 'LEGENDARIO');

-- CreateEnum
CREATE TYPE "PlayVCoinTxType" AS ENUM ('LOTE', 'RANKING_BONUS', 'COFRE', 'TORNEO', 'AJUSTE_ADMIN');

-- CreateEnum
CREATE TYPE "PlayRankingCriterion" AS ENUM ('PROFIT_PCT', 'LOTS');

-- CreateEnum
CREATE TYPE "PlayArticleCategory" AS ENUM ('MERCH', 'MENTORIA', 'CASHBACK');

-- CreateEnum
CREATE TYPE "PlayGiftRewardType" AS ENUM ('VCOIN', 'ARTICLE');

-- CreateEnum
CREATE TYPE "PlayPayoutNetwork" AS ENUM ('TRC20', 'BEP20');

-- CreateEnum
CREATE TYPE "PlayPayoutStatus" AS ENUM ('PENDIENTE', 'PAGADO');

-- AlterTable: datos de jugador de Vantax Play en el User existente de VANTAX
-- (reutilizamos la cuenta/login que ya tiene, no hay un sistema de auth
-- separado como en el backend original).
ALTER TABLE "User" ADD COLUMN "publicId" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutWallet" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutNetwork" "PlayPayoutNetwork";
ALTER TABLE "User" ADD COLUMN "brokerName" TEXT;
ALTER TABLE "User" ADD COLUMN "brokerEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "brokerUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- Guardia extra case-insensitive (igual que "users_public_id_ci_idx" en el
-- backend original): no se puede registrar "Trader1" si ya existe "trader1".
CREATE UNIQUE INDEX "User_publicId_ci_idx" ON "User" (LOWER("publicId"));

-- CreateTable
CREATE TABLE "PlayBroker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayBroker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayBroker_name_key" ON "PlayBroker"("name");

-- CreateTable
CREATE TABLE "PlayMt5Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountType" "PlayAccountType" NOT NULL,
    "accountTypeVerified" BOOLEAN NOT NULL DEFAULT false,
    "investorLogin" TEXT,
    "investorPasswordEnc" TEXT,
    "mt5Server" TEXT,
    "metaapiAccountId" TEXT,
    "ibActive" BOOLEAN NOT NULL DEFAULT false,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayMt5Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayMt5Account_brokerId_accountNumber_key" ON "PlayMt5Account"("brokerId", "accountNumber");

-- CreateIndex
CREATE INDEX "PlayMt5Account_userId_idx" ON "PlayMt5Account"("userId");

-- AddForeignKey
ALTER TABLE "PlayMt5Account" ADD CONSTRAINT "PlayMt5Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayMt5Account" ADD CONSTRAINT "PlayMt5Account_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "PlayBroker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayAccountSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "equity" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayAccountSnapshot_accountId_capturedAt_idx" ON "PlayAccountSnapshot"("accountId", "capturedAt");

-- AddForeignKey
ALTER TABLE "PlayAccountSnapshot" ADD CONSTRAINT "PlayAccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlayMt5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayTradingStats" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "lotsTraded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PlayTradingStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayTradingStats_accountId_periodStart_periodEnd_key" ON "PlayTradingStats"("accountId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "PlayTradingStats" ADD CONSTRAINT "PlayTradingStats_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlayMt5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayVCoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" "PlayVCoinTxType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayVCoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayVCoinTransaction_userId_createdAt_idx" ON "PlayVCoinTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayVCoinTransaction" ADD CONSTRAINT "PlayVCoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayVCoinTransaction" ADD CONSTRAINT "PlayVCoinTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlayMt5Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayChest" (
    "id" TEXT NOT NULL,
    "tier" "PlayTier" NOT NULL,
    "label" TEXT NOT NULL,
    "unlockCondition" TEXT NOT NULL,
    "vcoinReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraReward" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlayChest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayChest_tier_key" ON "PlayChest"("tier");

-- CreateTable
CREATE TABLE "PlayUserChest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chestId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "PlayUserChest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayUserChest" ADD CONSTRAINT "PlayUserChest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayUserChest" ADD CONSTRAINT "PlayUserChest_chestId_fkey" FOREIGN KEY ("chestId") REFERENCES "PlayChest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayRanking" (
    "id" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "tier" "PlayTier" NOT NULL,
    "criterion" "PlayRankingCriterion" NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PlayRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayRanking_periodStart_periodEnd_tier_idx" ON "PlayRanking"("periodStart", "periodEnd", "tier");

-- AddForeignKey
ALTER TABLE "PlayRanking" ADD CONSTRAINT "PlayRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayRanking" ADD CONSTRAINT "PlayRanking_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlayMt5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayTournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criterion" "PlayRankingCriterion" NOT NULL,
    "tierFilter" "PlayTier",
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "prize" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayPayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountVCoin" DOUBLE PRECISION NOT NULL,
    "network" "PlayPayoutNetwork" NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" "PlayPayoutStatus" NOT NULL DEFAULT 'PENDIENTE',
    "txHash" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PlayPayout_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayPayout" ADD CONSTRAINT "PlayPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayVCoinScale" (
    "id" TEXT NOT NULL,
    "accountType" "PlayAccountType" NOT NULL,
    "minLots" DOUBLE PRECISION NOT NULL,
    "maxLots" DOUBLE PRECISION,
    "ratePerLot" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayVCoinScale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayVCoinScale_accountType_minLots_key" ON "PlayVCoinScale"("accountType", "minLots");

-- CreateTable
CREATE TABLE "PlayCatalogArticle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PlayArticleCategory" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayCatalogArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayChestLoot" (
    "id" TEXT NOT NULL,
    "chestId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PlayChestLoot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayChestLoot" ADD CONSTRAINT "PlayChestLoot_chestId_fkey" FOREIGN KEY ("chestId") REFERENCES "PlayChest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayChestLoot" ADD CONSTRAINT "PlayChestLoot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "PlayCatalogArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayTierGoal" (
    "tier" "PlayTier" NOT NULL,
    "lotsTarget" DOUBLE PRECISION NOT NULL,
    "daysLimit" INTEGER NOT NULL,

    CONSTRAINT "PlayTierGoal_pkey" PRIMARY KEY ("tier")
);

-- CreateTable
CREATE TABLE "PlayPlayerProgress" (
    "userId" TEXT NOT NULL,
    "tierIndex" INTEGER NOT NULL DEFAULT 0,
    "cycleLots" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cycleDay" INTEGER NOT NULL DEFAULT 0,
    "cycleStartedAt" DATE NOT NULL DEFAULT CURRENT_DATE,

    CONSTRAINT "PlayPlayerProgress_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "PlayPlayerProgress" ADD CONSTRAINT "PlayPlayerProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayPlayerGift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "PlayTier" NOT NULL,
    "rewardType" "PlayGiftRewardType" NOT NULL,
    "amount" DOUBLE PRECISION,
    "articleId" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayPlayerGift_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayPlayerGift" ADD CONSTRAINT "PlayPlayerGift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayPlayerGift" ADD CONSTRAINT "PlayPlayerGift_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "PlayCatalogArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayMyfxbookLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "myfxbookAccountId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayMyfxbookLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayMyfxbookLink_userId_key" ON "PlayMyfxbookLink"("userId");

-- AddForeignKey
ALTER TABLE "PlayMyfxbookLink" ADD CONSTRAINT "PlayMyfxbookLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayLeague" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minBalance" DOUBLE PRECISION NOT NULL,
    "maxBalance" DOUBLE PRECISION,
    "prizeChestTier" "PlayTier",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayLeague_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayLeague_name_key" ON "PlayLeague"("name");

-- AddForeignKey
ALTER TABLE "PlayLeague" ADD CONSTRAINT "PlayLeague_prizeChestTier_fkey" FOREIGN KEY ("prizeChestTier") REFERENCES "PlayChest"("tier") ON DELETE SET NULL ON UPDATE CASCADE;
