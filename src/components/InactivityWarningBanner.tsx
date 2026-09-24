import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getVantageWarningStatus } from "@/lib/vantage-block";

// Aviso que ve el propio usuario (arriba de cualquier página logueada, ver
// src/app/layout.tsx) cuando un admin le ha avisado a mano de que lleva 15+
// días sin operar (ver /admin/vantage-inactivity). Deja de salir solo en
// cuanto vuelve a operar — no hace falta que nadie lo cierre.
export async function InactivityWarningBanner() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const userId = (session.user as any).id as string;
  const status = await getVantageWarningStatus(userId);
  if (!status.showBanner) return null;

  return (
    <div
      style={{
        background: "rgba(230, 168, 46, 0.12)",
        borderBottom: "1px solid var(--gold-bright)",
        color: "var(--text-primary)",
        fontSize: 13.5,
        padding: "10px 20px",
        textAlign: "center",
      }}
    >
      Tu cuenta lleva {status.daysSinceLastTrade} días sin operar. Si sigues sin operar hasta llegar a 30 días, se
      bloquearán todas las herramientas (Análisis, Journaly, Centro de mercado, Riesgo y Play) hasta que vuelvas a
      operar.
    </div>
  );
}

