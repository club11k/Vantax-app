import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// CHARTS está abierto a cualquier usuario con sesión iniciada.
export async function getChartsUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user ? ((session.user as any).id as string) : null;
}

export async function getChartsViewer(): Promise<{ userId: string; isAdmin: boolean } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { userId: (session.user as any).id as string, isAdmin: (session.user as any).role === "ADMIN" };
}

// El código Pine viaja ofuscado para que no se pueda copiar a simple vista
// desde el navegador (no es cifrado fuerte: el navegador lo necesita para
// calcular el indicador).
export function packCode(code: string, salt: string): string {
  const key = Buffer.from("vx" + salt);
  const buf = Buffer.from(code, "utf8");
  for (let i = 0; i < buf.length; i++) buf[i] ^= key[i % key.length];
  return buf.toString("base64");
}

export function parseIndicatorBody(body: any): { name: string; description: string; code: string; visibility: "ALL" | "ADMIN" | "SELECTED" } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Datos inválidos." };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
  const code = typeof body.code === "string" ? body.code.slice(0, 200_000) : "";
  const visibility = ["ALL", "ADMIN", "SELECTED"].includes(body.visibility) ? body.visibility : "ADMIN";
  if (!name) return { error: "Ponle un nombre al indicador." };
  if (!code.trim()) return { error: "Pega el código Pine del indicador." };
  return { name, description, code, visibility };
}
