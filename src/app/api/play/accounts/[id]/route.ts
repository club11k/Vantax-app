import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";

// Edita o borra una cuenta de Vantax Play ya vinculada. Antes solo se podía
// vincular (POST /api/play/accounts) pero no corregir después el login/
// contraseña investor ni el servidor MT5 -- necesario, por ejemplo, cuando
// se metió el dato equivocado (email en vez del número de login investor) y
// el orquestador MT5 necesita el valor correcto para poder sincronizar.
// Mismo patrón que /api/journal/account/[id].

const patchSchema = z.object({
  // Todos opcionales: solo se toca lo que se manda. investorPassword en
  // blanco significa "no cambiar la contraseña guardada" (nunca se vuelve a
  // mostrar en el formulario, así que mandarla vacía no puede significar
  // "bórrala"). Para desconectar MT5 del todo se manda clearMt5: true.
  investorLogin: z.string().trim().max(50).optional().or(z.literal("")),
  investorPassword: z.string().trim().max(255).optional().or(z.literal("")),
  mt5Server: z.string().trim().max(100).optional().or(z.literal("")),
  clearMt5: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const existing = await prisma.playMt5Account.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

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
      try {
        mt5Data.investorPasswordEnc = encrypt(parsed.data.investorPassword);
      } catch (err: any) {
        console.error("Error cifrando la contraseña investor:", err.message);
        return NextResponse.json({ error: "No se pudo cifrar la contraseña investor. Revisa ENCRYPTION_KEY en el servidor." }, { status: 500 });
      }
    }
  }

  if (Object.keys(mt5Data).length === 0) {
    return NextResponse.json({ error: "No hay ningún cambio que guardar." }, { status: 400 });
  }

  try {
    const account = await prisma.playMt5Account.update({
      where: { id: params.id },
      data: mt5Data,
    });
    const { investorPasswordEnc, ...safeAccount } = account;
    return NextResponse.json({ account: { ...safeAccount, mt5Connected: Boolean(investorPasswordEnc) } });
  } catch (err) {
    console.error("Error actualizando la cuenta Play:", err);
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

  const existing = await prisma.playMt5Account.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  try {
    await prisma.playMt5Account.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error borrando la cuenta Play:", err);
    return NextResponse.json(
      { error: "No se pudo borrar la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}
