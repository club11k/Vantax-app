-- Inventario de cofres abiertos (Vantax Play): hasta ahora, al abrir un
-- cofre propio, el artículo ganado (si le tocaba uno) se calculaba al
-- vuelo en /api/play/chests/open y se devolvía en la respuesta, pero no se
-- guardaba en ningún sitio — no había forma de volver a consultar qué le
-- había tocado a cada jugador. Estas dos columnas guardan el premio real
-- entregado en el momento de abrir el cofre, escrito a mano porque
-- "prisma migrate dev" no tiene acceso a red en este entorno (mismo motivo
-- que el resto de migraciones de este repo).
ALTER TABLE "PlayUserChest" ADD COLUMN "vcoinAwarded" DOUBLE PRECISION;
ALTER TABLE "PlayUserChest" ADD COLUMN "wonArticleId" TEXT;

ALTER TABLE "PlayUserChest" ADD CONSTRAINT "PlayUserChest_wonArticleId_fkey" FOREIGN KEY ("wonArticleId") REFERENCES "PlayCatalogArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Igual para los regalos de admin: cuándo lo abrió de verdad el jugador,
-- no solo cuándo se le asignó (createdAt).
ALTER TABLE "PlayPlayerGift" ADD COLUMN "deliveredAt" TIMESTAMP(3);
