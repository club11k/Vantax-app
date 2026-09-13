import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAdminChat, type ChatMessage } from "@/lib/admin-chat";

// Chat libre solo para admins, con búsqueda web en tiempo real — ver
// src/lib/admin-chat.ts para el porqué (el generador de análisis normal no
// tiene búsqueda web, solo el snapshot de datos macro que se refresca por
// cron). Pensado para preguntar por noticias de última hora o para probar
// prompts antes de llevarlos a /admin/settings.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const messages = body?.messages as ChatMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  try {
    const content = await runAdminChat(messages);
    return NextResponse.json({ content });
  } catch (err) {
    console.error("Error en el chat de admin:", err);
    const message = err instanceof Error ? err.message : "No se pudo contactar con la IA.";
    return NextResponse.json({ error: `No se pudo obtener respuesta: ${message}` }, { status: 500 });
  }
}
