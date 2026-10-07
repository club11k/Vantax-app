import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Tienda de Vantax Play: artículos activos del catálogo, saldo del jugador y
// sus últimos canjes (07/10/2026).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const [user, articles, orders, payouts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { vCoinBalance: true, payoutWallet: true, payoutNetwork: true } }),
    prisma.playCatalogArticle.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { price: "asc" }] }),
    prisma.playShopOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.playPayout.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 10 }),
  ]);

  const history = [
    ...orders.map((o) => ({
      id: o.id,
      name: o.articleName,
      price: o.price,
      status: o.articleName.endsWith(" · pago por broker")
        ? o.status === "ENTREGADO" ? "Pagado" : "Pago pendiente"
        : o.status === "ENTREGADO" ? "Entregado" : "Pendiente de entrega",
      done: o.status === "ENTREGADO",
      date: o.createdAt.toISOString(),
    })),
    ...payouts.map((p) => ({
      id: p.id,
      name: p.note ?? "Cashback en USDT",
      price: p.amountVCoin,
      status: p.status === "PAGADO" ? "Pagado" : "Pago pendiente",
      done: p.status === "PAGADO",
      date: p.requestedAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return NextResponse.json({
    balance: user?.vCoinBalance ?? 0,
    hasWallet: !!(user?.payoutWallet && user?.payoutNetwork),
    articles: articles.map((a) => ({ id: a.id, name: a.name, category: a.category, price: a.price, imageUrl: a.imageUrl })),
    history,
  });
}
