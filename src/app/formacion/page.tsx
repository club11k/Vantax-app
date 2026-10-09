import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTrainingViewer } from "@/lib/training";
import { AppNav } from "@/components/AppNav";

// Formación (09/10/2026): formaciones por módulos al estilo Skool. Cerrada
// por defecto; un admin abre el acceso a cada usuario desde /admin/users.
export const dynamic = "force-dynamic";

export default async function FormacionPage() {
  const viewer = await getTrainingViewer();
  if (!viewer) redirect("/login");

  if (!viewer.allowed) {
    return (
      <div className="container" style={{ paddingTop: 40, maxWidth: 640 }}>
        <div className="panel locked-panel">
          <span className="locked-icon">🔒</span>
          <div>
            <h1 style={{ fontSize: 20, marginTop: 0 }}>Formación bloqueada</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 16 }}>
              Todavía no tienes acceso a las formaciones. En cuanto el equipo lo active en tu cuenta, podrás verlas aquí.
            </p>
            <div className="btn-row">
              <AppNav isAdmin={viewer.isAdmin} active="formacion" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const courses = await prisma.trainingCourse.findMany({
    where: viewer.isAdmin ? {} : { published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { modules: { select: { id: true } } },
  });
  const done = await prisma.trainingProgress.findMany({
    where: { userId: viewer.userId },
    select: { moduleId: true },
  });
  const doneSet = new Set(done.map((d) => d.moduleId));

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
            VANTAX
          </div>
          <h1 style={{ fontSize: 30, margin: "4px 0 0" }}>Formación</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 6 }}>
            Elige una formación y avanza módulo a módulo. Tu progreso se guarda solo.
          </p>
        </div>
        <div className="btn-row">
          <AppNav isAdmin={viewer.isAdmin} active="formacion" />
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="panel" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎓</div>
          Todavía no hay formaciones publicadas. ¡Vuelve pronto!
          {viewer.isAdmin && (
            <div style={{ marginTop: 12 }}>
              <Link href="/admin/formacion" className="btn btn-primary">
                Crear la primera formación
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="fm-grid">
          {courses.map((c) => {
            const total = c.modules.length;
            const completed = c.modules.filter((m) => doneSet.has(m.id)).length;
            const pct = total ? Math.round((completed / total) * 100) : 0;
            return (
              <Link key={c.id} href={`/formacion/${c.id}`} className="fm-card">
                <div className="fm-cover">
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="fm-cover-fallback" aria-hidden="true">
                      🎓
                    </span>
                  )}
                  {!c.published && <span className="fm-draft">Borrador (solo admin)</span>}
                </div>
                <div className="fm-card-body">
                  <span className="fm-card-title">{c.title}</span>
                  {c.description && <span className="fm-card-desc">{c.description}</span>}
                  <div className="fm-card-foot">
                    <div className="fm-bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="fm-pct">
                      {pct}% · {total} {total === 1 ? "módulo" : "módulos"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
