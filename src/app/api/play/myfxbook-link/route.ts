import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";
import { findOrCreatePlayBroker } from "@/lib/play/brokers";
import { myfxbookLogin, myfxbookLogout, myfxbookGetMyAccounts, brokerNameFromServer, detectAccountType } from "@/lib/play/myfxbook";

// Vincular la cuenta de Myfxbook propia del jugador — guarda su email y
// contraseña de myfxbook.com cifrados, y a partir de ahí autocompleta
// broker, tipo de cuenta y saldo leyendo la primera cuenta MT5 que tenga
// añadida en su Myfxbook, sin pedirle nada más. Igual que el
// POST "/myfxbook-link" del accounts.js original.

const linkSchema = z.object({
  email: z.string().trim().email("Ingresa un email válido."),
  password: z.string().min(1, "La contraseña de Myfxbook es obligatoria."),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  let passwordEnc: string | null;
  try {
    passwordEnc = encrypt(password);
  } catch (err: any) {
    console.error("Error cifrando la contraseña de Myfxbook:", err.message);
    return NextResponse.json({ error: "No se pudo cifrar la contraseña. Revisa ENCRYPTION_KEY en el servidor." }, { status: 500 });
  }

  // Verificamos las credenciales contra Myfxbook ANTES de guardar nada: a
  // diferencia del backend original (que guardaba el enlace igual y
  // reintentaba el autocompletado en el siguiente sync periódico), aquí no
  // hay todavía un sync periódico — así que si el login falla, no tiene
  // sentido guardar un enlace que nunca se va a poder usar.
  let auth;
  try {
    auth = await myfxbookLogin(email, password);
  } catch (err: any) {
    return NextResponse.json({ error: `No se pudo iniciar sesión en Myfxbook: ${err.message}` }, { status: 400 });
  }

  try {
    const accounts = await myfxbookGetMyAccounts(auth);
    if (!accounts.length) {
      return NextResponse.json(
        { error: "Esa cuenta de Myfxbook no tiene ninguna cuenta MT5 añadida todavía. Agrégala en myfxbook.com y vuelve a intentar." },
        { status: 400 }
      );
    }

    const acc = accounts[0];
    // Myfxbook devuelve "server" como un objeto ({"name":"Vantage Markets"}),
    // no como texto simple — a diferencia de lo que asumía el backend
    // original de Vantax Play (de ahí venía el error "n.split is not a
    // function": intentábamos hacer .split() sobre un objeto).
    const rawServer = acc.server as unknown;
    const server = typeof rawServer === "string" ? rawServer : (rawServer as { name?: string } | null)?.name || "";
    const brokerName = brokerNameFromServer(server);
    const accountType = detectAccountType(server, acc.name);
    const brokerId = await findOrCreatePlayBroker(brokerName);
    const accountNumber = String(acc.login || acc.accountId || acc.id);
    const balance = Number(acc.balance) || 0;
    const equity = Number(acc.equity) || balance;

    const existingAccount = await prisma.playMt5Account.findUnique({
      where: { brokerId_accountNumber: { brokerId, accountNumber } },
      select: { userId: true },
    });
    if (existingAccount && existingAccount.userId !== userId) {
      return NextResponse.json(
        { error: "Esa cuenta de trading ya está vinculada por otro jugador." },
        { status: 409 }
      );
    }

    const [link, account] = await prisma.$transaction([
      prisma.playMyfxbookLink.upsert({
        where: { userId },
        update: { email, passwordEnc: passwordEnc!, myfxbookAccountId: String(acc.id) },
        create: { userId, email, passwordEnc: passwordEnc!, myfxbookAccountId: String(acc.id) },
      }),
      prisma.playMt5Account.upsert({
        where: { brokerId_accountNumber: { brokerId, accountNumber } },
        update: { accountType, mt5Server: server, balance, equity },
        create: {
          userId,
          brokerId,
          accountNumber,
          accountType,
          investorLogin: accountNumber,
          mt5Server: server,
          balance,
          equity,
        },
      }),
    ]);

    return NextResponse.json({ link: { email: link.email, createdAt: link.createdAt }, account }, { status: 201 });
  } catch (err: any) {
    console.error("Error vinculando Myfxbook:", err);
    return NextResponse.json({ error: err.message || "No se pudo leer la cuenta desde Myfxbook." }, { status: 500 });
  } finally {
    await myfxbookLogout(auth);
  }
}
