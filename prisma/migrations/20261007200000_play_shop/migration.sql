-- Tienda de Vantax Play (07/10/2026): canje de artículos del catálogo con
-- V-COIN. Escrita a mano, igual que el resto de migraciones de este repo.
ALTER TYPE "PlayVCoinTxType" ADD VALUE IF NOT EXISTS 'TIENDA';

ALTER TABLE "PlayPayout" ADD COLUMN "note" TEXT;

CREATE TYPE "PlayShopOrderStatus" AS ENUM ('PENDIENTE', 'ENTREGADO');

CREATE TABLE "PlayShopOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT,
    "articleName" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "PlayShopOrderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "PlayShopOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlayShopOrder_status_createdAt_idx" ON "PlayShopOrder"("status", "createdAt");

ALTER TABLE "PlayShopOrder" ADD CONSTRAINT "PlayShopOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayShopOrder" ADD CONSTRAINT "PlayShopOrder_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "PlayCatalogArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
