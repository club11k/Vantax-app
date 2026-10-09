"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createModule,
  deleteCourse,
  deleteModule,
  moveModule,
  setCoursePublished,
  updateCourse,
  updateModule,
} from "@/app/admin/formacion-actions";
import { CourseForm } from "./CourseForm";
import { ModuleForm, type ModuleInitial } from "./ModuleForm";

type Course = { id: string; title: string; description: string | null; coverUrl: string | null; published: boolean };
type ModuleRow = ModuleInitial & { id: string };

function ModuleItem({ mod, index, count }: { mod: ModuleRow; index: number; count: number }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <div style={{ padding: 14, border: "1px solid var(--violet)", borderRadius: 12, background: "var(--bg-panel-raised)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Editando módulo {index + 1}</div>
        <ModuleForm
          initial={mod}
          submitLabel="Guardar módulo"
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
          <span>{mod.videoUrl ? "▶ Vídeo" : "Sin vídeo"}</span>
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
            if (confirm(`¿Borrar el módulo «${mod.title}»? Se perderá también el progreso de los usuarios en él.`)) {
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

export function TrainingCourseEditor({ course, modules }: { course: Course; modules: ModuleRow[] }) {
  const [adding, setAdding] = useState(modules.length === 0);
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
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Módulos ({modules.length})</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
          Cada módulo puede tener un vídeo (por enlace), un PDF (subido o por enlace) y una descripción. Las flechas cambian
          el orden.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {modules.map((m, i) => (
            <ModuleItem key={m.id} mod={m} index={i} count={modules.length} />
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {adding ? (
            <div style={{ padding: 14, border: "1px dashed var(--line-bright)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nuevo módulo</div>
              <ModuleForm
                submitLabel="+ Añadir módulo"
                resetOnSuccess
                onCancel={modules.length ? () => setAdding(false) : undefined}
                onSubmit={(data) => createModule(course.id, data)}
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
          initial={{ title: course.title, description: course.description ?? "", coverUrl: course.coverUrl ?? "" }}
          submitLabel="Guardar cambios"
          onSubmit={(data) => updateCourse(course.id, data)}
        />
      </div>

      <div className="panel" style={{ marginTop: 18, borderColor: "rgba(244,114,182,0.35)" }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Borrar formación</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
          Se borran la formación, todos sus módulos, sus PDF y el progreso de los usuarios. No se puede deshacer. Si solo
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
