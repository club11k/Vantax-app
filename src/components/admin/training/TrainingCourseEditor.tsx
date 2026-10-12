"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createModule,
  createSection,
  deleteCourse,
  deleteModule,
  deleteSection,
  moveModule,
  moveSection,
  setCoursePublished,
  updateCourse,
  updateModule,
  updateSection,
} from "@/app/admin/formacion-actions";
import { CourseForm } from "./CourseForm";
import { ModuleForm, type ModuleInitial } from "./ModuleForm";
import { CourseBuyers } from "./CourseBuyers";

type Course = { id: string; title: string; description: string | null; coverUrl: string | null; published: boolean; priceCents: number | null };
type Buyer = { id: string; email: string; name: string | null; source: string; amount: string | null; date: string };
type ModuleRow = ModuleInitial & { id: string };
type SectionRow = { id: string; title: string; description: string; lessons: ModuleRow[] };

function ModuleItem({ mod, index, count }: { mod: ModuleRow; index: number; count: number }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <div style={{ padding: 14, border: "1px solid var(--violet)", borderRadius: 12, background: "var(--bg-panel-raised)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Editando capítulo {index + 1}</div>
        <ModuleForm
          initial={mod}
          submitLabel="Guardar capítulo"
          onCancel={() => setEditing(false)}
          onSubmit={async (data) => {
            await updateModule(mod.id, data);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 12px",
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--bg-panel-raised)",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "1px solid var(--line-bright)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{mod.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>{mod.bunnyVideoId ? "▶ Vídeo subido" : mod.videoUrl ? "▶ Vídeo (enlace)" : "Sin vídeo"}</span>
          <span>{mod.pdfFileId ? `📄 ${mod.pdfFileName ?? "PDF"}` : mod.pdfUrl ? "📄 PDF (enlace)" : "Sin PDF"}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="btn" title="Subir" disabled={isPending || index === 0} onClick={() => startTransition(() => moveModule(mod.id, -1))}>
          ↑
        </button>
        <button type="button" className="btn" title="Bajar" disabled={isPending || index === count - 1} onClick={() => startTransition(() => moveModule(mod.id, 1))}>
          ↓
        </button>
        <button type="button" className="btn" disabled={isPending} onClick={() => setEditing(true)}>
          Editar
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={isPending}
          onClick={() => {
            if (confirm(`¿Borrar el capítulo «${mod.title}»? Se perderá también el progreso de los alumnos en él.`)) {
              startTransition(() => deleteModule(mod.id));
            }
          }}
        >
          Borrar
        </button>
      </div>
    </div>
  );
}

function SectionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess = false,
}: {
  initial?: { title: string; description: string };
  submitLabel: string;
  onSubmit: (data: { title: string; description: string }) => Promise<unknown>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Pon un título al módulo.");
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit({ title, description });
        if (resetOnSuccess) {
          setTitle("");
          setDescription("");
        }
      } catch (ex: any) {
        setError(ex?.message ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Título del módulo
        <input type="text" value={title} maxLength={160} placeholder="Ej: Módulo 1 · Fundamentos" onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Descripción (opcional)
        <textarea value={description} rows={2} maxLength={4000} placeholder="Qué se ve en este módulo" onChange={(e) => setDescription(e.target.value)} disabled={isPending} />
      </label>
      {error && <div style={{ color: "var(--down)", fontSize: 13 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Guardando…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" disabled={isPending} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function SectionCard({ section, index, count }: { section: SectionRow; index: number; count: number }) {
  const [editing, setEditing] = useState(false);
  const [addingLesson, setAddingLesson] = useState(section.lessons.length === 0);
  const [isPending, startTransition] = useTransition();

  return (
    <div style={{ border: "1px solid var(--line-bright)", borderRadius: 14, padding: 14, background: "var(--bg-panel)" }}>
      {editing ? (
        <SectionForm
          initial={{ title: section.title, description: section.description }}
          submitLabel="Guardar módulo"
          onCancel={() => setEditing(false)}
          onSubmit={async (data) => {
            await updateSection(section.id, data);
            setEditing(false);
          }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".1em", color: "var(--violet)", textTransform: "uppercase" }}>
              Módulo {index + 1}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{section.title}</div>
            {section.description && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, whiteSpace: "pre-line" }}>{section.description}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn" title="Subir módulo" disabled={isPending || index === 0} onClick={() => startTransition(() => moveSection(section.id, -1))}>
              ↑
            </button>
            <button type="button" className="btn" title="Bajar módulo" disabled={isPending || index === count - 1} onClick={() => startTransition(() => moveSection(section.id, 1))}>
              ↓
            </button>
            <button type="button" className="btn" disabled={isPending} onClick={() => setEditing(true)}>
              Editar módulo
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={isPending}
              onClick={() => {
                if (confirm(`¿Borrar el módulo «${section.title}» y sus ${section.lessons.length} capítulos (con sus vídeos y PDF)? No se puede deshacer.`)) {
                  startTransition(() => deleteSection(section.id));
                }
              }}
            >
              Borrar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, paddingLeft: 10, borderLeft: "2px solid var(--line)" }}>
        {section.lessons.map((m, i) => (
          <ModuleItem key={m.id} mod={m} index={i} count={section.lessons.length} />
        ))}
        {addingLesson ? (
          <div style={{ padding: 14, border: "1px dashed var(--line-bright)", borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nuevo capítulo en «{section.title}»</div>
            <ModuleForm
              submitLabel="+ Añadir capítulo"
              resetOnSuccess
              onCancel={section.lessons.length ? () => setAddingLesson(false) : undefined}
              onSubmit={(data) => createModule(section.id, data)}
            />
          </div>
        ) : (
          <div>
            <button type="button" className="btn" onClick={() => setAddingLesson(true)}>
              + Añadir capítulo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TrainingCourseEditor({ course, sections, buyers }: { course: Course; sections: SectionRow[]; buyers: Buyer[] }) {
  const [adding, setAdding] = useState(sections.length === 0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <Link href="/admin/formacion" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          ← Todas las formaciones
        </Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`tag ${course.published ? "pos" : "neu"}`}>{course.published ? "Publicada" : "Borrador"}</span>
          <button
            type="button"
            className="btn"
            disabled={isPending}
            style={course.published ? {} : { borderColor: "var(--up)", color: "var(--up)" }}
            onClick={() => startTransition(() => setCoursePublished(course.id, !course.published))}
          >
            {course.published ? "Ocultar a los usuarios" : "Publicar"}
          </button>
          <Link href={`/formacion/${course.id}`} className="btn" target="_blank">
            Ver como usuario ↗
          </Link>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>
          Módulos ({sections.length}) · Capítulos ({sections.reduce((n, x) => n + x.lessons.length, 0)})
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
          La formación se divide en <b>módulos</b> y cada módulo en <b>capítulos</b>. Cada capítulo lleva su vídeo, PDF y
          descripción. Las flechas cambian el orden.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {sections.map((sec, i) => (
            <SectionCard key={sec.id} section={sec} index={i} count={sections.length} />
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {adding ? (
            <div style={{ padding: 14, border: "1px dashed var(--line-bright)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nuevo módulo</div>
              <SectionForm
                submitLabel="+ Crear módulo"
                resetOnSuccess
                onCancel={sections.length ? () => setAdding(false) : undefined}
                onSubmit={async (data) => {
                  await createSection(course.id, data);
                  setAdding(false);
                }}
              />
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              + Añadir módulo
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Datos de la formación</h3>
        <CourseForm
          key={course.id}
          initial={{
            title: course.title,
            description: course.description ?? "",
            coverUrl: course.coverUrl ?? "",
            price: course.priceCents ? (course.priceCents / 100).toFixed(course.priceCents % 100 ? 2 : 0).replace(".", ",") : "",
          }}
          submitLabel="Guardar cambios"
          onSubmit={(data) => updateCourse(course.id, data)}
        />
      </div>

      <CourseBuyers courseId={course.id} buyers={buyers} />

      <div className="panel" style={{ marginTop: 18, borderColor: "rgba(244,114,182,0.35)" }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Borrar formación</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
          Se borran la formación, todos sus módulos y capítulos, sus vídeos y PDF, el progreso y los accesos de los alumnos (también los que la pagaron). No se puede deshacer. Si solo
          quieres que no se vea, usa «Ocultar».
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={isPending}
          onClick={() => {
            if (confirm(`¿Borrar la formación «${course.title}» y todos sus módulos? No se puede deshacer.`)) {
              startTransition(async () => {
                await deleteCourse(course.id);
                router.push("/admin/formacion");
              });
            }
          }}
        >
          Borrar formación
        </button>
      </div>
    </>
  );
}
