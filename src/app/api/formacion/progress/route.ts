import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessCourse, getTrainingViewer } from "@/lib/training";

// Marca o desmarca un módulo de Formación como completado.
export async function POST(req: Request) {
  const viewer = await getTrainingViewer();
  if (!viewer) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as any;
  const moduleId = typeof body?.moduleId === "string" ? body.moduleId : "";
  const done = body?.done !== false;
  if (!moduleId) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });

  const mod = await prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { course: { select: { id: true, published: true } } } });
  if (!mod || !(await canAccessCourse(viewer, mod.course))) {
    return NextResponse.json({ error: "No tienes acceso a esta formación." }, { status: 403 });
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
