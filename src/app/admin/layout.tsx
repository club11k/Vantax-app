import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--gold-bright)", textTransform: "uppercase" }}>
            VANTAX · Admin
          </div>
          <h1 style={{ fontSize: 24, margin: "4px 0 0" }}>Panel de administrador</h1>
        </div>
        <div className="btn-row">
          <AppNav isAdmin active="admin" />
        </div>
      </div>
      <nav className="btn-row" style={{ marginBottom: 24, borderBottom: "1px solid var(--line)", paddingBottom: 14 }}>
        <Link href="/admin" className="btn">Resumen</Link>
        <Link href="/admin/users" className="btn">Usuarios</Link>
        <Link href="/admin/plans" className="btn">Planes</Link>
        <Link href="/admin/settings" className="btn">Configuración</Link>
      </nav>
      {children}
    </div>
  );
}

