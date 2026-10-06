import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PlayPanel } from "@/components/play/PlayPanel";
import { AppNav } from "@/components/AppNav";

// Vantax Play (fase 1: base de datos + registro de jugador). Disponible
// para cualquier usuario con sesión iniciada, igual que Journaly y V-COIN.
// Las pantallas de cofres, ranking, tienda y torneos llegan en fases
// posteriores — esto es solo el registro funcional.
export default async function PlayPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const isAdmin = (session.user as any).role === "ADMIN";

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          {/* Avatar pixel art de Vantax (rediseño 06/10/2026) */}
          <img
            src="/vantax-avatar.jpg"
            alt="Vantax"
            width={88}
            height={88}
            style={{ width: 88, height: 88, borderRadius: 12, border: "3px solid #A78BFA", boxShadow: "0 0 24px rgba(167,139,250,0.45), 5px 5px 0 #07050C", objectFit: "cover", flexShrink: 0 }}
          />
          <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX
          </div>
          <h1 style={{ fontSize: 30, margin: "4px 0 0", textShadow: "3px 3px 0 #5B3FA8" }}>Vantax Play</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 6 }}>
            Cashback en V-COIN por el lotaje que operas en cualquier broker. Regístrate como jugador y vincula tu
            cuenta para empezar a ganar.
          </p>
          </div>
        </div>
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="play" />
        </div>
      </div>

      <PlayPanel />
    </div>
  );
}

