import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GlobeVisual } from "@/components/GlobeVisual";

// El icono es puramente decorativo (rediseño pedido por Esther 06/10/2026)
// — título y descripción de cada tarjeta son exactamente el mismo texto que
// ya había, no se ha cambiado ni añadido ningún contenido.
const FEATURES = [
  {
    icon: "⚡",
    title: "Bias Score en vivo",
    desc: "Un motor cuantitativo que pondera tasas reales, inflación, riesgo intermercado y técnico en un solo número, con cada indicador auditable.",
  },
  {
    icon: "🧠",
    title: "Análisis diario con IA",
    desc: "Cada día generas tu lectura de XAU/USD y DXY, en el formato que prefieras: mensaje directo o detalle técnico completo.",
  },
  {
    icon: "🌍",
    title: "Centro de mercado",
    desc: "Sesiones de Sydney, Tokio, Londres y Nueva York en vivo, calendario económico, gráfico de oro y feed de titulares, todo en un solo lugar.",
  },
  {
    icon: "📡",
    title: "Datos reales, no relato",
    desc: "FRED y Twelve Data alimentan cada número. Cuando un dato no está disponible, el panel lo dice — nunca lo inventa.",
  },
];

// Icono por plan, también decorativo — por posición (0,1,2…), para no
// depender de ningún texto del plan que pueda cambiar desde /admin/plans.
const PLAN_ICONS = ["🥈", "🥇", "💎", "👑"];

export default async function HomePage() {
  const [session, plans] = await Promise.all([
    getServerSession(authOptions),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.14em", color: "var(--gold-bright)", textTransform: "uppercase" }}>
          VANTAX
        </div>
        {session?.user ? (
          <div className="btn-row">
            {(session.user as any).role === "ADMIN" && (
              <Link href="/admin" className="btn">Panel de admin</Link>
            )}
            <Link href="/mercado" className="btn">Centro de mercado</Link>
            <Link href="/dashboard" className="btn btn-primary">Ir a mi panel</Link>
          </div>
        ) : (
          <div className="btn-row">
            <Link href="/login" className="btn">Ingresar</Link>
            <Link href="/signup" className="btn btn-primary">Crear cuenta</Link>
          </div>
        )}
      </div>

      <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 32, alignItems: "center", marginBottom: 60 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.18em", color: "var(--violet)", textTransform: "uppercase", marginBottom: 10 }}>
            Centro global de operaciones
          </div>
          <h1 style={{ fontSize: 42, maxWidth: 620, lineHeight: 1.12, margin: 0 }}>
            Inteligencia de mercado para <span style={{ color: "var(--gold-bright)" }}>XAU/USD</span> y{" "}
            <span style={{ color: "var(--violet-bright)" }}>DXY</span>, todos los días.
          </h1>
          <p style={{ maxWidth: 560, color: "var(--text-muted)", fontSize: 15, lineHeight: 1.6, marginTop: 20 }}>
            VANTAX combina un Bias Score cuantitativo, sesiones de mercado en vivo, calendario económico y un
            motor de análisis con IA en un mismo panel. Tasas reales, inflación, riesgo y técnico, condensados
            en el formato que prefieras. No es asesoramiento financiero: es el marco de lectura, tú tomas la
            decisión.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
            <Link href={session?.user ? "/mercado" : "/signup"} className="btn btn-primary">
              {session?.user ? "Ver centro de mercado" : "Crear cuenta gratis"}
            </Link>
            <a href="#planes" className="btn">Ver planes</a>
          </div>
        </div>
        <div style={{ minHeight: 280 }}>
          <GlobeVisual />
        </div>
      </div>

      <div style={{ marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        Qué puedes hacer en VANTAX
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 60 }}>
        {FEATURES.map((f) => (
          <div key={f.title} className="feature-pretty">
            <div className="f-ico">{f.icon}</div>
            <div className="f-title">{f.title}</div>
            <p className="f-desc">{f.desc}</p>
          </div>
        ))}
      </div>

      <div id="planes" style={{ marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        Planes
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div className="panel plan-pretty" style={{ "--accent": "var(--violet)" } as React.CSSProperties}>
          <div className="plan-pretty-top">
            <div className="f-ico">🎓</div>
            <span className="tag neu" style={{ color: "var(--violet-bright)", background: "var(--violet-dim)", borderColor: "var(--violet)" }}>
              Acceso gratuito
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 12 }}>Club 11k</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", minHeight: 40, marginTop: 10 }}>
            Si formas parte de la comunidad de Club 11k, entra a nuestro curso gratuito de Telegram para
            conseguir tu acceso sin coste.
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-dim)", marginBottom: 16 }}>
            Acceso activado a mano por el equipo
          </p>
          <a
            href="https://t.me/+cj_Ck7EpgyowZDk0"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            Acceso gratuito para miembros del Club 11k
          </a>
        </div>
        {plans.map((plan, i) => (
          <div key={plan.id} className="panel plan-pretty" style={{ "--accent": "var(--gold-bright)" } as React.CSSProperties}>
            <div className="plan-pretty-top">
              <div className="f-ico">{PLAN_ICONS[i % PLAN_ICONS.length]}</div>
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 12 }}>{plan.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: "var(--gold-bright)", margin: "10px 0" }}>
              {(plan.priceCents / 100).toFixed(2)}€<span style={{ fontSize: 13, color: "var(--text-dim)" }}>/mes</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", minHeight: 40 }}>{plan.description}</p>
            <p className="tag neu" style={{ display: "inline-block", marginBottom: 16 }}>
              {plan.monthlyQuota} análisis / mes
            </p>
            <Link href={session?.user ? "/dashboard" : "/signup"} className="btn btn-primary" style={{ display: "block", textAlign: "center" }}>
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


