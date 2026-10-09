import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainingViewer } from "@/lib/training";

// Sirve un PDF subido a Formación, solo a quien tenga acceso. Siempre se abre
// dentro del navegador (sin opción de descarga desde la web).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getTrainingViewer();
  if (!viewer) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!viewer.allowed) return NextResponse.json({ error: "No tienes acceso a Formación." }, { status: 403 });

  const file = await prisma.trainingFile.findUnique({
    where: { id: params.id },
    include: { modules: { select: { course: { select: { published: true } } } } },
  });
  if (!file) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  if (!viewer.isAdmin && !file.modules.some((m) => m.course.published)) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  const safeName = file.filename.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType || "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
