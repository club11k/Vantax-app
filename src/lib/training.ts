import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export { toVideoEmbed, toPdfViewUrl, type VideoEmbed } from "@/lib/training-embed";

// Utilidades de Formación (09/10/2026).

export const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB por PDF

// Quién está mirando Formación. Acceso a una formación:
// - admin: a todas (también a los borradores);
// - "acceso total" (botón Formación en /admin/users): a todas las publicadas;
// - si no: solo a las que ha comprado o le han dado a mano (TrainingPurchase).
export type TrainingViewer = { userId: string; isAdmin: boolean; fullAccess: boolean; suspended: boolean };

export async function getTrainingViewer(): Promise<TrainingViewer | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id as string;
  const isAdmin = (session.user as any).role === "ADMIN";
  if (isAdmin) return { userId, isAdmin, fullAccess: true, suspended: false };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trainingAccess: true, suspended: true } });
  return { userId, isAdmin, fullAccess: !!user?.trainingAccess, suspended: !!user?.suspended };
}

export async function getOwnedCourseIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.trainingPurchase.findMany({ where: { userId }, select: { courseId: true } });
  return new Set(rows.map((r) => r.courseId));
}

export async function canAccessCourse(viewer: TrainingViewer, course: { id: string; published: boolean }): Promise<boolean> {
  if (viewer.isAdmin) return true;
  if (viewer.suspended || !course.published) return false;
  if (viewer.fullAccess) return true;
  const p = await prisma.trainingPurchase.findUnique({
    where: { userId_courseId: { userId: viewer.userId, courseId: course.id } },
    select: { id: true },
  });
  return !!p;
}

export function formatPrice(cents: number, currency = "eur") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
