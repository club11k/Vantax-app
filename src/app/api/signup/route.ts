import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: parsed.data.name,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Por si dos peticiones casi simultáneas pasan el chequeo de "existing" a
    // la vez, o cualquier otro fallo inesperado — así el usuario siempre ve
    // un mensaje claro en vez de una página de error genérica sin JSON.
    console.error("Error creando cuenta:", err);
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "No se pudo crear la cuenta por un error del servidor. Inténtalo de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}
