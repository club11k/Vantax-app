import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bunnyVideoStatus } from "@/lib/bunny";

// Estado de procesado de un vídeo en Bunny (para el admin).
export async function GET(_req: Request, { params }: { params: { videoId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const st = await bunnyVideoStatus(params.videoId);
  if (!st) return NextResponse.json({ error: "No se pudo consultar el vídeo." }, { status: 502 });
  return NextResponse.json(st, { headers: { "Cache-Control": "no-store" } });
}
