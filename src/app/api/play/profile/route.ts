import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Perfil de jugador de Vantax Play: el publicId (el nombre que se ve en
// rankings, nunca el nombre real) y los datos de cobro en cripto. No hay un
// registro/login separado como en el backend original — el usuario ya tiene
// sesión iniciada en VANTAX, esto solo completa los datos que le faltan
// para poder jugar.

const profileSchema = z.object({
  publicId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,30}$/, "El ID de usuario debe tener 3-30 caracteres alfanuméricos (o _), sin espacios."),
  payoutWallet: z.string().trim().max(255).optional().or(z.literal("")),
  payoutNetwork: z.enum(["TRC20", "BEP20"]).optional().or(z.literal("")),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      publicId: true,
      payoutWallet: true,
      payoutNetwork: true,
      vCoinBalance: true,
      myfxbookLink: { select: { email: true, lastSyncedAt: true, createdAt: true } },
      playMt5Accounts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          accountNumber: true,
          accountType: true,
          mt5Server: true,
          ibActive: true,
          balance: true,
          equity: true,
          createdAt: true,
          broker: { select: { name: true } },
        },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    registered: Boolean(user.publicId),
    publicId: user.publicId,
    payoutWallet: user.payoutWallet,
    payoutNetwork: user.payoutNetwork,
    vCoinBalance: user.vCoinBalance,
    myfxbookLink: user.myfxbookLink,
    accounts: user.playMt5Accounts,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { publicId, payoutWallet, payoutNetwork } = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        publicId,
        payoutWallet: payoutWallet || null,
        payoutNetwork: payoutNetwork || null,
      },
      select: { publicId: true, payoutWallet: true, payoutNetwork: true },
    });
    return NextResponse.json({ user });
  } catch (err: any) {
    // El índice único case-insensitive sobre publicId (creado a mano en la
    // migración, fuera del @unique normal de Prisma) no tiene un nombre de
    // constraint que Prisma reconozca como P2002 — se detecta por el texto
    // del error de Postgres.
    const message = String(err?.message || "");
    if (err?.code === "P2002" || message.includes("publicId")) {
      return NextResponse.json({ error: "Ese ID de usuario ya está en uso." }, { status: 409 });
    }
    console.error("Error guardando el perfil de jugador:", err);
    return NextResponse.json({ error: "No se pudo guardar el perfil." }, { status: 500 });
  }
}
