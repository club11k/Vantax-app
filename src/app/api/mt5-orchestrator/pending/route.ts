import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/play/crypto";

// Lista UNIFICADA de cuentas MT5 con credenciales investor guardadas, tanto
// de Vantax Play (cashback en V-COIN por lotaje) como de Journaly (diario de
// trading), para que un solo orquestador Python en la VPS lea ambos tipos de
// cuenta en el mismo ciclo. Cada cuenta lleva un campo "kind" para que el
// script sepa qué calcular y a qué endpoint de /report devolvérselo.
//
// Sustituye a las rutas antiguas /api/play/mt5-orchestrator/pending y
// /report (ahora eliminadas) — si tu repo en GitHub todavía tiene esa
// carpeta antigua, bórrala, ya no se usa.
//
// Llamada máquina-a-máquina, no de usuario — se protege con un secreto
// compartido (MT5_ORCHESTRATOR_SECRET), nunca con la sesión de NextAuth.
//
// IMPORTANTE: esto devuelve contraseñas investor DESCIFRADAS en texto
// plano. Solo debe llamarlo la VPS del orquestador.

function checkSecret(req: Request): boolean {
  const expected = process.env.MT5_ORCHESTRATOR_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === expected;
}

type PendingAccount = {
  kind: "play" | "journal";
  accountId: string;
  login: string;
  password: string;
  server: string;
  brokerName?: string;
  accountNumber?: string;
  accountType?: string;
  ibActive?: boolean;
};

export async function GET(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const [playAccounts, journalAccounts] = await Promise.all([
    prisma.playMt5Account.findMany({
      where: { investorPasswordEnc: { not: null } },
      select: {
        id: true,
        accountNumber: true,
        accountType: true,
        mt5Server: true,
        investorLogin: true,
        investorPasswordEnc: true,
        ibActive: true,
        broker: { select: { name: true } },
      },
    }),
    prisma.journalAccount.findMany({
      where: { investorPasswordEnc: { not: null } },
      select: {
        id: true,
        accountUid: true,
        mt5Server: true,
        investorLogin: true,
        investorPasswordEnc: true,
      },
    }),
  ]);

  const pending: PendingAccount[] = [];

  for (const a of playAccounts) {
    let password: string | null = null;
    try {
      password = decrypt(a.investorPasswordEnc as string);
    } catch (err) {
      console.error(`No se pudo descifrar la contraseña investor de la cuenta Play ${a.id}:`, err);
      continue;
    }
    if (!a.investorLogin || !password || !a.mt5Server) continue;
    pending.push({
      kind: "play",
      accountId: a.id,
      login: a.investorLogin,
      password,
      server: a.mt5Server,
      brokerName: a.broker.name,
      accountNumber: a.accountNumber,
      accountType: a.accountType,
      ibActive: a.ibActive,
    });
  }

  for (const a of journalAccounts) {
    let password: string | null = null;
    try {
      password = decrypt(a.investorPasswordEnc as string);
    } catch (err) {
      console.error(`No se pudo descifrar la contraseña investor de la cuenta Journaly ${a.id}:`, err);
      continue;
    }
    if (!a.investorLogin || !password || !a.mt5Server) continue;
    pending.push({
      kind: "journal",
      accountId: a.id,
      login: a.investorLogin,
      password,
      server: a.mt5Server,
      accountNumber: a.accountUid,
    });
  }

  return NextResponse.json({ accounts: pending });
}
