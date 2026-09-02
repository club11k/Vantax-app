import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRemainingQuota, consumeQuota } from "@/lib/quota";
import { generateAnalysis } from "@/lib/analysis-engine";
import type { AnalysisImageInput } from "@/lib/analysis-engine";

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5MB por imagen en base64 (aprox., ya decodificado sería menor)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const isAdmin = (session.user as any).role === "ADMIN";

  const body = await req.json().catch(() => ({ format: null }));
  const { format, images: rawImages } = body as { format: unknown; images?: unknown };
  if (format !== "MENSAJE" && format !== "TECNICO") {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }

  const quota = await getRemainingQuota(userId);
  if (!quota.canGenerate) {
    return NextResponse.json({ error: quota.reason ?? "No se puede generar el análisis." }, { status: 403 });
  }

  // Las imágenes de referencia son exclusivas del usuario admin: se ignoran silenciosamente
  // para cualquier otro usuario, aunque llegaran en el cuerpo de la petición.
  let images: AnalysisImageInput[] | undefined;
  if (isAdmin && Array.isArray(rawImages)) {
    images = rawImages
      .filter(
        (img): img is { label?: string; mediaType?: string; base64Data?: string } =>
          !!img && typeof img === "object" && typeof (img as any).base64Data === "string" && typeof (img as any).mediaType === "string"
      )
      .slice(0, MAX_IMAGES)
      .filter((img) => (img.base64Data as string).length <= MAX_IMAGE_BYTES)
      .map((img) => ({
        label: typeof img.label === "string" && img.label.trim() ? img.label.trim() : "Gráfico",
        mediaType: img.mediaType as string,
        base64Data: img.base64Data as string,
      }));
    if (images.length === 0) images = undefined;
  }

  try {
    const { content, snapshot } = await generateAnalysis(format, images);

    const analysis = await prisma.analysis.create({
      data: {
        userId,
        format,
        content,
        dataSnapshot: snapshot as any,
      },
    });

    await consumeQuota(userId);

    return NextResponse.json({ id: analysis.id, content, createdAt: analysis.createdAt });
  } catch (err) {
    console.error("Error generando análisis:", err);
    return NextResponse.json(
      { error: "No se pudo generar el análisis. Verifica que ANTHROPIC_API_KEY esté configurada." },
      { status: 500 }
    );
  }
}

