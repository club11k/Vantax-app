import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMarketSnapshot } from "@/lib/vantax-data";

// Guarda una respuesta del agente de análisis conversacional (/admin/chat,
// montado dentro de /dashboard) como un análisis real del historial — así
// el chat no es un experimento aparte: cualquier resultado que le convenza
// a la administradora se convierte en el mismo tipo de registro que genera
// el botón normal de análisis, y aparece en su Historial igual que
// cualquier otro. No consume cuota (esto es una herramienta de admin, no
// pasa por el sistema de planes/suscripción).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const { content, format } = body as { content?: unknown; format?: unknown };

  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "No hay texto que guardar." }, { status: 400 });
  }
  if (format !== "MENSAJE" && format !== "TECNICO") {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }

  try {
    // El snapshot que respalda el análisis guardado: se reconstruye fresco
    // en el momento de guardar (no el de un turno anterior de la
    // conversación, que puede haberse quedado desactualizado si pasó tiempo
    // hablando antes de decidir guardar esta versión).
    const snapshot = await buildMarketSnapshot();

    const analysis = await prisma.analysis.create({
      data: {
        userId,
        format,
        content: content.trim(),
        dataSnapshot: snapshot as any,
      },
    });

    return NextResponse.json({ id: analysis.id, createdAt: analysis.createdAt });
  } catch (err) {
    console.error("Error guardando análisis desde el chat:", err);
    return NextResponse.json({ error: "No se pudo guardar el análisis." }, { status: 500 });
  }
}
