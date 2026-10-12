"use server";

// Acciones de admin para Formación (09/10/2026): formaciones, módulos,
// orden y publicación. Mismo patrón que play-config-actions.ts.

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bunnyDeleteVideo } from "@/lib/bunny";

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

export type CourseInput = { title: string; description: string; coverUrl: string; price: string };

// "99", "99,90" o "99.90" € → céntimos. Vacío o 0 = sin venta.
function parsePrice(v: string): number | null {
  const t = (v ?? "").trim().replace(/\s|€/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error("El precio no es válido. Escríbelo en euros, por ejemplo 99 o 99,90.");
  const cents = Math.round(n * 100);
  if (cents === 0) return null;
  if (cents < 50) throw new Error("El precio mínimo para cobrar con Stripe es 0,50 €.");
  return cents;
}

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
      priceCents: parsePrice(data.price),
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
    data: {
      title,
      description: clean(data.description, 4000),
      coverUrl: checkUrl(clean(data.coverUrl, 900_000)),
      priceCents: parsePrice(data.price),
    },
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
  const vids = await prisma.trainingModule.findMany({ where: { courseId, bunnyVideoId: { not: null } }, select: { bunnyVideoId: true } });
  await prisma.trainingCourse.delete({ where: { id: courseId } });
  await logAction(admin.id, "delete_training_course", { courseId });
  await Promise.all(vids.map((v) => bunnyDeleteVideo(v.bunnyVideoId)));
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

// --- Módulos (agrupan capítulos) ---

export type SectionInput = { title: string; description: string };

export async function createSection(courseId: string, data: SectionInput) {
  const admin = await requireAdmin();
  const title = clean(data.title, 160);
  if (!title) throw new Error("Pon un título al módulo.");
  const last = await prisma.trainingSection.findFirst({ where: { courseId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const sec = await prisma.trainingSection.create({
    data: { courseId, title, description: clean(data.description, 4000), sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  await logAction(admin.id, "create_training_section", { courseId, sectionId: sec.id });
  refresh(courseId);
}

export async function updateSection(sectionId: string, data: SectionInput) {
  const admin = await requireAdmin();
  const title = clean(data.title, 160);
  if (!title) throw new Error("Pon un título al módulo.");
  const sec = await prisma.trainingSection.update({ where: { id: sectionId }, data: { title, description: clean(data.description, 4000) } });
  await logAction(admin.id, "update_training_section", { sectionId });
  refresh(sec.courseId);
}

export async function deleteSection(sectionId: string) {
  const admin = await requireAdmin();
  const vids = await prisma.trainingModule.findMany({ where: { sectionId, bunnyVideoId: { not: null } }, select: { bunnyVideoId: true } });
  const sec = await prisma.trainingSection.delete({ where: { id: sectionId } });
  await logAction(admin.id, "delete_training_section", { sectionId });
  await Promise.all(vids.map((v) => bunnyDeleteVideo(v.bunnyVideoId)));
  await cleanupOrphanFiles();
  refresh(sec.courseId);
}

export async function moveSection(sectionId: string, dir: -1 | 1) {
  await requireAdmin();
  const sec = await prisma.trainingSection.findUnique({ where: { id: sectionId }, select: { courseId: true } });
  if (!sec) return;
  const all = await prisma.trainingSection.findMany({
    where: { courseId: sec.courseId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = all.findIndex((x) => x.id === sectionId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((x, k) => prisma.trainingSection.update({ where: { id: x.id }, data: { sortOrder: k + 1 } })));
  refresh(sec.courseId);
}

// --- Capítulos (tabla TrainingModule) ---

export type ModuleInput = {
  title: string;
  description: string;
  videoUrl: string;
  pdfUrl: string;
  pdfFileId: string | null;
  bunnyVideoId: string | null;
};

function moduleData(data: ModuleInput) {
  const title = clean(data.title, 160);
  if (!title) throw new Error("Pon un título al capítulo.");
  return {
    title,
    description: clean(data.description, 10000),
    videoUrl: checkUrl(clean(data.videoUrl, 1000)),
    pdfUrl: data.pdfFileId ? null : checkUrl(clean(data.pdfUrl, 1000)),
    pdfFileId: data.pdfFileId || null,
    bunnyVideoId: data.bunnyVideoId && /^[0-9a-f-]{20,64}$/i.test(data.bunnyVideoId) ? data.bunnyVideoId : null,
  };
}

export async function createModule(sectionId: string, data: ModuleInput) {
  const admin = await requireAdmin();
  const sec = await prisma.trainingSection.findUnique({ where: { id: sectionId }, select: { courseId: true } });
  if (!sec) throw new Error("Este módulo ya no existe.");
  const last = await prisma.trainingModule.findFirst({ where: { sectionId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const mod = await prisma.trainingModule.create({
    data: { ...moduleData(data), courseId: sec.courseId, sectionId, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  await logAction(admin.id, "create_training_lesson", { sectionId, moduleId: mod.id });
  refresh(sec.courseId);
}

export async function updateModule(moduleId: string, data: ModuleInput) {
  const admin = await requireAdmin();
  const before = await prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { bunnyVideoId: true } });
  const next = moduleData(data);
  const mod = await prisma.trainingModule.update({ where: { id: moduleId }, data: next });
  await logAction(admin.id, "update_training_module", { moduleId });
  // Si se ha cambiado o quitado el vídeo subido, se borra el antiguo de Bunny.
  if (before?.bunnyVideoId && before.bunnyVideoId !== next.bunnyVideoId) await bunnyDeleteVideo(before.bunnyVideoId);
  await cleanupOrphanFiles();
  refresh(mod.courseId);
}

export async function deleteModule(moduleId: string) {
  const admin = await requireAdmin();
  const mod = await prisma.trainingModule.delete({ where: { id: moduleId } });
  await logAction(admin.id, "delete_training_module", { moduleId });
  await bunnyDeleteVideo(mod.bunnyVideoId);
  await cleanupOrphanFiles();
  refresh(mod.courseId);
}

export async function moveModule(moduleId: string, dir: -1 | 1) {
  await requireAdmin();
  const mod = await prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { courseId: true, sectionId: true } });
  if (!mod) return;
  const all = await prisma.trainingModule.findMany({
    where: { sectionId: mod.sectionId },
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

// --- Accesos a una formación concreta ---

export async function grantCourseAccess(courseId: string, email: string) {
  const admin = await requireAdmin();
  const e = (email ?? "").trim().toLowerCase();
  if (!e) throw new Error("Escribe el email del usuario.");
  const user = await prisma.user.findFirst({ where: { email: { equals: e, mode: "insensitive" } }, select: { id: true } });
  if (!user) throw new Error("No hay ningún usuario registrado con ese email.");
  const existing = await prisma.trainingPurchase.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  if (existing) throw new Error("Este usuario ya tiene acceso a esta formación.");
  await prisma.trainingPurchase.create({ data: { userId: user.id, courseId, source: "MANUAL", amountCents: 0 } });
  await logAction(admin.id, "grant_training_course_access", { courseId, userId: user.id });
  refresh(courseId);
}

export async function revokeCourseAccess(purchaseId: string) {
  const admin = await requireAdmin();
  const p = await prisma.trainingPurchase.delete({ where: { id: purchaseId } });
  await logAction(admin.id, "revoke_training_course_access", { purchaseId, courseId: p.courseId, userId: p.userId, source: p.source });
  refresh(p.courseId);
}
