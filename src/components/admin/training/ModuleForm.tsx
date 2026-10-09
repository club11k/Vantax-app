"use client";

import { useState, useTransition } from "react";
import { toVideoEmbed } from "@/lib/training-embed";
import type { ModuleInput } from "@/app/admin/formacion-actions";

export type ModuleInitial = ModuleInput & { pdfFileName?: string | null };

function videoLabel(url: string) {
  const v = url.trim();
  if (!v) return null;
  const emb = toVideoEmbed(v);
  if (!emb) return { ok: false, text: "No reconozco este enlace. Revisa que esté completo (https://…)." };
  const s = emb.src;
  const name = s.includes("youtube")
    ? "YouTube"
    : s.includes("vimeo")
      ? "Vimeo"
      : s.includes("drive.google")
        ? "Google Drive"
        : s.includes("loom")
          ? "Loom"
          : s.includes("mediadelivery")
            ? "Bunny"
            : emb.kind === "video"
              ? "vídeo directo"
              : "otro (se intentará incrustar tal cual)";
  return { ok: true, text: `Detectado: ${name}` };
}

// Subida con barra de progreso (los PDF pueden pesar varios MB).
function uploadPdf(file: File, onProgress: (pct: number) => void): Promise<{ id: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/formacion/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let json: any = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta no JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.file) resolve(json.file);
      else reject(new Error(json.error ?? "No se pudo subir el PDF."));
    };
    xhr.onerror = () => reject(new Error("No se pudo subir el PDF. Revisa la conexión."));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function ModuleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess = false,
}: {
  initial?: ModuleInitial;
  submitLabel: string;
  onSubmit: (data: ModuleInput) => Promise<unknown>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [pdfUrl, setPdfUrl] = useState(initial?.pdfUrl ?? "");
  const [pdfFileId, setPdfFileId] = useState<string | null>(initial?.pdfFileId ?? null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(initial?.pdfFileName ?? null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || uploadPct !== null;
  const vl = videoLabel(videoUrl);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Pon un título al módulo.");
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit({ title, description, videoUrl, pdfUrl: pdfFileId ? "" : pdfUrl, pdfFileId });
        if (resetOnSuccess) {
          setTitle("");
          setDescription("");
          setVideoUrl("");
          setPdfUrl("");
          setPdfFileId(null);
          setPdfFileName(null);
        }
      } catch (ex: any) {
        setError(ex?.message ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Título del módulo
        <input type="text" value={title} maxLength={160} placeholder="Ej: Módulo 1 · Qué mueve al oro" onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Descripción (opcional)
        <textarea value={description} rows={3} maxLength={10000} placeholder="Resumen, apuntes o enlaces del módulo" onChange={(e) => setDescription(e.target.value)} disabled={busy} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        Vídeo (enlace, opcional)
        <input
          type="text"
          value={videoUrl}
          placeholder="YouTube no listado, Vimeo, Google Drive, Loom o Bunny"
          onChange={(e) => setVideoUrl(e.target.value)}
          disabled={busy}
        />
        {vl && <span style={{ fontSize: 12, color: vl.ok ? "var(--violet-bright)" : "var(--down)" }}>{vl.text}</span>}
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        PDF (opcional)
        {pdfFileId ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="tag pos">📄 {pdfFileName ?? "PDF subido"}</span>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setPdfFileId(null);
                setPdfFileName(null);
              }}
            >
              Quitar PDF
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="btn" style={{ cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center" }}>
                {uploadPct !== null ? `Subiendo… ${uploadPct}%` : "📤 Subir PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy}
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setError(null);
                    setUploadPct(0);
                    try {
                      const saved = await uploadPdf(f, setUploadPct);
                      setPdfFileId(saved.id);
                      setPdfFileName(saved.filename);
                      setPdfUrl("");
                    } catch (ex: any) {
                      setError(ex?.message ?? "No se pudo subir el PDF.");
                    } finally {
                      setUploadPct(null);
                    }
                  }}
                />
              </label>
              <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Máximo 25 MB</span>
            </div>
            <input type="text" value={pdfUrl} placeholder="…o pega el enlace a un PDF (p. ej. Google Drive)" onChange={(e) => setPdfUrl(e.target.value)} disabled={busy} />
          </>
        )}
      </div>

      {error && <div style={{ color: "var(--down)", fontSize: 13 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {isPending ? "Guardando…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
