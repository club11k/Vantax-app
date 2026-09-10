import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";
import { findOrCreatePlayBroker } from "@/lib/play/brokers";
import { getPlayConfig, vcoinsForLots, tierForBalance } from "@/lib/play/vcoin-engine";

// Vincular una cuenta MT5 a mano (modo observador/investor), igual que el
// POST "/" de accounts.js en el backend original de Vantax Play. Para
// vincular vía Myfxbook (autocompletado) ver /api/play/myfxbook-link.

const linkSchema = z.object({
  brokerName: z.string().trim().min(1, "El broker es obligatorio.").max(100),
  accountNumber: z.string().trim().min(1, "El número de cuenta es obligatorio.").max(50),
  accountType: z.enum(["NORMAL", "CENT"], { errorMap: () => ({ message: "El tipo de cuenta debe ser 'NORMAL' o 'CENT'." }) }),
  investorLogin: z.string().trim().max(50).optional().or(z.literal("")),
  investorPassword: z.string().trim().max(255).optional().or(z.literal("")),
  mt5Server: z.string().trim().max(100).optional().or(z.literal("")),
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

  let investorPasswordEnc: string | null = null;
  try {
    investorPasswordEnc = investorPassword ? encrypt(investorPassword) : null;
  } catch (err: any) {
    console.error("Error cifrando la contraseña investor:", err.message);
    return NextResponse.json({ error: "No se pudo cifrar la contraseña investor. Revisá ENCRYPTION_KEY en el servidor." }, { status: 500 });
  }

  try {
    const account = await prisma.playMt5Account.create({
      data: {
        userId,
        brokerId,
        accountNumber,
        accountType,
        investorLogin: investorLogin || null,
        investorPasswordEnc,
        mt5Server: mt5Server || null,
      },
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("Error vinculando la cuenta MT5:", err);
    return NextResponse.json({ error: "No se pudo vincular la cuenta." }, { status: 500 });
  }
}
