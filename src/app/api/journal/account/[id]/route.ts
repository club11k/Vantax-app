import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";

const accountSchema = z.object({
  accountUid: z.string().trim().min(1, "El UID de la cuenta es obligatorio.").max(100),
  currency: z.enum(["EUR", "USD", "CENT"]),
  initialBalance: z.number().finite("El saldo inicial no es un número válido."),
  // Todo lo de MT5 es opcional. investorPassword en blanco significa "no
  // cambiar la contraseña guardada" (el formulario nunca la vuelve a
  // mostrar, así que mandarla vacía no puede significar "bórrala"). Para
  // desconectar MT5 del todo se manda clearMt5: true, que ignora el resto
  // de campos de MT5 y limpia los tres.
  investorLogin: z.string().trim().max(50).optional().or(z.literal("")),
  investorPassword: z.string().trim().max(255).optional().or(z.literal("")),
  mt5Server: z.string().trim().max(100).optional().or(z.literal("")),
  clearMt5: z.boolean().optional(),
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

  // Campos de MT5: por defecto no se tocan. Solo se recalculan si el usuario
  // pide desconectar (clearMt5) o si manda login/servidor/contraseña.
  let mt5Data: { investorLogin?: string | null; investorPasswordEnc?: string | null; mt5Server?: string | null } = {};

  if (parsed.data.clearMt5) {
    mt5Data = { investorLogin: null, investorPasswordEnc: null, mt5Server: null };
  } else {
    if (parsed.data.investorLogin !== undefined) {
      mt5Data.investorLogin = parsed.data.investorLogin || null;
    }
    if (parsed.data.mt5Server !== undefined) {
      mt5Data.mt5Server = parsed.data.mt5Server || null;
    }
    if (parsed.data.investorPassword) {
      // Solo se re-cifra y se actualiza si mandan una contraseña nueva de verdad.
      try {
        mt5Data.investorPasswordEnc = encrypt(parsed.data.investorPassword);
      } catch (err: any) {
        console.error("Error cifrando la contraseña investor:", err.message);
        return NextResponse.json({ error: "No se pudo cifrar la contraseña investor. Revisa ENCRYPTION_KEY en el servidor." }, { status: 500 });
      }
    }
  }

  try {
    const account = await prisma.journalAccount.update({
      where: { id: params.id },
      data: {
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        initialBalance: parsed.data.initialBalance,
        ...mt5Data,
      },
    });
    const { investorPasswordEnc, ...safeAccount } = account;
    return NextResponse.json({ account: { ...safeAccount, mt5Connected: Boolean(investorPasswordEnc) } });
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
