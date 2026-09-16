import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Abre un cofre pendiente del jugador — propio (ganado con la barra de
// Progreso del Trader) o regalado por un admin — y devuelve el premio para
// que la pantalla de apertura lo muestre. Es la única forma de conseguir el
// V-COIN de un cofre propio: se acredita aquí mismo, no al desbloquearlo
// (desbloquear solo dice "ya lo tienes, ábrelo cuando quieras").
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const { kind, id } = body as { kind?: unknown; id?: unknown };
  if ((kind !== "self" && kind !== "gift") || typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    if (kind === "self") {
      const userChest = await prisma.playUserChest.findUnique({
        where: { id },
        include: { chest: { include: { loot: { include: { article: true } } } } },
      });
      if (!userChest || userChest.userId !== userId) {
        return NextResponse.json({ error: "Cofre no encontrado." }, { status: 404 });
      }
      if (userChest.openedAt) {
        return NextResponse.json({ error: "Ese cofre ya estaba abierto." }, { status: 409 });
      }

      // Premio garantizado en V-COIN + posibilidad de un artículo extra
      // según la probabilidad configurada del cofre (chest_loot).
      let wonArticle: { name: string; imageUrl: string | null } | null = null;
      for (const loot of userChest.chest.loot) {
        if (Math.random() * 100 < loot.probability) {
          wonArticle = { name: loot.article.name, imageUrl: loot.article.imageUrl };
          break;
        }
      }

      const vcoinAmount = Math.round(userChest.chest.vcoinReward);
      await prisma.$transaction([
        prisma.playUserChest.update({ where: { id }, data: { openedAt: new Date() } }),
        ...(vcoinAmount > 0
          ? [
              prisma.playVCoinTransaction.create({
                data: {
                  userId,
                  type: "COFRE",
                  amount: vcoinAmount,
                  description: `Cofre ${userChest.chest.label} abierto`,
                },
              }),
              prisma.user.update({ where: { id: userId }, data: { vCoinBalance: { increment: vcoinAmount } } }),
            ]
          : []),
      ]);

      return NextResponse.json({
        tier: userChest.chest.tier,
        label: userChest.chest.label,
        vcoinAmount,
        article: wonArticle,
      });
    }

    // kind === "gift"
    const gift = await prisma.playPlayerGift.findUnique({ where: { id }, include: { article: true } });
    if (!gift || gift.userId !== userId) {
      return NextResponse.json({ error: "Regalo no encontrado." }, { status: 404 });
    }
    if (gift.delivered) {
      return NextResponse.json({ error: "Ese regalo ya estaba abierto." }, { status: 409 });
    }

    const vcoinAmount = gift.rewardType === "VCOIN" ? Math.round(gift.amount ?? 0) : 0;

    await prisma.$transaction([
      prisma.playPlayerGift.update({ where: { id }, data: { delivered: true } }),
      ...(vcoinAmount > 0
        ? [
            prisma.playVCoinTransaction.create({
              data: { userId, type: "COFRE", amount: vcoinAmount, description: "Cofre regalo de administrador" },
            }),
            prisma.user.update({ where: { id: userId }, data: { vCoinBalance: { increment: vcoinAmount } } }),
          ]
        : []),
    ]);

    return NextResponse.json({
      tier: gift.tier,
      label: "Cofre regalo",
      vcoinAmount,
      article: gift.article ? { name: gift.article.name, imageUrl: gift.article.imageUrl } : null,
    });
  } catch (err) {
    console.error("Error abriendo cofre:", err);
    return NextResponse.json({ error: "No se pudo abrir el cofre." }, { status: 500 });
  }
}
