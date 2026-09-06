import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readDailyResultFromImage } from "@/lib/journal-vision";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5MB en base64

// Esta ruta SOLO propone una cifra leída por IA a partir de una foto —
// nunca la guarda. El usuario tiene que confirmarla (o corregirla) en el
// formulario y enviarla luego a /api/journal/entries para que quede
// registrada de verdad. Así ninguna cifra entra al diario sin que el
// usuario la haya visto y aceptado.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { mediaType, base64Data } = (body ?? {}) as { mediaType?: unknown; base64Data?: unknown };

  if (typeof mediaType !== "string" || typeof base64Data !== "string" || !base64Data) {
    return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  }
  if (base64Data.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "La imagen es demasiado grande." }, { status: 400 });
  }

  try {
    const result = await readDailyResultFromImage({ mediaType, base64Data });
    if (!result.ok) {
      return NextResponse.json({ found: false, reason: result.reason });
    }
    return NextResponse.json({
      found: true,
      amount: result.amount,
      confidence: result.confidence,
      note: result.note,
    });
  } catch (err) {
    console.error("Error leyendo la imagen de Journaly:", err);
    return NextResponse.json(
      { error: "No se pudo leer la imagen. Verifica que ANTHROPIC_API_KEY esté configurada." },
      { status: 500 }
    );
  }
}

