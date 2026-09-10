"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncVantageVCoin, type VantageSyncResult } from "@/lib/vantage-ib";

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

// Otorga acceso gratuito a un usuario sin pasar por Stripe: lo asigna a un
// plan interno "Acceso gratuito" (se crea la primera vez que se usa esta
// acción) con la cuota mensual indicada, y activa su suscripción.
export async function grantFreeAccess(userId: string, monthlyQuota: number = 30) {
  const admin = await requireAdmin();

  let freePlan = await prisma.plan.findFirst({ where: { isFree: true } });
  if (!freePlan) {
    freePlan = await prisma.plan.create({
      data: {
        name: "Acceso gratuito",
        description: "Acceso otorgado manualmente por un administrador, sin cargo.",
        priceCents: 0,
        monthlyQuota,
        isFree: true,
        active: false, // no aparece entre los planes que se ofrecen a los usuarios
        sortOrder: 999,
      },
    });
  } else if (freePlan.monthlyQuota !== monthlyQuota) {
    freePlan = await prisma.plan.update({
      where: { id: freePlan.id },
      data: { monthlyQuota },
    });
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      planId: freePlan.id,
      subscriptionStatus: "ACTIVE",
      analysesUsedInPeriod: 0,
      periodStart: now,
      periodEnd: null,
    },
  });

  await logAction(admin.id, "grant_free_access", { userId, planId: freePlan.id, monthlyQuota });
  revalidatePath("/admin/users");
}

// Acceso al Centro de Mercado (/mercado), independiente del acceso a
// Análisis (que se sigue dando con setUserPlan/grantFreeAccess). Con esto se
// puede abrir solo el centro de mercado, solo análisis, o los dos, para
// cada miembro de la comunidad.
export async function toggleMarketAccess(userId: string, enabled: boolean) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { marketAccess: enabled } });
  await logAction(admin.id, "toggle_market_access", { userId, enabled });
  revalidatePath("/admin/users");
}

// Permiso para pedirle cambios a la IA sobre un análisis recién generado,
// como una conversación, antes de darlo por bueno. Independiente en base de
// datos, pero sin efecto real si el usuario no tiene además acceso a
// Análisis (plan activo) — sin plan no hay nada que editar.
export async function toggleAnalysisChatAccess(userId: string, enabled: boolean) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { analysisChatAccess: enabled } });
  await logAction(admin.id, "toggle_analysis_chat_access", { userId, enabled });
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

// --- V-COIN / Vantage IB ---

// Llama a la API de comisión de IB de Vantage (a través del proxy del
// droplet) y acredita V-COIN a cada usuario según la comisión nueva
// generada desde la última sincronización. Se ejecuta a mano desde
// /admin/settings — no hay cron automático todavía.
export async function syncVantageCommissions(): Promise<VantageSyncResult & { error?: string }> {
  const admin = await requireAdmin();
  try {
    const result = await syncVantageVCoin();
    await logAction(admin.id, "sync_vantage_vcoin", result as any);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/users");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al sincronizar con Vantage.";
    await logAction(admin.id, "sync_vantage_vcoin_error", { error: message });
    return {
      totalAccountsFromVantage: 0,
      matchedAccounts: 0,
      accountsCredited: 0,
      totalVCoinAwarded: 0,
      skippedNoRate: false,
      error: message,
    };
  }
}
