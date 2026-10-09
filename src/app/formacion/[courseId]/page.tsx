import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTrainingViewer, toPdfViewUrl, toVideoEmbed } from "@/lib/training";
import { AppNav } from "@/components/AppNav";
import { CompleteButton } from "@/components/training/CompleteButton";
import { NoSave } from "@/components/training/NoSave";

// Una formación por dentro, al estilo Skool: a la izquierda la lista de
// módulos con su check, a la derecha el módulo abierto (vídeo, PDF y
// descripción) con el botón de marcar como completado.
export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: { courseId: string };
  searchParams: { m?: string };
}) {
  const viewer = await getTrainingViewer();
  if (!viewer) redirect("/login");
  if (!viewer.allowed) redirect("/formacion");

  const course = await prisma.trainingCourse.findUnique({
    where: { id: params.courseId },
    include: {
      modules: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { pdfFile: { select: { id: true, filename: true } } },
      },
    },
  });
  if (!course || (!course.published && !viewer.isAdmin)) notFound();

  const progress = await prisma.trainingProgress.findMany({
    where: { userId: viewer.userId, moduleId: { in: course.modules.map((m) => m.id) } },
    select: { moduleId: true },
  });
  const doneSet = new Set(progress.map((p) => p.moduleId));
  const total = course.modules.length;
  const completed = course.modules.filter((m) => doneSet.has(m.id)).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  // Módulo abierto: el de la URL o, si no hay, el primero sin completar.
  const current =
    course.modules.find((m) => m.id === searchParams.m) ??
    course.modules.find((m) => !doneSet.has(m.id)) ??
    course.modules[0] ??
    null;
  const idx = current ? course.modules.findIndex((m) => m.id === current.id) : -1;
  const prev = idx > 0 ? course.modules[idx - 1] : null;
  const next = idx >= 0 && idx < total - 1 ? course.modules[idx + 1] : null;

  const video = current ? toVideoEmbed(current.videoUrl) : null;
  // Sin descarga: el visor del PDF se abre sin barra de herramientas (sin
  // botón de descargar ni imprimir) para que no se pueda revender el material.
  const pdfBase = current?.pdfFile ? `/api/formacion/file/${current.pdfFile.id}` : toPdfViewUrl(current?.pdfUrl);
  const pdfView = pdfBase ? (current?.pdfFile ? `${pdfBase}#toolbar=0&navpanes=0` : pdfBase) : null;
  const href = (id: string) => `/formacion/${course.id}?m=${id}`;

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/formacion" className="fm-back">
            ← Todas las formaciones
          </Link>
          <h1 style={{ fontSize: 26, margin: "6px 0 0" }}>{course.title}</h1>
          {!course.published && <span className="tag neu" style={{ marginTop: 6, display: "inline-block" }}>Borrador (solo admin)</span>}
        </div>
        <div className="btn-row">
          <AppNav isAdmin={viewer.isAdmin} active="formacion" />
        </div>
      </div>

      <div className="fm-layout">
        <aside className="fm-side panel">
          <div className="fm-side-head">
            <span className="fm-side-pct">{pct}%</span>
            <div className="fm-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="fm-side-count">
              {completed} de {total} completados
            </span>
          </div>
          <nav className="fm-mods" aria-label="Módulos">
            {course.modules.map((m, i) => (
              <Link key={m.id} href={href(m.id)} className={`fm-mod${current?.id === m.id ? " active" : ""}`}>
                <span className={`fm-check${doneSet.has(m.id) ? " done" : ""}`} aria-hidden="true">
                  {doneSet.has(m.id) ? "✓" : i + 1}
                </span>
                <span className="fm-mod-title">{m.title}</span>
                <span className="fm-mod-type" aria-hidden="true">
                  {m.videoUrl ? "▶" : ""}
                  {m.pdfFile || m.pdfUrl ? "📄" : ""}
                </span>
              </Link>
            ))}
            {total === 0 && <p style={{ color: "var(--text-dim)", fontSize: 13, padding: "8px 10px" }}>Esta formación aún no tiene módulos.</p>}
          </nav>
          {course.description && <p className="fm-side-desc">{course.description}</p>}
        </aside>

        <section className="fm-main">
          {current ? (
            <>
              <div className="panel fm-lesson">
                <div className="fm-lesson-head">
                  <div style={{ minWidth: 0 }}>
                    <span className="fm-lesson-kicker">
                      Módulo {idx + 1} de {total}
                    </span>
                    <h2 className="fm-lesson-title">{current.title}</h2>
                  </div>
                  <CompleteButton key={current.id} moduleId={current.id} initialDone={doneSet.has(current.id)} nextHref={next ? href(next.id) : null} />
                </div>

                {video &&
                  (video.kind === "video" ? (
                    <NoSave className="fm-video">
                      <video src={video.src} controls controlsList="nodownload" disablePictureInPicture playsInline />
                    </NoSave>
                  ) : (
                    <div className="fm-video">
                      <iframe
                        src={video.src}
                        title={current.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        loading="lazy"
                      />
                    </div>
                  ))}

                {current.description && <div className="fm-lesson-desc">{current.description}</div>}

                {pdfView && (
                  <div className="fm-pdf">
                    <div className="fm-pdf-bar">
                      <span>📄 {current.pdfFile?.filename ?? "Documento PDF"}</span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a href={pdfView} target="_blank" rel="noopener noreferrer" className="btn">
                          Abrir
                        </a>
                      </div>
                    </div>
                    <NoSave>
                      <iframe src={pdfView} title={`PDF: ${current.title}`} className="fm-pdf-frame" loading="lazy" />
                    </NoSave>
                  </div>
                )}

                {!video && !pdfView && !current.description && (
                  <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Este módulo todavía no tiene contenido.</p>
                )}
              </div>

              <div className="fm-nav">
                {prev ? (
                  <Link href={href(prev.id)} className="btn">
                    ← {prev.title}
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link href={href(next.id)} className="btn btn-primary">
                    {next.title} →
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="panel" style={{ padding: 24, color: "var(--text-muted)" }}>
              Esta formación todavía no tiene módulos.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
