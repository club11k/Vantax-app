-- El saldo inicial de Journaly ya no se pide a mano: se rellena solo con el
-- primer saldo real que lea el orquestador MT5 tras conectar la cuenta.
-- Las cuentas nuevas se crean sin él (null) hasta ese primer sync; las
-- cuentas ya existentes conservan el valor que tenían.
ALTER TABLE "JournalAccount" ALTER COLUMN "initialBalance" DROP NOT NULL;
