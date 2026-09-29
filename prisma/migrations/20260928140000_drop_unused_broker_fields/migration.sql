-- Quita 3 columnas de "User" que se crearon en los inicios de Vantax Play
-- pero nunca se llegaron a conectar a ningún formulario ni lógica: ningún
-- sitio del código las escribe ni las lee. Todo lo que hace falta sobre el
-- broker/MT5 de un jugador ya vive en PlayMt5Account (broker, servidor,
-- número de cuenta, login investor), así que estas quedaban de sobra.
-- Escrita a mano por el mismo motivo que el resto de migraciones de este
-- repo (sin acceso de red a binaries.prisma.sh en este entorno).
ALTER TABLE "User" DROP COLUMN "brokerName";
ALTER TABLE "User" DROP COLUMN "brokerEmail";
ALTER TABLE "User" DROP COLUMN "brokerUid";
