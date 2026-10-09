import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainingViewer } from "@/lib/training";

// Marca o desmarca un módulo de Formación como completado.
export async function POST(req: Request) {
  const viewer = await getTrainingViewer();
  if (!viewer) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!viewer.allowed) return NextResponse.json({ error: "No tienes acceso a Formación." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as any;
  const moduleId = typeof body?.moduleId === "string" ? body.moduleId : "";
  const done = body?.done !== false;
  if (!moduleId) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });

  const mod = await prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { course: { select: { published: true } } } });
  if (!mod || (!mod.course.published && !viewer.isAdmin)) {
    return NextResponse.json({ error: "Este módulo no existe." }, { status: 404 });
  }

  if (done) {
    await prisma.trainingProgress.upsert({
      where: { userId_moduleId: { userId: viewer.userId, moduleId } },
      create: { userId: viewer.userId, moduleId },
      update: {},
    });
  } else {
    await prisma.trainingProgress.deleteMany({ where: { userId: viewer.userId, moduleId } });
  }
  return NextResponse.json({ ok: true, done });
}
