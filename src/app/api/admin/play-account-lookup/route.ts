import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Herramienta de diagnóstico, solo para admins: busca TODAS las cuentas de
// Vantax Play (de cualquier usuario) que coincidan con un número de cuenta
// o un login investor, para encontrar duplicados vinculados desde una
// cuenta de usuario distinta a la que se está mirando en el panel normal
// (que solo muestra las cuentas del usuario con sesión iniciada). Nunca
// devuelve la contraseña investor, solo si hay una guardada o no.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Falta el parámetro q (número de cuenta o login investor a buscar)." }, { status: 400 });
  }

  const accounts = await prisma.playMt5Account.findMany({
    where: {
      OR: [{ accountNumber: { contains: q } }, { investorLogin: { contains: q } }],
    },
    select: {
      id: true,
      accountNumber: true,
      accountType: true,
      mt5Server: true,
      investorLogin: true,
      investorPasswordEnc: true,
      ibActive: true,
      createdAt: true,
      broker: { select: { name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({
    accounts: accounts.map(({ investorPasswordEnc, ...a }) => ({
      ...a,
      mt5Connected: Boolean(investorPasswordEnc),
    })),
  });
}
