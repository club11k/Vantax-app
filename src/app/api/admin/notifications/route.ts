import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WARNING_DAYS } from "@/lib/vantage-block";

// Campanita de avisos del admin (07/10/2026): cuenta lo que está pendiente
// de que un admin lo atienda (pagos de cashback, pedidos de la tienda,
// usuarios nuevos que aún no tienen acceso, gente que lleva 15 días sin
// operar y aún no se ha avisado, y cuentas que se han ido del IB en la
// última semana). Solo devuelve los que tienen algo pendiente.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const DAY = 24 * 60 * 60 * 1000;
  const [payouts, orders, newUsers, ibAccounts] = await Promise.all([
    prisma.playPayout.count({ where: { status: "PENDIENTE" } }),
    prisma.playShopOrder.count({ where: { status: "PENDIENTE" } }),
    prisma.user.count({
      where: {
        role: "USER",
        suspended: false,
        marketAccess: false,
        subscriptionStatus: { not: "ACTIVE" },
        createdAt: { gte: since },
      },
    }),
    prisma.vantageIbAccount.findMany({
      select: {
        userId: true,
        ibStatus: true,
        manualActiveOverride: true,
        lastTradeTime: true,
        lastAllocationAt: true,
        user: { select: { vantageInactivityWarnedAt: true } },
      },
    }),
  ]);

  // Inactivos: mismo criterio que /admin/vantage-inactivity (cuentas aún
  // vinculadas, última operación hace WARNING_DAYS o más), pero solo los que
  // todavía no se han avisado — en cuanto se pulsa "Avisar" deja de contar.
  const now = Date.now();
  const lastTradeByUser = new Map<string, { last: number; warned: boolean }>();
  for (const a of ibAccounts) {
    const linked = a.manualActiveOverride !== null ? a.manualActiveOverride : a.ibStatus === "LINKED";
    if (!linked || !a.lastTradeTime) continue;
    const t = a.lastTradeTime.getTime();
    const prev = lastTradeByUser.get(a.userId);
    if (!prev || t > prev.last) lastTradeByUser.set(a.userId, { last: t, warned: !!a.user.vantageInactivityWarnedAt });
  }
  const inactive = Array.from(lastTradeByUser.values()).filter((u) => !u.warned && now - u.last >= WARNING_DAYS * DAY).length;

  // Bajas del IB: cuentas que Vantage ha marcado como desvinculadas en los
  // últimos 7 días (y que no se han forzado a mano como activas).
  const leftIb = ibAccounts.filter(
    (a) =>
      a.ibStatus === "UNLINKED" &&
      a.manualActiveOverride !== true &&
      a.lastAllocationAt &&
      now - a.lastAllocationAt.getTime() <= 7 * DAY
  ).length;

  const items = [
    { key: "payouts", icon: "💸", label: "Pagos de cashback pendientes", count: payouts, href: "/admin/play-config#pagos" },
    { key: "orders", icon: "📦", label: "Pedidos de la tienda por entregar", count: orders, href: "/admin/play-config#pedidos" },
    { key: "inactive", icon: "😴", label: `Usuarios ${WARNING_DAYS}+ días sin operar (sin avisar)`, count: inactive, href: "/admin/vantage-inactivity" },
    { key: "leftIb", icon: "🚪", label: "Cuentas que se han ido del IB (7 días)", count: leftIb, href: "/admin/vantage-clients" },
    { key: "users", icon: "🙋", label: "Usuarios nuevos sin acceso (14 días)", count: newUsers, href: "/admin/users" },
  ].filter((i) => i.count > 0);

  return NextResponse.json(
    { total: items.reduce((s, i) => s + i.count, 0), items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
