import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";
import { findOrCreatePlayBroker } from "@/lib/play/brokers";

// Lógica central para vincular una cuenta MT5 (modo observador/investor) a
// un usuario — antes vivía solo dentro de /api/play/accounts/route.ts.
// Ahora la usan DOS sitios: esa misma ruta (Perfil → añadir cuenta) y el
// nuevo paso obligatorio de /completar-mt5 (ver src/app/completar-mt5/),
// que ahora pide estos mismos datos a TODO el mundo al registrarse (o al
// primer login si ya estaba registrado desde antes) — así en Vantax todo lo
// que depende de trading real (lotaje, V-COIN, actividad) sale de MT5
// directamente, y la API del IB de Vantage se usa solo para lo que solo
// ella sabe: si la cuenta sigue dentro de tu IB o se salió (ver
// src/lib/vantage-ib.ts / src/lib/vantage-block.ts).
//
// Si el broker es "Vantage", esto también vincula automáticamente la
// cuenta del lado del IB (VantageIbAccount) para que aparezca en Panel de
// admin → Clientes Vantage, exactamente igual que ya hacía la ruta
// original.

export type LinkMt5AccountInput = {
  userId: string;
  brokerName: string;
  accountNumber: string;
  accountType: "NORMAL" | "CENT";
  investorLogin: string;
  investorPassword: string;
  mt5Server: string;
};

export type LinkMt5AccountResult =
  | { ok: true; accountId: string }
  | { ok: false; error: string; status: number };

export async function linkMt5Account(input: LinkMt5AccountInput): Promise<LinkMt5AccountResult> {
  const { userId, brokerName, accountNumber, accountType, investorLogin, investorPassword, mt5Server } = input;

  const brokerId = await findOrCreatePlayBroker(brokerName);

  const existing = await prisma.playMt5Account.findUnique({
    where: { brokerId_accountNumber: { brokerId, accountNumber } },
  });
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: existing.userId === userId ? "Ya tienes esa cuenta vinculada." : "Esa cuenta ya está vinculada a otro usuario.",
    };
  }

  // El "número de cuenta" de arriba lo escribe el usuario a mano, así que
  // por sí solo no evita que alguien vincule la MISMA cuenta MT5 real con
  // un número distinto a propósito para acumular V-COIN en varios usuarios
  // de Vantax. El login investor + servidor sí identifica la cuenta real
  // (no se puede falsear sin las credenciales investor de esa cuenta), así
  // que también se comprueba aparte.
  const existingByLogin = await prisma.playMt5Account.findFirst({
    where: { brokerId, investorLogin, mt5Server },
  });
  if (existingByLogin) {
    return {
      ok: false,
      status: 409,
      error:
        existingByLogin.userId === userId
          ? "Ya tienes esa cuenta MT5 vinculada (con otro número de cuenta)."
          : "Esa cuenta MT5 ya está vinculada a otro usuario — no se puede acumular V-COIN en la misma cuenta desde dos usuarios distintos.",
    };
  }

  let investorPasswordEnc: string | null;
  try {
    investorPasswordEnc = encrypt(investorPassword);
  } catch (err: any) {
    console.error("Error cifrando la contraseña investor:", err.message);
    return { ok: false, status: 500, error: "No se pudo cifrar la contraseña investor. Revisa ENCRYPTION_KEY en el servidor." };
  }
  if (!investorPasswordEnc) {
    return { ok: false, status: 500, error: "No se pudo cifrar la contraseña investor." };
  }

  try {
    const account = await prisma.playMt5Account.create({
      data: {
        userId,
        brokerId,
        accountNumber,
        accountType,
        investorLogin,
        investorPasswordEnc,
        mt5Server,
      },
    });

    // Si es una cuenta de Vantage, se vincula también del lado del IB para
    // que salga en Panel de admin → Clientes Vantage — sin bloquear la
    // creación de la cuenta si esto falla por lo que sea (ej. ese número de
    // cuenta ya estaba vinculado por otro usuario desde antes).
    if (brokerName.trim().toLowerCase() === "vantage") {
      try {
        const alreadyLinked = await prisma.vantageIbAccount.findUnique({ where: { accountNumber } });
        if (!alreadyLinked) {
          await prisma.vantageIbAccount.create({ data: { userId, accountNumber } });
        }
      } catch (err) {
        console.error("No se pudo enlazar la cuenta con Vantage IB (no afecta a la cuenta MT5):", err);
      }
    }

    return { ok: true, accountId: account.id };
  } catch (err: any) {
    // P2002 = choque con una restricción única — por ejemplo si dos
    // peticiones llegan a la vez y las comprobaciones de arriba no llegan
    // a pillarlo (carrera poco probable, pero la restricción de la base de
    // datos es la última barrera real contra la misma cuenta MT5 en dos
    // usuarios de Vantax).
    if (err?.code === "P2002") {
      return {
        ok: false,
        status: 409,
        error: "Esa cuenta ya está vinculada (número de cuenta o login MT5 ya en uso).",
      };
    }
    console.error("Error vinculando la cuenta MT5:", err);
    return { ok: false, status: 500, error: "No se pudo vincular la cuenta." };
  }
}
