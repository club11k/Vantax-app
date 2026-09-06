import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Journaly está disponible para cualquier usuario con sesión iniciada,
// independiente del acceso a Análisis o al Centro de Mercado — es una
// herramienta de seguimiento personal, no una funcionalidad de pago.

const accountSchema = z.object({
  accountUid: z.string().trim().min(1, "El UID de la cuenta es obligatorio.").max(100),
  currency: z.enum(["EUR", "USD", "CENT"]),
  initialBalance: z.number().finite("El saldo inicial no es un número válido."),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const account = await prisma.journalAccount.findUnique({ where: { userId } });
  return NextResponse.json({ account });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  try {
    const account = await prisma.journalAccount.upsert({
      where: { userId },
      update: {
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        initialBalance: parsed.data.initialBalance,
      },
      create: {
        userId,
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        initialBalance: parsed.data.initialBalance,
      },
    });
    return NextResponse.json({ account });
  } catch (err) {
    console.error("Error guardando la cuenta de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la configuración de Journaly. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}

