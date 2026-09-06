import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const accountSchema = z.object({
  accountUid: z.string().trim().min(1, "El UID de la cuenta es obligatorio.").max(100),
  currency: z.enum(["EUR", "USD", "CENT"]),
  initialBalance: z.number().finite("El saldo inicial no es un número válido."),
});

// Edita o borra una cuenta de Journaly concreta. Siempre se verifica que la
// cuenta pertenezca al usuario de la sesión antes de tocarla.

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const existing = await prisma.journalAccount.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  try {
    const account = await prisma.journalAccount.update({
      where: { id: params.id },
      data: {
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        initialBalance: parsed.data.initialBalance,
      },
    });
    return NextResponse.json({ account });
  } catch (err) {
    console.error("Error actualizando la cuenta de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const existing = await prisma.journalAccount.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  try {
    // onDelete: Cascade en el esquema borra también todas las entradas de esta cuenta.
    await prisma.journalAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error borrando la cuenta de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo borrar la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}

