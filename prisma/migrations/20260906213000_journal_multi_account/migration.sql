-- DropIndex
DROP INDEX "JournalAccount_userId_key";

-- CreateIndex
CREATE INDEX "JournalAccount_userId_idx" ON "JournalAccount"("userId");
