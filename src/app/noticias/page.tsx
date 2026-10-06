import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGoldNewsHeadlines } from "@/lib/telegram-news";
import { fetchUsdCalendar } from "@/lib/econ-calendar";
import { AppNav } from "@/components/AppNav";
import { NewsCard } from "@/components/market/NewsCard";
import { EconCalendar } from "@/components/market/EconCalendar";

// Noticias y calendario económico (06/10/2026): antes estaban al final del
// Centro de Mercado; Esther pidió sacarlas a su propia página, accesible
// desde un único botón del menú. Mismo acceso que el Centro de Mercado.
export const revalidate = 300;

export default async function NoticiasPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;
  const isAdmin = (session.user as any).role === "ADMIN";

  if (!isAdmin) {
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { marketAccess: true } });
    if (!dbUser?.marketAccess) {
      return (
        <div className="container" style={{ paddingTop: 40, maxWidth: 640 }}>
          <div className="panel locked-panel">
            <span className="locked-icon">🔒</span>
            <div>
              <h1 style={{ fontSize: 20, marginTop: 0 }}>Acceso pendiente</h1>
              <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 16 }}>
                Las noticias y el calendario económico se activan junto con el Centro de Mercado. En cuanto
                activemos tu cuenta podrás verlos aquí.
              </p>
              <div className="btn-row">
                <AppNav isAdmin={isAdmin} active="noticias" />
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  const [news, econ] = await Promise.all([fetchGoldNewsHeadlines(20), fetchUsdCalendar()]);
  const [first, ...rest] = news;

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX
          </div>
          <h1 style={{ fontSize: 30, margin: "4px 0 0" }}>Noticias y calendario</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 6 }}>
            Lo que mueve al oro hoy: titulares del canal Club 11K Gold News y la agenda macro de EE. UU.
          </p>
        </div>
        <div className="btn-row">
          <AppNav isAdmin={isAdmin} active="noticias" />
        </div>
      </div>

      <nav className="mk-nav" aria-label="Secciones">
        <a href="#noticias">Noticias</a>
        <a href="#calendario">Calendario económico</a>
      </nav>

      <section id="noticias" style={{ scrollMarginTop: 20, marginBottom: 32 }}>
        <div className="panel-head" style={{ margin: "4px 0 12px 2px" }}>
          <span className="panel-title">Últimas noticias</span>
          <a href="https://t.me/s/club11k_news" target="_blank" rel="noopener noreferrer" className="panel-sub" style={{ textDecoration: "underline" }}>
            Abrir canal en Telegram ↗
          </a>
        </div>
        {first ? (
          <div className="nw-grid">
            <NewsCard news={first} featured />
            {rest.map((n) => (
              <NewsCard key={n.url} news={n} />
            ))}
          </div>
        ) : (
          <div className="panel" style={{ padding: 20, color: "var(--text-dim)", fontSize: 13.5 }}>
            No se han podido cargar los titulares ahora mismo —{" "}
            <a href="https://t.me/s/club11k_news" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              ábrelo directamente en Telegram
            </a>
            .
          </div>
        )}
      </section>

      <section id="calendario" style={{ scrollMarginTop: 20, marginBottom: 32 }}>
        <div className="panel-title" style={{ margin: "4px 0 12px 2px" }}>Calendario económico (Estados Unidos)</div>
        <EconCalendar events={econ.events} nextWeekAvailable={econ.nextWeekAvailable} />
      </section>
    </div>
  );
}
