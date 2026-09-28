import { prisma } from "@/lib/prisma";
import { TIER_LABEL } from "@/components/play/tierStyles";

// "Inventario" de Vantax Play: qué cofre le ha tocado a cada jugador y qué
// premio se llevó exactamente — tanto los que gana él solo (barra de
// Progreso del Trader) como los que le regala un admin a mano. Antes esto
// no quedaba guardado en ningún sitio: el artículo ganado se calculaba al
// vuelo en /api/play/chests/open y se perdía en cuanto se cerraba la
// pantalla de apertura. Ahora se guarda en PlayUserChest.vcoinAwarded /
// wonArticleId (y PlayPlayerGift.deliveredAt) en el momento de abrir.
export default async function AdminPlayInventoryPage() {
  const [openedChests, deliveredGifts] = await Promise.all([
    prisma.playUserChest.findMany({
      where: { openedAt: { not: null } },
      include: {
        user: { select: { email: true, name: true } },
        chest: { select: { tier: true, label: true } },
        wonArticle: { select: { name: true } },
      },
      orderBy: { openedAt: "desc" },
      take: 300,
    }),
    prisma.playPlayerGift.findMany({
      where: { delivered: true },
      include: {
        user: { select: { email: true, name: true } },
        article: { select: { name: true } },
      },
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
  ]);

  type Row = {
    id: string;
    date: Date | null;
    userEmail: string;
    userName: string | null;
    tierLabel: string;
    chestLabel: string;
    origin: "Propio" | "Regalo admin";
    vcoin: number;
    articleName: string | null;
  };

  const rows: Row[] = [
    ...openedChests.map((c): Row => ({
      id: `chest_${c.id}`,
      date: c.openedAt,
      userEmail: c.user.email,
      userName: c.user.name,
      tierLabel: TIER_LABEL[c.chest.tier],
      chestLabel: c.chest.label,
      origin: "Propio",
      vcoin: c.vcoinAwarded ?? 0,
      articleName: c.wonArticle?.name ?? null,
    })),
    ...deliveredGifts.map((g): Row => ({
      id: `gift_${g.id}`,
      date: g.deliveredAt ?? g.createdAt,
      userEmail: g.user.email,
      userName: g.user.name,
      tierLabel: TIER_LABEL[g.tier],
      chestLabel: `Regalo ${TIER_LABEL[g.tier]}`,
      origin: "Regalo admin",
      vcoin: g.rewardType === "VCOIN" ? Math.round(g.amount ?? 0) : 0,
      articleName: g.article?.name ?? null,
    })),
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  const totalVCoin = rows.reduce((sum, r) => sum + r.vcoin, 0);
  const totalArticles = rows.filter((r) => r.articleName).length;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Inventario de cofres</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        Qué le ha tocado a cada jugador al abrir un cofre — tanto los que gana solo con la barra de Progreso del
        Trader como los que le regalas a mano desde "Jugadores (Play)". Los {rows.length} más recientes.
      </p>

      <div className="btn-row" style={{ marginBottom: 16, gap: 18, flexWrap: "wrap" }}>
        <span className="tag neu">{rows.length} cofres abiertos</span>
        <span className="tag neu">{totalVCoin.toLocaleString("es-ES")} V-COIN repartido</span>
        <span className="tag neu">{totalArticles} premios extra entregados</span>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Todavía no se ha abierto ningún cofre.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Jugador</th>
                <th>Cofre</th>
                <th>Origen</th>
                <th>V-COIN</th>
                <th>Premio extra</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.date
                      ? new Date(r.date).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td>
                    {r.userName ? `${r.userName} · ` : ""}
                    {r.userEmail}
                  </td>
                  <td>
                    {r.chestLabel} <span className="tag neu">{r.tierLabel}</span>
                  </td>
                  <td>
                    <span className={`tag ${r.origin === "Propio" ? "pos" : "neu"}`}>{r.origin}</span>
                  </td>
                  <td>{r.vcoin > 0 ? `+${r.vcoin}` : "—"}</td>
                  <td>{r.articleName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
