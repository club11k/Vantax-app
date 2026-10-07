import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Canjea un artículo de la tienda con V-COIN (07/10/2026).
// - Descuenta el precio del saldo de forma atómica (solo si llega el saldo,
//   así dos clics seguidos no pueden dejarlo en negativo).
// - Cashback → crea un pago pendiente en USDT a la wallet del perfil (sale
//   en "Pagos pendientes" del admin, igual que antes).
// - Merch / mentoría → crea un pedido pendiente de entrega para el admin.
class ShopError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const articleId = (body as any)?.articleId;
  if (typeof articleId !== "string" || !articleId) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const article = await tx.playCatalogArticle.findUnique({ where: { id: articleId } });
      if (!article || !article.active) throw new ShopError("Este artículo ya no está disponible.", 404);
      const price = Math.round(article.price);

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { publicId: true, payoutWallet: true, payoutNetwork: true },
      });
      if (!user?.publicId) throw new ShopError("Completa tu registro de jugador en Perfil antes de canjear.", 400);
      if (article.category === "CASHBACK" && (!user.payoutWallet || !user.payoutNetwork)) {
        throw new ShopError("Para canjear cashback, añade primero tu wallet USDT en Perfil.", 400);
      }

      const charged = await tx.user.updateMany({
        where: { id: userId, vCoinBalance: { gte: price } },
        data: { vCoinBalance: { decrement: price } },
      });
      if (charged.count === 0) throw new ShopError("No tienes V-COIN suficiente para este artículo.", 409);

      await tx.playVCoinTransaction.create({
        data: { userId, type: "TIENDA", amount: -price, description: `Canje en la tienda: ${article.name}` },
      });

      if (article.category === "CASHBACK") {
        await tx.playPayout.create({
          data: {
            userId,
            amountVCoin: price,
            network: user.payoutNetwork!,
            wallet: user.payoutWallet!,
            note: article.name,
          },
        });
      } else {
        await tx.playShopOrder.create({
          data: { userId, articleId: article.id, articleName: article.name, price },
        });
      }

      const after = await tx.user.findUnique({ where: { id: userId }, select: { vCoinBalance: true } });
      return { article: { name: article.name, category: article.category }, balance: after?.vCoinBalance ?? 0 };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ShopError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error en el canje de la tienda:", err);
    return NextResponse.json({ error: "No se pudo completar el canje. Prueba de nuevo." }, { status: 500 });
  }
}
