import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { ProChartLoader } from "@/components/charts/ProChartLoader";

// CHARTS (28/10/2026): gráfico propio a pantalla completa con los precios del
// MT5 del bróker. Para cualquier usuario registrado; los indicadores los crea
// el admin desde el propio gráfico.
export default async function ChartsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as any).role === "ADMIN";

  return (
    <div className="pc-page">
      <div className="pc-appbar">
        <Link href="/dashboard" className="pc-brand">
          VANTAX <span>Charts</span>
        </Link>
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="charts" />
        </div>
      </div>
      <ProChartLoader isAdmin={isAdmin} />
    </div>
  );
}
