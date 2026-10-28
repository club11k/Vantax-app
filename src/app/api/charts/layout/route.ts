import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChartsUserId } from "@/lib/charts/viewer";

export const dynamic = "force-dynamic";

const MAX_BYTES = 400_000;

// Diseño del gráfico del usuario (símbolo, temporalidad, indicadores y
// dibujos). Se guarda solo desde el gráfico, unos segundos después de cada
// cambio.
export async function GET() {
  const userId = await getChartsUserId();
  if (!userId) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const row = await prisma.chartLayout.findUnique({ where: { userId } });
  return NextResponse.json({ layout: row?.data ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const userId = await getChartsUserId();
  if (!userId) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Demasiados dibujos guardados." }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  await prisma.chartLayout.upsert({
    where: { userId },
    create: { userId, data: data as any },
    update: { data: data as any },
  });
  return NextResponse.json({ ok: true });
}
