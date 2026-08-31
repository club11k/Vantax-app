import { prisma } from "@/lib/prisma";

// Un usuario "consume" análisis de su cuota mensual (definida por su plan).
// El período de cuota se resetea cuando Stripe nos avisa (webhook
// invoice.paid) de un nuevo ciclo de facturación; acá solo controlamos que
// no se pase del límite dentro del período vigente.

export async function getRemainingQuota(userId: string): Promise<{
  remaining: number;
  quota: number;
  used: number;
  planName: string | null;
  canGenerate: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { plan: true },
  });

  if (!user) {
    return { remaining: 0, quota: 0, used: 0, planName: null, canGenerate: false, reason: "Usuario no encontrado." };
  }

  if (user.suspended) {
    return {
      remaining: 0,
      quota: 0,
      used: user.analysesUsedInPeriod,
      planName: user.plan?.name ?? null,
      canGenerate: false,
      reason: "Tu cuenta está suspendida. Contacta a soporte.",
    };
  }

  if (user.subscriptionStatus !== "ACTIVE" || !user.plan) {
    return {
      remaining: 0,
      quota: 0,
      used: user.analysesUsedInPeriod,
      planName: user.plan?.name ?? null,
      canGenerate: false,
      reason: "No tienes una suscripción activa. Elige un plan para generar análisis.",
    };
  }

  const quota = user.plan.monthlyQuota;
  const used = user.analysesUsedInPeriod;
  const remaining = Math.max(0, quota - used);

  return {
    remaining,
    quota,
    used,
    planName: user.plan.name,
    canGenerate: remaining > 0,
    reason: remaining > 0 ? undefined : "Alcanzaste el límite de análisis de tu plan este mes.",
  };
}

export async function consumeQuota(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { analysesUsedInPeriod: { increment: 1 } },
  });
}


