import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRemainingQuota, consumeQuota } from "@/lib/quota";
import { generateAnalysis } from "@/lib/analysis-engine";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const { format } = await req.json().catch(() => ({ format: null }));
  if (format !== "MENSAJE" && format !== "TECNICO") {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }

  const quota = await getRemainingQuota(userId);
  if (!quota.canGenerate) {
    return NextResponse.json({ error: quota.reason ?? "No se puede generar el análisis." }, { status: 403 });
  }

  try {
    const { content, snapshot } = await generateAnalysis(format);

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
      { error: "No se pudo generar el análisis. Verificá que ANTHROPIC_API_KEY esté configurada." },
      { status: 500 }
    );
  }
}
