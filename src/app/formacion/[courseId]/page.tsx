import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessCourse, formatPrice, getTrainingViewer, toPdfViewUrl, toVideoEmbed } from "@/lib/training";
import { stripe } from "@/lib/stripe";
import { bunnyEmbedUrl } from "@/lib/bunny";
import { fulfillTrainingSession } from "@/lib/training-checkout";
import { BuyCourseButton } from "@/components/training/BuyCourseButton";
import { AppNav } from "@/components/AppNav";
import { CompleteButton } from "@/components/training/CompleteButton";
import { NoSave } from "@/components/training/NoSave";

// Una formación por dentro, al estilo Skool: a la izquierda la lista de
// módulos con su check, a la derecha el módulo abierto (vídeo, PDF y
// descripción) con el botón de marcar como completado. Sin acceso, se ve una
// vista previa (descripción y lista de módulos) con el botón de comprar.
export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: { courseId: string };
  searchParams: { m?: string; session_id?: string; cancelado?: string };
}) {
  const viewer = await getTrainingViewer();
  if (!viewer) redirect("/login");

  const course = await prisma.trainingCourse.findUnique({
    where: { id: params.courseId },
    include: {
      sections: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          lessons: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: { pdfFile: { select: { id: true, filename: true } } },
          },
        },
      },
    },
  });
  if (!course || (!course.published && !viewer.isAdmin)) notFound();

  // Formación → módulos (sections) → capítulos (lessons). Para avanzar y
  // calcular el progreso se usan todos los capítulos en orden.
  const sections = course.sections;
  const lessons = sections.flatMap((sec, si) => sec.lessons.map((l) => ({ ...l, sectionIndex: si, sectionTitle: sec.title })));

  // Vuelta de Stripe tras pagar: se confirma el pago aquí mismo para abrir el
  // acceso al momento (el webhook hace lo mismo por si se cierra la pestaña).
  let justPaid = false;
  let paymentPending = false;
  if (searchParams.session_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const cs = await stripe.checkout.sessions.retrieve(searchParams.session_id);
      if (cs.metadata?.userId === viewer.userId && cs.metadata?.courseId === course.id) {
        justPaid = await fulfillTrainingSession(cs);
        paymentPending = !justPaid && cs.status === "complete";
      }
    } catch (err) {
      console.error("No se pudo comprobar el pago de Stripe:", err);
    }
  }

  const access = await canAccessCourse(viewer, course);
  if (!access) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="header-row" style={{ marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <Link href="/formacion" className="fm-back">
              ← Todas las formaciones
            </Link>
          </div>
          <div className="btn-row">
            <AppNav isAdmin={viewer.isAdmin} active="formacion" />
          </div>
        </div>

        {searchParams.cancelado && <div className="fm-notice">Has cancelado el pago. Puedes comprarla cuando quieras.</div>}
        {paymentPending && (
          <div className="fm-notice">Tu pago se está procesando. En cuanto Stripe lo confirme se abrirá el acceso; recarga en unos minutos.</div>
        )}

        <div className="fm-sales">
          <div className="fm-sales-cover">
            {course.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.coverUrl} alt="" />
            ) : (
              <span className="fm-cover-fallback" aria-hidden="true">
                🎓
              </span>
            )}
          </div>
          <div className="fm-sales-body panel">
            <h1 style={{ fontSize: 26, margin: 0 }}>{course.title}</h1>
            {course.description && <p className="fm-sales-desc">{course.description}</p>}
            <div className="fm-sales-meta">
              {sections.length} {sections.length === 1 ? "módulo" : "módulos"} · {lessons.length}{" "}
              {lessons.length === 1 ? "capítulo" : "capítulos"} · acceso para siempre
            </div>
            {course.priceCents && course.priceCents >= 50 ? (
              <div className="fm-sales-buy">
                <span className="fm-price fm-price-lg">{formatPrice(course.priceCents)}</span>
                <BuyCourseButton courseId={course.id} disabled={viewer.suspended} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Pago único y seguro con Stripe. Recibirás la factura por email.</span>
              </div>
            ) : (
              <div className="fm-notice" style={{ margin: "14px 0 0" }}>
                🔒 Esta formación se abre bajo petición. Habla con el equipo para que te den acceso.
              </div>
            )}
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Contenido de la formación</h3>
          <div className="fm-mods">
            {sections.map((sec, si) => (
              <div key={sec.id} className="fm-sec">
                <div className="fm-sec-head static">
                  <span className="fm-sec-num">Módulo {si + 1}</span>
                  <span className="fm-sec-title">{sec.title}</span>
                  <span className="fm-sec-count">
                    {sec.lessons.length} {sec.lessons.length === 1 ? "capítulo" : "capítulos"}
                  </span>
                </div>
                {sec.lessons.map((m, i) => (
                  <div key={m.id} className="fm-mod fm-mod-locked">
                    <span className="fm-check" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="fm-mod-title">{m.title}</span>
                    <span className="fm-mod-type" aria-hidden="true">
                      {m.videoUrl || m.bunnyVideoId ? "▶" : ""}
                      {m.pdfFile || m.pdfUrl ? "📄" : ""} 🔒
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {sections.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Pronto se añadirán los módulos.</p>}
          </div>
        </div>
      </div>
    );
  }

  const progress = await prisma.trainingProgress.findMany({
    where: { userId: viewer.userId, moduleId: { in: lessons.map((m) => m.id) } },
    select: { moduleId: true },
  });
  const doneSet = new Set(progress.map((p) => p.moduleId));
  const total = lessons.length;
  const completed = lessons.filter((m) => doneSet.has(m.id)).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  // Módulo abierto: el de la URL o, si no hay, el primero sin completar.
  const current =
    lessons.find((m) => m.id === searchParams.m) ??
    lessons.find((m) => !doneSet.has(m.id)) ??
    lessons[0] ??
    null;
  const idx = current ? lessons.findIndex((m) => m.id === current.id) : -1;
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx >= 0 && idx < total - 1 ? lessons[idx + 1] : null;

  // Vídeo subido a Bunny (enlace firmado que caduca) o, si no, el enlace externo.
  const bunnySrc = current?.bunnyVideoId ? bunnyEmbedUrl(current.bunnyVideoId) : null;
  const video = bunnySrc ? ({ kind: "iframe", src: bunnySrc } as const) : current ? toVideoEmbed(current.videoUrl) : null;
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

      {justPaid && <div className="fm-notice fm-notice-ok">🎉 ¡Pago completado! Ya tienes acceso a esta formación para siempre.</div>}

      <div className="fm-layout">
        <aside className="fm-side panel">
          <div className="fm-side-head">
            <span className="fm-side-pct">{pct}%</span>
            <div className="fm-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="fm-side-count">
              {completed} de {total} capítulos completados
            </span>
          </div>
          <nav className="fm-mods" aria-label="Módulos y capítulos">
            {sections.map((sec, si) => {
              const secDone = sec.lessons.filter((l) => doneSet.has(l.id)).length;
              const isCurrent = current?.sectionIndex === si;
              return (
                <details key={sec.id} className="fm-sec" open={isCurrent || sections.length <= 3}>
                  <summary className="fm-sec-head">
                    <span className="fm-sec-num">Módulo {si + 1}</span>
                    <span className="fm-sec-title">{sec.title}</span>
                    <span className={`fm-sec-count${sec.lessons.length > 0 && secDone === sec.lessons.length ? " done" : ""}`}>
                      {secDone}/{sec.lessons.length}
                    </span>
                  </summary>
                  {sec.lessons.map((m, i) => (
                    <Link key={m.id} href={href(m.id)} className={`fm-mod${current?.id === m.id ? " active" : ""}`}>
                      <span className={`fm-check${doneSet.has(m.id) ? " done" : ""}`} aria-hidden="true">
                        {doneSet.has(m.id) ? "✓" : i + 1}
                      </span>
                      <span className="fm-mod-title">{m.title}</span>
                      <span className="fm-mod-type" aria-hidden="true">
                        {m.videoUrl || m.bunnyVideoId ? "▶" : ""}
                        {m.pdfFile || m.pdfUrl ? "📄" : ""}
                      </span>
                    </Link>
                  ))}
                  {sec.lessons.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 12.5, padding: "4px 10px 8px" }}>Próximamente.</p>}
                </details>
              );
            })}
            {sections.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 13, padding: "8px 10px" }}>Esta formación aún no tiene módulos.</p>}
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
                      Módulo {current.sectionIndex + 1} · {current.sectionTitle} · Capítulo {idx + 1} de {total}
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
              Esta formación todavía no tiene capítulos.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
