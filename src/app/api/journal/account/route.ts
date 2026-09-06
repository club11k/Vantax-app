import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Journaly está disponible para cualquier usuario con sesión iniciada,
// independiente del acceso a Análisis o al Centro de Mercado — es una
// herramienta de seguimiento personal, no una funcionalidad de pago.
//
// Un usuario puede tener varias cuentas de trading en su diario (ej. una
// cuenta principal y otra de una prop firm). Esta ruta lista todas las del
// usuario y crea cuentas nuevas; para editar o borrar una cuenta concreta,
// ver /api/journal/account/[id].

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

  const accounts = await prisma.journalAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ accounts });
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
    const account = await prisma.journalAccount.create({
      data: {
        userId,
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        initialBalance: parsed.data.initialBalance,
      },
    });
    return NextResponse.json({ account });
  } catch (err) {
    console.error("Error creando la cuenta de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}

