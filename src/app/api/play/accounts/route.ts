import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";
import { findOrCreatePlayBroker } from "@/lib/play/brokers";
import { getPlayConfig, vcoinsForLots, tierForBalance } from "@/lib/play/vcoin-engine";

// Vincular una cuenta MT5 (modo observador/investor). El saldo, equity y
// lotaje se sincronizan solos cada ciclo vía el orquestador MT5 propio
// (mt5-orchestrator/) en cuanto la cuenta tiene login/contraseña investor
// y servidor guardados — ver src/lib/play/mt5-native-sync.ts.
//
// MT5 es obligatorio al crear una cuenta (igual que en Journaly): sin login/
// contraseña/servidor no hay forma de sincronizar nada, así que ya no tiene
// sentido dejarlo opcional. Las cuentas vinculadas antes de este cambio, sin
// MT5, quedan igual (se pueden completar después editando la cuenta, ver
// /api/play/accounts/[id]).
//
// Si el broker es Vantage, esto también vincula automáticamente la cuenta
// del lado del IB (VantageIbAccount, ver src/lib/vantage-ib.ts) para que
// aparezca en Panel de admin → Clientes Vantage — antes había que vincularla
// aparte en la pantalla de V-COIN (ya retirada, todo vive aquí en Perfil).

const linkSchema = z.object({
  brokerName: z.string().trim().min(1, "El broker es obligatorio.").max(100),
  accountNumber: z.string().trim().min(1, "El número de cuenta es obligatorio.").max(50),
  accountType: z.enum(["NORMAL", "CENT"], { errorMap: () => ({ message: "El tipo de cuenta debe ser 'NORMAL' o 'CENT'." }) }),
  investorLogin: z.string().trim().min(1, "El login investor es obligatorio.").max(50),
  investorPassword: z.string().trim().min(1, "La contraseña investor es obligatoria.").max(255),
  mt5Server: z.string().trim().min(1, "El servidor MT5 es obligatorio.").max(100),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const [config, accounts] = await Promise.all([
    getPlayConfig(),
    prisma.playMt5Account.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        broker: { select: { name: true } },
        stats: { orderBy: { periodEnd: "desc" }, take: 1 },
      },
    }),
  ]);

  const enriched = accounts.map((a) => {
    const lotsTraded = a.stats[0]?.lotsTraded ?? 0;
    return {
      id: a.id,
      accountNumber: a.accountNumber,
      accountType: a.accountType,
      brokerName: a.broker.name,
      mt5Server: a.mt5Server,
      investorLogin: a.investorLogin,
      mt5Connected: Boolean(a.investorPasswordEnc),
      lastSyncedAt: a.lastSyncedAt,
      ibActive: a.ibActive,
      balance: a.balance,
      equity: a.equity,
      lotsTraded,
      profitPct: a.stats[0]?.profitPct ?? 0,
      vcoinEarned: vcoinsForLots({ lots: lotsTraded, accountType: a.accountType as any, config }),
      tier: tierForBalance({ balance: a.balance, accountType: a.accountType as any, config }),
      createdAt: a.createdAt,
    };
  });

  return NextResponse.json({ accounts: enriched });
}

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
  const { brokerName, accountNumber, accountType, investorLogin, investorPassword, mt5Server } = parsed.data;

  const brokerId = await findOrCreatePlayBroker(brokerName);

  const existing = await prisma.playMt5Account.findUnique({
    where: { brokerId_accountNumber: { brokerId, accountNumber } },
  });
  if (existing) {
    return NextResponse.json(
      { error: existing.userId === userId ? "Ya tienes esa cuenta vinculada." : "Esa cuenta ya está vinculada a otro usuario." },
      { status: 409 }
    );
  }

  let investorPasswordEnc: string | null;
  try {
    investorPasswordEnc = encrypt(investorPassword);
  } catch (err: any) {
    console.error("Error cifrando la contraseña investor:", err.message);
    return NextResponse.json({ error: "No se pudo cifrar la contraseña investor. Revisa ENCRYPTION_KEY en el servidor." }, { status: 500 });
  }
  if (!investorPasswordEnc) {
    return NextResponse.json({ error: "No se pudo cifrar la contraseña investor." }, { status: 500 });
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
    // creación de la cuenta de Play si esto falla por lo que sea (ej. ese
    // número de cuenta ya estaba vinculado por otro usuario desde antes).
    if (brokerName.trim().toLowerCase() === "vantage") {
      try {
        const alreadyLinked = await prisma.vantageIbAccount.findUnique({ where: { accountNumber } });
        if (!alreadyLinked) {
          await prisma.vantageIbAccount.create({ data: { userId, accountNumber } });
        }
      } catch (err) {
        console.error("No se pudo enlazar la cuenta con Vantage IB (no afecta a la cuenta de Play):", err);
      }
    }

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("Error vinculando la cuenta MT5:", err);
    return NextResponse.json({ error: "No se pudo vincular la cuenta." }, { status: 500 });
  }
}
