"use server";

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

// --- Usuarios ---

export async function resetUserQuota(userId: string) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { analysesUsedInPeriod: 0 } });
  await logAction(admin.id, "reset_user_quota", { userId });
  revalidatePath("/admin/users");
}

export async function setUserPlan(userId: string, planId: string | null) {
  const admin = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: {
      planId,
      subscriptionStatus: planId ? "ACTIVE" : "NONE",
    },
  });
  await logAction(admin.id, "set_user_plan", { userId, planId });
  revalidatePath("/admin/users");
}

export async function toggleUserSuspended(userId: string, suspended: boolean) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { suspended } });
  await logAction(admin.id, "toggle_user_suspended", { userId, suspended });
  revalidatePath("/admin/users");
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN") {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAction(admin.id, "set_user_role", { userId, role });
  revalidatePath("/admin/users");
}

// --- Planes ---

export async function createPlan(data: {
  name: string;
  description: string;
  priceCents: number;
  monthlyQuota: number;
  stripePriceId: string;
}) {
  const admin = await requireAdmin();
  const plan = await prisma.plan.create({
    data: {
      name: data.name,
      description: data.description || undefined,
      priceCents: data.priceCents,
      monthlyQuota: data.monthlyQuota,
      stripePriceId: data.stripePriceId || undefined,
    },
  });
  await logAction(admin.id, "create_plan", { planId: plan.id });
  revalidatePath("/admin/plans");
}

export async function updatePlan(
  planId: string,
  data: { name: string; description: string; priceCents: number; monthlyQuota: number; stripePriceId: string }
) {
  const admin = await requireAdmin();
  await prisma.plan.update({
    where: { id: planId },
    data: {
      name: data.name,
      description: data.description || undefined,
      priceCents: data.priceCents,
      monthlyQuota: data.monthlyQuota,
      stripePriceId: data.stripePriceId || undefined,
    },
  });
  await logAction(admin.id, "update_plan", { planId });
  revalidatePath("/admin/plans");
}

export async function togglePlanActive(planId: string, active: boolean) {
  const admin = await requireAdmin();
  await prisma.plan.update({ where: { id: planId }, data: { active } });
  await logAction(admin.id, "toggle_plan_active", { planId, active });
  revalidatePath("/admin/plans");
}

// --- Configuración global ---

export async function updateSetting(key: string, value: string) {
  const admin = await requireAdmin();
  await prisma.setting.upsert({
    where: { key },
    update: { value: { value } },
    create: { key, value: { value } },
  });
  await logAction(admin.id, "update_setting", { key });
  revalidatePath("/admin/settings");
}
