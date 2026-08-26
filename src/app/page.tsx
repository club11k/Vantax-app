import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const [session, plans] = await Promise.all([
    getServerSession(authOptions),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="container" style={{ paddingTop: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 60 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.14em", color: "var(--gold-bright)", textTransform: "uppercase" }}>
          VANTAX
        </div>
        {session?.user ? (
          <Link href="/dashboard" className="btn btn-primary">Ir a mi panel</Link>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/login" className="btn">Ingresar</Link>
            <Link href="/signup" className="btn btn-primary">Crear cuenta</Link>
          </div>
        )}
      </div>

      <h1 style={{ fontSize: 42, maxWidth: 700, lineHeight: 1.15 }}>
        Análisis diarios de <span style={{ color: "var(--gold-bright)" }}>XAU/USD</span> y{" "}
        <span style={{ color: "var(--violet-bright)" }}>DXY</span>, generados con IA sobre datos macro reales.
      </h1>
      <p style={{ maxWidth: 560, color: "var(--text-muted)", fontSize: 15, lineHeight: 1.6 }}>
        Tasas reales, inflación, posicionamiento institucional y riesgo, condensados todos los días en el
        formato que prefieras: un mensaje directo, o el detalle técnico completo. No es asesoramiento
        financiero: es el marco de lectura, vos tomás la decisión.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 48 }}>
        {plans.map((plan) => (
          <div key={plan.id} className="panel">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{plan.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: "var(--gold-bright)", margin: "10px 0" }}>
              {(plan.priceCents / 100).toFixed(2)}€<span style={{ fontSize: 13, color: "var(--text-dim)" }}>/mes</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", minHeight: 40 }}>{plan.description}</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-dim)", marginBottom: 16 }}>
              {plan.monthlyQuota} análisis / mes
            </p>
            <Link href={session?.user ? "/dashboard" : "/signup"} className="btn btn-primary">
              Empezar
            </Link>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="panel" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            Todavía no hay planes activos. Configuralos desde /admin/plans.
          </div>
        )}
      </div>

      <p style={{ marginTop: 60, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
        VANTAX no es un asesor financiero licenciado. Los análisis son informativos y no constituyen
        recomendación de inversión.
      </p>
    </div>
  );
}
