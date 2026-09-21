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
// investorLogin/investorPassword/mt5Server son obligatorios al crear una
// cuenta: el orquestador MT5 propio (ver mt5-orchestrator/ en la raíz del
// repo) rellena solo el resultado del día, sin entrada manual ni foto, y
// además su primer sync es lo que fija el saldo inicial de la cuenta (ya no
// se pide a mano — ver src/lib/journal/mt5-sync.ts).

const accountSchema = z.object({
  accountUid: z.string().trim().min(1, "El UID de la cuenta es obligatorio.").max(100),
  currency: z.enum(["EUR", "USD", "CENT"]),
  investorLogin: z.string().trim().min(1, "El login investor es obligatorio.").max(50),
  investorPassword: z.string().trim().min(1, "La contraseña investor es obligatoria.").max(255),
  mt5Server: z.string().trim().min(1, "El servidor MT5 es obligatorio.").max(100),
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

  let investorPasswordEnc: string | null;
  try {
    // parsed.data.investorPassword ya viene validado como no-vacío (zod
    // min(1)), así que encrypt() no debería devolver null aquí — el chequeo
    // es solo por si acaso, para no guardar una cuenta sin contraseña cifrada.
    investorPasswordEnc = encrypt(parsed.data.investorPassword);
  } catch (err: any) {
    console.error("Error cifrando la contraseña investor:", err.message);
    return NextResponse.json({ error: "No se pudo cifrar la contraseña investor. Revisa ENCRYPTION_KEY en el servidor." }, { status: 500 });
  }
  if (!investorPasswordEnc) {
    return NextResponse.json({ error: "No se pudo cifrar la contraseña investor." }, { status: 500 });
  }

  try {
    const account = await prisma.journalAccount.create({
      data: {
        userId,
        accountUid: parsed.data.accountUid,
        currency: parsed.data.currency,
        // Sin saldo inicial todavía — lo fija solo el primer sync de MT5
        // (ver src/lib/journal/mt5-sync.ts).
        investorLogin: parsed.data.investorLogin,
        investorPasswordEnc,
        mt5Server: parsed.data.mt5Server,
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
