-- CreateEnum
CREATE TYPE "JournalCurrency" AS ENUM ('EUR', 'USD', 'CENT');

-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'AI_PHOTO');

-- CreateTable
CREATE TABLE "JournalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountUid" TEXT NOT NULL,
    "currency" "JournalCurrency" NOT NULL DEFAULT 'USD',
    "initialBalance" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "resultAmount" DOUBLE PRECISION NOT NULL,
    "source" "JournalEntrySource" NOT NULL DEFAULT 'MANUAL',
    "imageNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalAccount_userId_key" ON "JournalAccount"("userId");

-- CreateIndex
CREATE INDEX "JournalEntry_accountId_date_idx" ON "JournalEntry"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_accountId_date_key" ON "JournalEntry"("accountId", "date");

-- AddForeignKey
ALTER TABLE "JournalAccount" ADD CONSTRAINT "JournalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "JournalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

