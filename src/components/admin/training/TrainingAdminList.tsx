"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCourse, moveCourse, setCoursePublished } from "@/app/admin/formacion-actions";
import { CourseForm } from "./CourseForm";

type CourseRow = { id: string; title: string; coverUrl: string | null; published: boolean; modules: number };

// Lista de formaciones en admin: crear, publicar/ocultar, ordenar y entrar a
// editar los módulos.
export function TrainingAdminList({ courses }: { courses: CourseRow[] }) {
  const [creating, setCreating] = useState(courses.length === 0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Nueva formación</h3>
          {!creating && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              + Crear formación
            </button>
          )}
        </div>
        {creating && (
          <div style={{ marginTop: 14 }}>
            <CourseForm
              submitLabel="Crear y añadir módulos"
              onCancel={courses.length ? () => setCreating(false) : undefined}
              onSubmit={async (data) => {
                const id = await createCourse(data);
                router.push(`/admin/formacion/${id}`);
              }}
            />
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Formaciones ({courses.length})</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
          Solo las <b>publicadas</b> las ven los usuarios con acceso a Formación (el acceso se da en Usuarios). Las flechas
          cambian el orden en que aparecen.
        </p>
        {courses.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Todavía no hay formaciones.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {courses.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "var(--bg-panel-raised)",
                }}
              >
                <div
                  style={{
                    width: 96,
                    aspectRatio: "16 / 9",
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "linear-gradient(135deg, #4C1D95, #17122A)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    "🎓"
                  )}
                </div>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`tag ${c.published ? "pos" : "neu"}`}>{c.published ? "Publicada" : "Borrador"}</span>
                    {c.modules} {c.modules === 1 ? "módulo" : "módulos"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="btn" title="Subir" disabled={isPending || i === 0} onClick={() => startTransition(() => moveCourse(c.id, -1))}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    title="Bajar"
                    disabled={isPending || i === courses.length - 1}
                    onClick={() => startTransition(() => moveCourse(c.id, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={isPending}
                    style={c.published ? {} : { borderColor: "var(--up)", color: "var(--up)" }}
                    onClick={() => startTransition(() => setCoursePublished(c.id, !c.published))}
                  >
                    {c.published ? "Ocultar" : "Publicar"}
                  </button>
                  <Link href={`/admin/formacion/${c.id}`} className="btn btn-primary">
                    Editar y módulos
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
