import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RiskCalculator } from "@/components/riesgo/RiskCalculator";
import { AppNav } from "@/components/AppNav";

// Igual que Journaly: la Calculadora de Riesgo no depende de marketAccess ni
// del plan de suscripción — es una herramienta de cálculo, no consume cuota
// ni guarda nada en base de datos, así que está disponible para cualquier
// usuario con sesión iniciada.
export default async function RiesgoPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const isAdmin = (session.user as any).role === "ADMIN";

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 8 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--violet)",
              textTransform: "uppercase",
            }}
          >
            VANTAX
          </div>
          <h1 style={{ fontSize: 26, margin: "4px 0 0" }}>Calculadora de riesgo</h1>
        </div>
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="riesgo" />
        </div>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 24, maxWidth: 640 }}>
        Calcula el Stop Loss que corresponde a tu lote y a tu riesgo asumido, o el lote que corresponde a un Stop
        Loss ya decidido — y el Take Profit según el ratio riesgo:beneficio que elijas (1:1, 1:2, 1:3...).
      </p>

      <RiskCalculator />
    </div>
  );
}

