import { prisma } from "@/lib/prisma";

export default async function AdminOverviewPage() {
  const [totalUsers, activeSubs, plans, analysesToday, analysesTotal] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { subscriptionStatus: "ACTIVE" } }),
    prisma.plan.findMany({ where: { active: true } }),
    prisma.analysis.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.analysis.count(),
  ]);

  const usersByPlan = await prisma.user.groupBy({
    by: ["planId"],
    where: { subscriptionStatus: "ACTIVE" },
    _count: true,
  });

  const planMap = new Map(plans.map((p) => [p.id, p]));
  const mrrCents = usersByPlan.reduce((sum, row) => {
    const plan = row.planId ? planMap.get(row.planId) : null;
    return sum + (plan ? plan.priceCents * row._count : 0);
  }, 0);

  const stats = [
    { label: "Usuarios totales", value: totalUsers },
    { label: "Suscripciones activas", value: activeSubs },
    { label: "MRR estimado", value: `${(mrrCents / 100).toFixed(2)}€` },
    { label: "Análisis generados hoy", value: analysesToday },
    { label: "Análisis generados (total)", value: analysesTotal },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
      {stats.map((s) => (
        <div key={s.label} className="panel">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {s.label}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--gold-bright)", marginTop: 6 }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
