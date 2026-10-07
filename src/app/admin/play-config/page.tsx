import { prisma } from "@/lib/prisma";
import { getPlayConfig } from "@/lib/play/vcoin-engine";
import { TIER_ORDER } from "@/lib/play/progress-engine";
import { PlayConfigPanel } from "@/components/admin/PlayConfigPanel";

// Configuración de Vantax Play que antes vivía en la sección ADMIN del
// mockup arcade original ("vcoin.html"): tasa de V-COIN, umbrales de tramo,
// cofres y sus premios, catálogo de artículos canjeables, y pagos
// pendientes en cripto. admin/players (ya existente) se queda solo para la
// lista de jugadores + regalar cofre a mano; esto es la parte de
// "configurar las reglas del juego".
export default async function AdminPlayConfigPage() {
  const [config, tierGoals, chestsRaw, chestLoot, articles, payoutsPending, payoutsPaid, shopOrders] = await Promise.all([
    getPlayConfig(),
    prisma.playTierGoal.findMany(),
    prisma.playChest.findMany(),
    prisma.playChestLoot.findMany({ include: { article: true } }),
    prisma.playCatalogArticle.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.playPayout.findMany({
      where: { status: "PENDIENTE" },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.playPayout.findMany({
      where: { status: "PAGADO" },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { paidAt: "desc" },
      take: 15,
    }),
    prisma.playShopOrder.findMany({
      where: { status: "PENDIENTE" },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Los 4 tramos siempre en el mismo orden, con valores por defecto si un
  // cofre o meta todavía no se guardó nunca (primera vez que se abre esta
  // pantalla en un entorno nuevo).
  const goalByTier = new Map(tierGoals.map((g) => [g.tier, g]));
  const chestByTier = new Map(chestsRaw.map((c) => [c.tier, c]));

  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    goal: goalByTier.get(tier) ?? { tier, lotsTarget: 0, daysLimit: 0 },
    chest: chestByTier.get(tier) ?? {
      id: null as string | null,
      tier,
      label: `Cofre ${tier}`,
      unlockCondition: "",
      vcoinReward: 0,
      extraReward: "",
      active: true,
    },
    loot: chestLoot.filter((l) => chestByTier.get(tier)?.id === l.chestId),
  }));

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Configuración de Vantax Play</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        Aquí se configuran las reglas del juego: tasa de V-COIN, cuántos lotes hace falta para cada tramo, el premio
        de cada cofre, el catálogo de artículos y los pagos en cripto pendientes. Para la lista de jugadores y
        regalar un cofre a mano, eso sigue en "Jugadores (Play)".
      </p>
      <PlayConfigPanel
        config={config}
        tiers={tiers as any}
        articles={articles.map((a) => ({ id: a.id, name: a.name, category: a.category, price: a.price, imageUrl: a.imageUrl, active: a.active }))}
        payoutsPending={payoutsPending.map((p) => ({
          id: p.id,
          userEmail: p.user.email,
          userName: p.user.name,
          amountVCoin: p.amountVCoin,
          method: p.method,
          network: p.network,
          wallet: p.wallet,
          brokerUid: p.brokerUid,
          requestedAt: p.requestedAt.toISOString(),
          note: p.note,
        }))}
        payoutsPaid={payoutsPaid.map((p) => ({
          id: p.id,
          userEmail: p.user.email,
          userName: p.user.name,
          amountVCoin: p.amountVCoin,
          method: p.method,
          network: p.network,
          wallet: p.wallet,
          brokerUid: p.brokerUid,
          txHash: p.txHash,
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          note: p.note,
        }))}
        shopOrders={shopOrders.map((o) => ({
          id: o.id,
          userEmail: o.user.email,
          userName: o.user.name,
          articleName: o.articleName,
          price: o.price,
          createdAt: o.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

