import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Vincula la cuenta de trading de Vantage del usuario (el número de cuenta,
// el mismo que Vantage devuelve como "account" en su API de IB) para que la
// sincronización de comisión → V-COIN sepa a quién acreditarle qué.
// Solo se permite una cuenta de Vantage por usuario por ahora.

const linkSchema = z.object({
  accountNumber: z
    .string()
    .trim()
    .min(1, "El número de cuenta es obligatorio.")
    .max(50),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { vCoinBalance: true } }),
    prisma.vantageIbAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({ vCoinBalance: user?.vCoinBalance ?? 0, accounts });
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

  const existing = await prisma.vantageIbAccount.findUnique({
    where: { accountNumber: parsed.data.accountNumber },
  });
  if (existing && existing.userId !== userId) {
    return NextResponse.json({ error: "Esa cuenta ya está vinculada a otro usuario." }, { status: 409 });
  }
  if (existing) {
    return NextResponse.json({ error: "Ya tienes esa cuenta vinculada." }, { status: 409 });
  }

  try {
    const account = await prisma.vantageIbAccount.create({
      data: { userId, accountNumber: parsed.data.accountNumber },
    });
    return NextResponse.json({ account });
  } catch (err) {
    console.error("Error vinculando cuenta de Vantage:", err);
    return NextResponse.json({ error: "No se pudo vincular la cuenta." }, { status: 500 });
  }
}
