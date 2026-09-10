import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VCoinPanel } from "@/components/vcoin/VCoinPanel";
import { AppNav } from "@/components/AppNav";

// Disponible para cualquier usuario con sesión iniciada, igual que Journaly
// — no depende del acceso a Análisis ni al Centro de Mercado.
export default async function VCoinPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const isAdmin = (session.user as any).role === "ADMIN";

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX
          </div>
          <h1 style={{ fontSize: 26, margin: "4px 0 0" }}>V-COIN</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 6 }}>
            Cashback por operar en tu cuenta de Vantage: vincula tu cuenta y gana V-COIN según la comisión que generes.
          </p>
        </div>
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="vcoin" />
        </div>
      </div>

      <VCoinPanel />
    </div>
  );
}

