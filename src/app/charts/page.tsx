import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { ChartsTabs } from "@/components/charts/ChartsTabs";

// CHARTS (28/10/2026): gráfico propio con precios del MT5 del bróker (y
// TradingView como pestaña alternativa), para cualquier usuario registrado.
export default async function ChartsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as any).role === "ADMIN";

  return (
    <div className="container ch-page" style={{ paddingTop: 28 }}>
      <div className="header-row" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX
          </div>
          <h1 style={{ fontSize: 28, margin: "4px 0 0" }}>Charts</h1>
        </div>
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="charts" />
        </div>
      </div>
      <ChartsTabs />
    </div>
  );
}
