import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PDF_BYTES } from "@/lib/training";

// Subida de PDFs de Formación desde admin. Devuelve el id del archivo para
// asociarlo al módulo.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No se ha recibido ningún archivo." }, { status: 400 });
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return NextResponse.json({ error: "Solo se pueden subir archivos PDF." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: `El PDF pesa demasiado (máximo ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).` }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "El archivo no parece un PDF válido." }, { status: 400 });
  }

  const saved = await prisma.trainingFile.create({
    data: { filename: file.name.slice(0, 200), mimeType: "application/pdf", size: buf.length, data: buf },
    select: { id: true, filename: true, size: true },
  });
  return NextResponse.json({ ok: true, file: saved });
}
