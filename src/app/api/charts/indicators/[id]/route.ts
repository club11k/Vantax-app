import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChartsViewer, parseIndicatorBody as parseBody } from "@/lib/charts/viewer";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getChartsViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Solo el admin puede editar indicadores." }, { status: 403 });
  const parsed = parseBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const exists = await prisma.chartIndicator.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Ese indicador ya no existe." }, { status: 404 });
  await prisma.chartIndicator.update({ where: { id: params.id }, data: parsed });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getChartsViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Solo el admin puede borrar indicadores." }, { status: 403 });
  await prisma.chartIndicator.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
