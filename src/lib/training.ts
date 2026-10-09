import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export { toVideoEmbed, toPdfViewUrl, type VideoEmbed } from "@/lib/training-embed";

// Utilidades de Formación (09/10/2026).

export const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB por PDF

// Quién está mirando y si puede ver Formación: los admin siempre; el resto
// solo si un admin le ha abierto el acceso desde /admin/users.
export async function getTrainingViewer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id as string;
  const isAdmin = (session.user as any).role === "ADMIN";
  if (isAdmin) return { userId, isAdmin, allowed: true };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trainingAccess: true, suspended: true } });
  return { userId, isAdmin, allowed: !!user?.trainingAccess && !user?.suspended };
}

