import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAdminChat, type ChatMessage } from "@/lib/admin-chat";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGES_PER_MESSAGE = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5MB en base64

// Agente de análisis conversacional, solo para admins — ver
// src/lib/admin-chat.ts: a diferencia del chat original ahora está anclado
// al snapshot real de mercado (se reconstruye fresco en cada turno) y
// combina en un solo sitio razonamiento conversable, búsqueda web en tiempo
// real y capturas de gráfico adjuntas. /api/admin/chat/save-analysis guarda
// cualquier respuesta suya como un análisis real del historial.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawMessages = body?.messages as ChatMessage[] | undefined;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  // Saneamos los bloques de imagen (solo pueden venir en mensajes de
  // usuario): tipo permitido, tamaño máximo y como mucho unas cuantas por
  // mensaje, igual que en /api/analysis/generate.
  const messages: ChatMessage[] = rawMessages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const filtered = m.content
      .filter((block: any) => {
        if (block?.type !== "image") return true;
        const data = block?.source?.data;
        return (
          typeof data === "string" &&
          data.length <= MAX_IMAGE_BYTES &&
          ALLOWED_IMAGE_TYPES.has(block?.source?.media_type)
        );
      })
      .slice(0, 50); // margen amplio de bloques de texto; las imágenes ya están topadas abajo
    const imageCount = filtered.filter((b: any) => b.type === "image").length;
    if (imageCount > MAX_IMAGES_PER_MESSAGE) {
      let kept = 0;
      return {
        ...m,
        content: filtered.filter((b: any) => {
          if (b.type !== "image") return true;
          kept += 1;
          return kept <= MAX_IMAGES_PER_MESSAGE;
        }),
      };
    }
    return { ...m, content: filtered };
  });

  try {
    const content = await runAdminChat(messages);
    return NextResponse.json({ content });
  } catch (err) {
    console.error("Error en el chat de admin:", err);
    const message = err instanceof Error ? err.message : "No se pudo contactar con la IA.";
    return NextResponse.json({ error: `No se pudo obtener respuesta: ${message}` }, { status: 500 });
  }
}
