import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refineAnalysis } from "@/lib/analysis-engine";
import type { MarketSnapshot } from "@/lib/vantax-data";

// Ajusta un análisis ya generado a partir de una instrucción en lenguaje
// natural, como una conversación con la IA — pensado para usarse justo
// después de generar el análisis, antes de darlo por bueno. No consume
// cuota (solo la generación inicial la consume). Requiere que el usuario
// tenga acceso a Análisis (plan activo) Y el permiso específico
// analysisChatAccess, que se otorga por separado desde /admin/usuarios.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const { analysisId, instruction } = body as { analysisId?: unknown; instruction?: unknown };
  if (typeof analysisId !== "string" || !analysisId) {
    return NextResponse.json({ error: "Falta el análisis a editar." }, { status: 400 });
  }
  if (typeof instruction !== "string" || !instruction.trim()) {
    return NextResponse.json({ error: "Escribe qué quieres cambiar." }, { status: 400 });
  }

  const [user, analysis] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { plan: true } }),
    prisma.analysis.findUnique({ where: { id: analysisId } }),
  ]);

  if (!user || user.suspended) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const hasActivePlan = user.subscriptionStatus === "ACTIVE" && !!user.plan;
  if (!hasActivePlan || !user.analysisChatAccess) {
    return NextResponse.json({ error: "No tienes acceso a la edición de análisis con IA." }, { status: 403 });
  }
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json({ error: "Análisis no encontrado." }, { status: 404 });
  }

  try {
    const newContent = await refineAnalysis({
      format: analysis.format,
      currentContent: analysis.content,
      snapshot: analysis.dataSnapshot as unknown as MarketSnapshot,
      instruction: instruction.trim(),
    });

    const updated = await prisma.analysis.update({
      where: { id: analysis.id },
      data: { content: newContent },
    });

    return NextResponse.json({ content: updated.content });
  } catch (err) {
    console.error("Error editando análisis:", err);
    return NextResponse.json({ error: "No se pudo aplicar el cambio. Prueba de nuevo." }, { status: 500 });
  }
}
