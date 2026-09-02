-- Añade el flag de acceso al Centro de Mercado, independiente del acceso a
-- Análisis (que sigue controlado por subscriptionStatus + plan). Permite
-- que un admin abra el Centro de Mercado, Análisis, o ambos, por separado
-- para cada usuario desde /admin/usuarios.
ALTER TABLE "User" ADD COLUMN "marketAccess" BOOLEAN NOT NULL DEFAULT false;
