import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bunnyConfig, bunnyCreateVideo, bunnyUploadSignature } from "@/lib/bunny";

// Prepara la subida de un vídeo de Formación a Bunny: crea el vídeo vacío y
// devuelve una firma temporal para que el navegador suba el archivo directo.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (!bunnyConfig().uploadReady) {
    return NextResponse.json(
      { error: "Falta configurar Bunny en Render (BUNNY_STREAM_LIBRARY_ID y BUNNY_STREAM_API_KEY)." },
      { status: 503 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as any;
  const title = typeof body?.title === "string" ? body.title : "Vídeo de formación";
  try {
    const videoId = await bunnyCreateVideo(title);
    return NextResponse.json({ ok: true, ...bunnyUploadSignature(videoId) });
  } catch (err: any) {
    console.error("Error preparando subida a Bunny:", err?.message ?? err);
    return NextResponse.json({ error: "No se pudo preparar la subida. Revisa la configuración de Bunny." }, { status: 502 });
  }
}
