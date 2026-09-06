import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const entrySchema = z.object({
  date: z.string().regex(DATE_RE, "Fecha inválida."),
  resultAmount: z.number().finite("El resultado no es un número válido."),
  source: z.enum(["MANUAL", "AI_PHOTO"]).optional().default("MANUAL"),
  imageNote: z.string().max(500).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const account = await prisma.journalAccount.findUnique({ where: { userId } });
  if (!account) {
    return NextResponse.json({ account: null, entries: [] });
  }

  const entries = await prisma.journalEntry.findMany({
    where: { accountId: account.id },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ account, entries });
}

// Crea o actualiza (upsert) el resultado de un día concreto — un solo
// resultado por fecha, editable si el usuario lo vuelve a enviar. Esto vale
// tanto para el resultado escrito a mano como para el resultado propuesto
// por la IA a partir de una foto, una vez que el usuario lo confirmó (esta
// ruta nunca inventa la cifra: siempre llega ya decidida por el usuario).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const account = await prisma.journalAccount.findUnique({ where: { userId } });
  if (!account) {
    return NextResponse.json({ error: "Primero configura tu cuenta de Journaly (saldo inicial, UID y moneda)." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  try {
    const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
    const entry = await prisma.journalEntry.upsert({
      where: { accountId_date: { accountId: account.id, date } },
      update: {
        resultAmount: parsed.data.resultAmount,
        source: parsed.data.source,
        imageNote: parsed.data.imageNote,
      },
      create: {
        accountId: account.id,
        date,
        resultAmount: parsed.data.resultAmount,
        source: parsed.data.source,
        imageNote: parsed.data.imageNote,
      },
    });
    return NextResponse.json({ entry });
  } catch (err) {
    console.error("Error guardando la entrada de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo guardar el resultado del día. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}

