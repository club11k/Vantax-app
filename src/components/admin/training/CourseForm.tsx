"use client";

import { useState, useTransition } from "react";
import { CoverField } from "./CoverField";
import type { CourseInput } from "@/app/admin/formacion-actions";

// Formulario de formación (crear o editar): título, descripción y portada.
export function CourseForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess = false,
}: {
  initial?: CourseInput;
  submitLabel: string;
  onSubmit: (data: CourseInput) => Promise<unknown>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Pon un título a la formación.");
    setError(null);
    setOk(false);
    startTransition(async () => {
      try {
        await onSubmit({ title, description, coverUrl });
        setOk(true);
        if (resetOnSuccess) {
          setTitle("");
          setDescription("");
          setCoverUrl("");
        }
      } catch (ex: any) {
        setError(ex?.message ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Título
        <input type="text" value={title} maxLength={160} placeholder="Ej: Curso de iniciación al oro" onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Descripción
        <textarea
          value={description}
          maxLength={4000}
          rows={3}
          placeholder="Qué se aprende en esta formación"
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
        />
      </label>
      <CoverField value={coverUrl} onChange={setCoverUrl} disabled={isPending} />
      {error && <div style={{ color: "var(--down)", fontSize: 13 }}>{error}</div>}
      {ok && !error && <div style={{ color: "var(--violet-bright)", fontSize: 13 }}>Guardado ✓</div>}
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
