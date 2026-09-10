import { prisma } from "@/lib/prisma";
import { PlayersTable } from "@/components/admin/PlayersTable";
import { monthBounds } from "@/lib/play/myfxbook-sync";

export default async function AdminPlayersPage() {
  const { periodStart, periodEnd } = monthBounds(new Date());

  const [accounts, links, stats] = await Promise.all([
    prisma.playMt5Account.findMany({
      include: {
        user: { select: { id: true, email: true, name: true, vCoinBalance: true } },
        broker: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.playMyfxbookLink.findMany(),
    prisma.playTradingStats.findMany({ where: { periodStart, periodEnd } }),
  ]);

  const linkByUserId = new Map(links.map((l) => [l.userId, l]));
  const statsByAccountId = new Map(stats.map((s) => [s.accountId, s]));

  const rows = accounts.map((a) => {
    const link = linkByUserId.get(a.userId) ?? null;
    const stat = statsByAccountId.get(a.id) ?? null;
    return {
      id: a.id,
      userEmail: a.user.email,
      userName: a.user.name,
      vCoinBalance: a.user.vCoinBalance,
      brokerName: a.broker.name,
      accountNumber: a.accountNumber,
      accountType: a.accountType,
      accountTypeVerified: a.accountTypeVerified,
      balance: a.balance,
      equity: a.equity,
      ibActive: a.ibActive,
      myfxbookEmail: link?.email ?? null,
      lastSyncedAt: link?.lastSyncedAt ? link.lastSyncedAt.toISOString() : null,
      lotsThisMonth: stat?.lotsTraded ?? 0,
      profitPctThisMonth: stat?.profitPct ?? 0,
    };
  });

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Jugadores de Vantax Play ({rows.length} cuentas)</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        Activa una cuenta para que empiece a acreditar V-COIN en el próximo sync. Mientras está inactiva se sigue
        actualizando su saldo y lotaje, pero no se le da V-COIN.
      </p>
      <PlayersTable rows={rows} />
    </div>
  );
}

