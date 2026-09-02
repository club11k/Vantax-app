import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRemainingQuota } from "@/lib/quota";
import { SubscribeButton, ManageSubscriptionButton } from "@/components/SubscribeButton";
import { AnalysisGenerator } from "@/components/AnalysisGenerator";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const userId = (session.user as any).id as string;

  const [user, quota, plans, analyses, accessGateSetting] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { plan: true } }),
    getRemainingQuota(userId),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.analysis.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.setting.findUnique({ where: { key: "access.public_signup_locked" } }),
  ]);

  const hasActivePlan = user?.subscriptionStatus === "ACTIVE" && user.plan;

  // Mientras el acceso se gestiona a mano (ver /admin/settings), a los
  // usuarios sin plan no se les ofrece pagar — se les dice que su cuenta ya
  // existe y que el equipo activará su acceso. Por defecto (ajuste nunca
  // tocado) el candado está puesto.
  const accessGateValue = accessGateSetting?.value as any;
  const publicSignupLocked =
    !(accessGateValue && typeof accessGateValue === "object" && "value" in accessGateValue && accessGateValue.value === "false");

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX
          </div>
          <h1 style={{ fontSize: 26, margin: "4px 0 0" }}>Hola, {user?.name || user?.email}</h1>
        </div>
        <div className="btn-row">
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="btn">Panel de admin</Link>
          )}
          <Link href="/mercado" className="btn">Centro de mercado</Link>
          {hasActivePlan && <ManageSubscriptionButton />}
        </div>
      </div>

      {!hasActivePlan && publicSignupLocked && (
        <div className="panel locked-panel" style={{ marginBottom: 24 }}>
          <span className="locked-icon">🔒</span>
          <div>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Tu cuenta está creada — el acceso lo activamos nosotros</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 0 }}>
              {user?.marketAccess
                ? "Ya tienes abierto el Centro de Mercado. El generador de análisis todavía está pendiente de que lo activemos por nuestra parte, sin necesidad de que pagues nada."
                : "Por ahora estamos dando acceso a la comunidad de forma manual, sin necesidad de pagar nada. Ni el Centro de Mercado ni el generador de análisis están disponibles todavía — en cuanto activemos tu cuenta desde nuestro lado los verás aquí mismo."}{" "}
              Más adelante abriremos las suscripciones de pago para quien quiera más cuota.
            </p>
          </div>
        </div>
      )}

      {!hasActivePlan && !publicSignupLocked && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Elige un plan para empezar</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            {user?.subscriptionStatus === "CANCELED"
              ? "Tu suscripción anterior está cancelada. Elige un plan para volver a generar análisis."
              : "Necesitas una suscripción activa para generar análisis diarios."}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 16 }}>
            {plans.map((plan) => (
              <div key={plan.id} className="panel" style={{ background: "var(--bg-panel-raised)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{plan.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--gold-bright)", margin: "8px 0" }}>
                  {(plan.priceCents / 100).toFixed(2)}€<span style={{ fontSize: 12, color: "var(--text-dim)" }}>/mes</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{plan.description}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
                  {plan.monthlyQuota} análisis / mes
                </p>
                <SubscribeButton planId={plan.id} />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasActivePlan && (
        <>
          <div className="panel" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
                Plan actual
              </div>
              <div style={{ fontSize: 18 }}>{user?.plan?.name}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
                Análisis disponibles este mes
              </div>
              <div style={{ fontSize: 18, fontFamily: "var(--font-mono)" }}>
                {quota.remaining} / {quota.quota}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Nuevo análisis
          </div>
          <AnalysisGenerator remaining={quota.remaining} isAdmin={user?.role === "ADMIN"} />
        </>
      )}

      <div style={{ marginTop: 32, marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        Historial
      </div>
      <div className="panel">
        {analyses.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Todavía no generaste ningún análisis.</p>}
        {analyses.map((a) => (
          <div key={a.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <span className="tag neu">{a.format === "MENSAJE" ? "Mensaje" : "Técnico"}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                {new Date(a.createdAt).toLocaleString("es-ES")}
              </span>
            </div>
            <div className="pre-wrap-safe" style={{ fontSize: 13, color: "var(--text-muted)" }}>{a.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

