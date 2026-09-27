import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";

// Igual que /api/play/accounts/[id] (editar/borrar) pero para admins, sin
// exigir que la cuenta sea del usuario con sesión iniciada -- hace falta
// para limpiar duplicados vinculados por OTRO usuario (ver el comentario de
// /api/admin/play-account-lookup: dos usuarios pueden vincular el mismo
// número de cuenta bajo brokers distintos, y el propio dueño puede no
// tener la contraseña investor correcta a mano ahora mismo). Nunca se usa
// desde la interfaz normal de "Vantax Play": es una herramienta de
// diagnóstico para admins, se llama a mano (fetch desde la consola del
// navegador con la sesión de admin ya iniciada).

const patchSchema = z.object({
  investorLogin: z.string().trim().max(50).optional().or(z.literal("")),
  investorPassword: z.string().trim().max(255).optional().or(z.literal("")),
  mt5Server: z.string().trim().max(100).optional().or(z.literal("")),
  clearMt5: z.boolean().optional(),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }
  return session;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const existing = await prisma.playMt5Account.findUnique({ where: { id: params.id } });
  if (!existing) {
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
    console.error("Error actualizando la cuenta Play (admin):", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const existing = await prisma.playMt5Account.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  try {
    await prisma.playMt5Account.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error borrando la cuenta Play (admin):", err);
    return NextResponse.json(
      { error: "No se pudo borrar la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}
