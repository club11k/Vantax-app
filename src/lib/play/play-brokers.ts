import { prisma } from "@/lib/prisma";

// Busca un PlayBroker por nombre (sin distinguir mayúsculas/minúsculas) o lo
// crea si no existe todavía — igual que findOrCreateBroker en el
// accounts.js original de club11k/vantax-play-backend.
export async function findOrCreatePlayBroker(name: string): Promise<string> {
  const trimmed = name.trim();
  const existing = await prisma.playBroker.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing.id;

  const created = await prisma.playBroker.create({ data: { name: trimmed } });
  return created.id;
}
