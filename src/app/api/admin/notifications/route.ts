import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Campanita de avisos del admin (07/10/2026): cuenta lo que está pendiente
// de que un admin lo atienda (pagos de cashback, pedidos de la tienda,
// usuarios nuevos que aún no tienen acceso). Solo devuelve los que tienen
// algo pendiente.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [payouts, orders, newUsers] = await Promise.all([
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
  ]);

  const items = [
    { key: "payouts", icon: "💸", label: "Pagos de cashback pendientes", count: payouts, href: "/admin/play-config#pagos" },
    { key: "orders", icon: "📦", label: "Pedidos de la tienda por entregar", count: orders, href: "/admin/play-config#pedidos" },
    { key: "users", icon: "🙋", label: "Usuarios nuevos sin acceso (14 días)", count: newUsers, href: "/admin/users" },
  ].filter((i) => i.count > 0);

  return NextResponse.json(
    { total: items.reduce((s, i) => s + i.count, 0), items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
