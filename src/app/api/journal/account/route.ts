import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/play/crypto";

// Journaly está disponible para cualquier usuario con sesión iniciada,
// independiente del acceso a Análisis o al Centro de Mercado — es una
// herramienta de seguimiento personal, no una funcionalidad de pago.
//
// Un usuario puede tener varias cuentas de trading en su diario (ej. una
// cuenta principal y otra de una prop firm). Esta ruta lista todas las del
// usuario y crea cuentas nuevas; para editar o borrar una cuenta concreta,
// ver /api/journal/account/[id].
//
// investorLogin/investorPassword/mt5Server son opcionales: si se rellenan,
// el orquestador MT5 propio (ver mt5-orchestrator/ en la raíz del repo)
// puede rellenar el resultado del día solo, sin entrada manual ni foto. Sin
// ellos, la cuenta sigue funcionando exactamente igual que hasta ahora.

const accountSchema = z.object({
  accountUid: z.string().trim().min(1, "El UID de la cuenta es obligatorio.").max(100),
  currency: z.enum(["EUR", "USD", "CENT"]),
  initialBalance: z.number().finite("El saldo inicial no es un número válido."),
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

  const accounts = await prisma.journalAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  // investorPasswordEnc nunca sale de esta ruta — solo si está conectada o no.
  // (lastSyncedAt viaja dentro de "a" sin hacer falta seleccionarlo aparte,
  // porque este findMany no usa "select" y trae todas las columnas.)
  const withFlag = accounts.map(({ investorPasswordEnc, ...a }) => ({ ...a, mt5Connected: Boolean(investorPasswordEnc) }));
  return NextResponse.json({ accounts: withFlag });
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

  let investorPasswordEnc: string | null = null;
  try {
    investorPasswordEnc = parsed.data.investorPassword ? encrypt(parsed.data.investorPassword) : null;
  } catch (err: any) {
    console.error("Error cifrando la contraseña investor:", err.message);
    return NextResponse.json({ error: "No se pudo cifrar la contraseña investor. Revisa ENCRYPTION_KEY en el servidor." }, { status: 500 });
  }

  try {
    const account = await prisma.journalAccount.create({
      data: {
        userId,
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        initialBalance: parsed.data.initialBalance,
        investorLogin: parsed.data.investorLogin || null,
        investorPasswordEnc,
        mt5Server: parsed.data.mt5Server || null,
      },
    });
    const { investorPasswordEnc: _omit, ...safeAccount } = account;
    return NextResponse.json({ account: { ...safeAccount, mt5Connected: Boolean(investorPasswordEnc) } });
  } catch (err) {
    console.error("Error creando la cuenta de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}
