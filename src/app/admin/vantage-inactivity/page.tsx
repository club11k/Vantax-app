import { prisma } from "@/lib/prisma";
import { WARNING_DAYS } from "@/lib/vantage-block";
import { InactivityWarningTable } from "@/components/admin/InactivityWarningTable";

const INACTIVITY_BLOCK_DAYS = 30;

// Lista, por usuario, quién lleva WARNING_DAYS (15) o más sin operar en
// ninguna de sus cuentas de Vantage TODAVÍA vinculadas al IB — para poder
// avisarle a mano antes de que llegue a los 30 días y se bloquee solo (ver
// src/lib/vantage-block.ts). No incluye a quien ya se desvinculó del IB del
// todo (eso ya se ve, y se bloquea al momento, en /admin/vantage-clients).
export default async function AdminVantageInactivityPage() {
  const accounts = await prisma.vantageIbAccount.findMany({
    include: { user: { select: { id: true, email: true, name: true, vantageInactivityWarnedAt: true } } },
  });

  const now = Date.now();
  const byUser = new Map<
    string,
    {
      userId: string;
      userEmail: string;
      userName: string | null;
      warnedAt: string | null;
      mostRecentTrade: number | null; // epoch ms, entre las cuentas vinculadas
      hasLinkedAccount: boolean;
    }
  >();

  for (const a of accounts) {
    const isLinked = a.manualActiveOverride !== null ? a.manualActiveOverride : a.ibStatus === "LINKED";
    if (!isLinked) continue; // desvinculado del todo -> no es "inactividad", ver /admin/vantage-clients

    const existing = byUser.get(a.userId) ?? {
      userId: a.userId,
      userEmail: a.user.email,
      userName: a.user.name,
      warnedAt: a.user.vantageInactivityWarnedAt ? a.user.vantageInactivityWarnedAt.toISOString() : null,
      mostRecentTrade: null,
      hasLinkedAccount: false,
    };
    existing.hasLinkedAccount = true;
    const t = a.lastTradeTime ? a.lastTradeTime.getTime() : null;
    if (t !== null && (existing.mostRecentTrade === null || t > existing.mostRecentTrade)) {
      existing.mostRecentTrade = t;
    }
    byUser.set(a.userId, existing);
  }

  const rows = Array.from(byUser.values())
    .filter((u) => u.hasLinkedAccount && u.mostRecentTrade !== null)
    .map((u) => {
      const daysInactive = Math.floor((now - u.mostRecentTrade!) / (24 * 60 * 60 * 1000));
      return {
        userId: u.userId,
        userEmail: u.userEmail,
        userName: u.userName,
        daysInactive,
        blocked: daysInactive >= INACTIVITY_BLOCK_DAYS,
        warnedAt: u.warnedAt,
        lastTradeAt: new Date(u.mostRecentTrade!).toISOString(),
      };
    })
    .filter((r) => r.daysInactive >= WARNING_DAYS)
    .sort((a, b) => b.daysInactive - a.daysInactive);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Avisos de inactividad ({rows.length})</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        Gente que sigue vinculada a tu IB pero lleva {WARNING_DAYS} días o más sin operar en ninguna de sus cuentas
        de Vantage. A los {INACTIVITY_BLOCK_DAYS} días se les bloquea solo el acceso a toda la app (Análisis,
        Journaly, Centro de mercado, Riesgo, Play) — este panel es para poder avisarles antes de que llegue ese
        momento. El botón "Avisar" les muestra un mensaje dentro de la app; deja de salir solo en cuanto vuelvan a
        operar, sin que haga falta quitarlo a mano.
      </p>
      <InactivityWarningTable rows={rows} />
    </div>
  );
}

