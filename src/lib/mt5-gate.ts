import { prisma } from "@/lib/prisma";

// Desde ahora, TODA cuenta de Vantax (nueva o ya registrada de antes)
// necesita tener al menos una cuenta MT5 vinculada (broker, número de
// cuenta, login/contraseña de inversor, servidor) para poder usar
// cualquier herramienta — así el lotaje, la actividad y el V-COIN de
// verdad salen de MT5 directamente (vía el orquestador propio de la VPS),
// y la API del IB de Vantage se deja solo para lo que solo ella sabe: si
// una cuenta sigue dentro del IB o se salió (ver src/lib/vantage-ib.ts /
// src/lib/vantage-block.ts, que no cambian).
//
// A diferencia del bloqueo por inactividad/salida del IB (que solo afecta
// a quien ya tiene una cuenta de Vantage vinculada), esto afecta a TODO EL
// MUNDO sin excepción — por eso es un chequeo aparte, no una razón más
// dentro de vantage-block.ts.
export async function userHasMt5Account(userId: string): Promise<boolean> {
  const count = await prisma.playMt5Account.count({ where: { userId } });
  return count > 0;
}
