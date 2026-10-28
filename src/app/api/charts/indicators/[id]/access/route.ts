import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChartsViewer } from "@/lib/charts/viewer";

export const dynamic = "force-dynamic";

// Usuarios con acceso a un indicador "solo los elegidos" (admin).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getChartsViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const rows = await prisma.chartIndicatorAccess.findMany({
    where: { indicatorId: params.id },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ users: rows.map((r) => ({ id: r.user.id, email: r.user.email, name: r.user.name })) });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getChartsViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Escribe el email del usuario." }, { status: 400 });
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "No hay ningún usuario registrado con ese email." }, { status: 404 });
  const ind = await prisma.chartIndicator.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!ind) return NextResponse.json({ error: "Ese indicador ya no existe." }, { status: 404 });
  await prisma.chartIndicatorAccess.upsert({
    where: { indicatorId_userId: { indicatorId: params.id, userId: user.id } },
    create: { indicatorId: params.id, userId: user.id },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getChartsViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  await prisma.chartIndicatorAccess.deleteMany({ where: { indicatorId: params.id, userId } });
  return NextResponse.json({ ok: true });
}
