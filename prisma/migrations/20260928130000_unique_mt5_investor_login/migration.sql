-- Evita que la misma cuenta MT5 real (broker + login investor + servidor)
-- se pueda vincular a dos usuarios de Vantax distintos, aunque escriban un
-- "número de cuenta" diferente a propósito para saltarse la restricción que
-- ya existía sobre ese campo (que el usuario escribe a mano, así que por sí
-- solo no bastaba). Escrita a mano porque "prisma migrate dev" no tiene
-- acceso a red en este entorno (mismo motivo que el resto de migraciones
-- de este repo).
--
-- Antes de crear la restricción, por seguridad: si YA existiera algún caso
-- así en producción (dos cuentas con el mismo broker + login + servidor —
-- justo lo que se quiere evitar de aquí en adelante), se desconecta el MT5
-- de la más reciente de las dos (login/contraseña/servidor a NULL, deja de
-- sincronizar) en vez de dejar que esta migración falle entera por un
-- choque de datos que ya existía. Si esto llega a tocar alguna fila, se ve
-- en "Jugadores (Play)" del admin como una cuenta que de golpe aparece sin
-- MT5 conectado — se revisaría a mano y se volvería a vincular con el
-- número de cuenta correcto.
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "brokerId", "investorLogin", "mt5Server"
      ORDER BY "createdAt" ASC
    ) AS rn
  FROM "PlayMt5Account"
  WHERE "investorLogin" IS NOT NULL AND "mt5Server" IS NOT NULL
)
UPDATE "PlayMt5Account"
SET "investorLogin" = NULL, "investorPasswordEnc" = NULL, "mt5Server" = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

CREATE UNIQUE INDEX "PlayMt5Account_brokerId_investorLogin_mt5Server_key" ON "PlayMt5Account"("brokerId", "investorLogin", "mt5Server");
