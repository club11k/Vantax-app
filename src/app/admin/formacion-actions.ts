"use server";

// Acciones de admin para Formación (09/10/2026): formaciones, módulos,
// orden y publicación. Mismo patrón que play-config-actions.ts.

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    throw new Error("No autorizado.");
  }
  return session.user as any as { id: string; email: string };
}

async function logAction(adminId: string, action: string, detail?: unknown) {
  await prisma.adminAuditLog.create({ data: { adminId, action, detail: detail as any } });
}

function refresh(courseId?: string) {
  revalidatePath("/admin/formacion");
  revalidatePath("/formacion");
  if (courseId) {
    revalidatePath(`/admin/formacion/${courseId}`);
    revalidatePath(`/formacion/${courseId}`);
  }
}

// PDFs subidos que ya no usa ningún módulo (se deja un margen de un día para
// no borrar uno recién subido que todavía no se ha guardado en su módulo).
async function cleanupOrphanFiles() {
  await prisma.trainingFile.deleteMany({
    where: { modules: { none: {} }, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}

function clean(v: string | null | undefined, max: number) {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function checkUrl(v: string | null) {
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return v;
  } catch {
    throw new Error("Hay un enlace que no es válido. Revisa que empiece por https://");
  }
}

// --- Formaciones ---

export type CourseInput = { title: string; description: string; coverUrl: string };

export async function createCourse(data: CourseInput) {
  const admin = await requireAdmin();
  const title = clean(data.title, 160);
  if (!title) throw new Error("Pon un título a la formación.");
  const last = await prisma.trainingCourse.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const course = await prisma.trainingCourse.create({
    data: {
      title,
      description: clean(data.description, 4000),
      coverUrl: checkUrl(clean(data.coverUrl, 900_000)),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  await logAction(admin.id, "create_training_course", { courseId: course.id });
  refresh();
  return course.id;
}

export async function updateCourse(courseId: string, data: CourseInput) {
  const admin = await requireAdmin();
  const title = clean(data.title, 160);
  if (!title) throw new Error("Pon un título a la formación.");
  await prisma.trainingCourse.update({
    where: { id: courseId },
    data: { title, description: clean(data.description, 4000), coverUrl: checkUrl(clean(data.coverUrl, 900_000)) },
  });
  await logAction(admin.id, "update_training_course", { courseId });
  refresh(courseId);
}

export async function setCoursePublished(courseId: string, published: boolean) {
  const admin = await requireAdmin();
  await prisma.trainingCourse.update({ where: { id: courseId }, data: { published } });
  await logAction(admin.id, "set_training_course_published", { courseId, published });
  refresh(courseId);
}

export async function deleteCourse(courseId: string) {
  const admin = await requireAdmin();
  await prisma.trainingCourse.delete({ where: { id: courseId } });
  await logAction(admin.id, "delete_training_course", { courseId });
  await cleanupOrphanFiles();
  refresh();
}

export async function moveCourse(courseId: string, dir: -1 | 1) {
  await requireAdmin();
  const all = await prisma.trainingCourse.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((c) => c.id === courseId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((c, k) => prisma.trainingCourse.update({ where: { id: c.id }, data: { sortOrder: k + 1 } })));
  refresh();
}

// --- Módulos ---

export type ModuleInput = {
  title: string;
  description: string;
  videoUrl: string;
  pdfUrl: string;
  pdfFileId: string | null;
};

function moduleData(data: ModuleInput) {
  const title = clean(data.title, 160);
  if (!title) throw new Error("Pon un título al módulo.");
  return {
    title,
    description: clean(data.description, 10000),
    videoUrl: checkUrl(clean(data.videoUrl, 1000)),
    pdfUrl: data.pdfFileId ? null : checkUrl(clean(data.pdfUrl, 1000)),
    pdfFileId: data.pdfFileId || null,
  };
}

export async function createModule(courseId: string, data: ModuleInput) {
  const admin = await requireAdmin();
  const last = await prisma.trainingModule.findFirst({ where: { courseId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const mod = await prisma.trainingModule.create({
    data: { ...moduleData(data), courseId, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  await logAction(admin.id, "create_training_module", { courseId, moduleId: mod.id });
  refresh(courseId);
}

export async function updateModule(moduleId: string, data: ModuleInput) {
  const admin = await requireAdmin();
  const mod = await prisma.trainingModule.update({ where: { id: moduleId }, data: moduleData(data) });
  await logAction(admin.id, "update_training_module", { moduleId });
  await cleanupOrphanFiles();
  refresh(mod.courseId);
}

export async function deleteModule(moduleId: string) {
  const admin = await requireAdmin();
  const mod = await prisma.trainingModule.delete({ where: { id: moduleId } });
  await logAction(admin.id, "delete_training_module", { moduleId });
  await cleanupOrphanFiles();
  refresh(mod.courseId);
}

export async function moveModule(moduleId: string, dir: -1 | 1) {
  await requireAdmin();
  const mod = await prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!mod) return;
  const all = await prisma.trainingModule.findMany({
    where: { courseId: mod.courseId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = all.findIndex((m) => m.id === moduleId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((m, k) => prisma.trainingModule.update({ where: { id: m.id }, data: { sortOrder: k + 1 } })));
  refresh(mod.courseId);
}
