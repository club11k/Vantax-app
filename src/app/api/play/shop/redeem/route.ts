import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Canjea un artículo de la tienda con V-COIN (07/10/2026).
// - Descuenta el precio del saldo de forma atómica (solo si llega el saldo,
//   así dos clics seguidos no pueden dejarlo en negativo).
// - Cashback → el jugador elige cómo cobrarlo: en su wallet USDT (dirección +
//   red) o a través del broker (su UID). Se crea un pago pendiente que sale en
//   "Pagos pendientes" del admin con la forma de pago y el destino.
// - Merch / mentoría → crea un pedido pendiente de entrega para el admin.
class ShopError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Payment =
  | { method: "WALLET"; wallet: string; network: "TRC20" | "BEP20" }
  | { method: "BROKER"; uid: string };

function parsePayment(raw: any): Payment | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.method === "WALLET") {
    const wallet = typeof raw.wallet === "string" ? raw.wallet.trim() : "";
    const network = raw.network === "BEP20" ? "BEP20" : raw.network === "TRC20" ? "TRC20" : null;
    if (wallet.length < 20 || wallet.length > 120 || /\s/.test(wallet) || !network) return null;
    return { method: "WALLET", wallet, network };
  }
  if (raw.method === "BROKER") {
    const uid = typeof raw.uid === "string" ? raw.uid.trim() : "";
    if (!uid || uid.length > 60) return null;
    return { method: "BROKER", uid };
  }
  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = (await req.json().catch(() => ({}))) as any;
  const articleId = body?.articleId;
  if (typeof articleId !== "string" || !articleId) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const article = await tx.playCatalogArticle.findUnique({ where: { id: articleId } });
      if (!article || !article.active) throw new ShopError("Este artículo ya no está disponible.", 404);
      const price = Math.round(article.price);

      let payment: Payment | null = null;
      if (article.category === "CASHBACK") {
        payment = parsePayment(body.payment);
        if (!payment) {
          throw new ShopError("Indica dónde quieres recibir tu cashback: una dirección de wallet válida o tu UID del broker.", 400);
        }
      }

      const user = await tx.user.findUnique({ where: { id: userId }, select: { publicId: true } });
      if (!user?.publicId) throw new ShopError("Completa tu registro de jugador en Perfil antes de canjear.", 400);

      const charged = await tx.user.updateMany({
        where: { id: userId, vCoinBalance: { gte: price } },
        data: { vCoinBalance: { decrement: price } },
      });
      if (charged.count === 0) throw new ShopError("No tienes V-COIN suficiente para este artículo.", 409);

      await tx.playVCoinTransaction.create({
        data: { userId, type: "TIENDA", amount: -price, description: `Canje en la tienda: ${article.name}` },
      });

      if (payment) {
        await tx.playPayout.create({
          data: {
            userId,
            amountVCoin: price,
            note: article.name,
            method: payment.method,
            wallet: payment.method === "WALLET" ? payment.wallet : null,
            network: payment.method === "WALLET" ? payment.network : null,
            brokerUid: payment.method === "BROKER" ? payment.uid : null,
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
