"use client";

import { useState } from "react";

// Portada de una formación: subir una foto (se reduce en el navegador) o
// pegar la URL de una imagen.
function resizeImage(file: File, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
        ctx.fillStyle = "#130F20";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function CoverField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const isData = value.startsWith("data:");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13 }}>Portada (opcional)</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            width: 160,
            aspectRatio: "16 / 9",
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid var(--line-bright)",
            background: "linear-gradient(135deg, #4C1D95, #17122A)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "🎓"
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="btn" style={{ cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center" }}>
            📷 Subir foto
            <input
              type="file"
              accept="image/*"
              disabled={disabled}
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setErr(null);
                  onChange(await resizeImage(f));
                } catch (ex: any) {
                  setErr(ex?.message ?? "No se pudo cargar la imagen.");
                }
              }}
            />
          </label>
          {value && (
            <button type="button" className="btn" disabled={disabled} onClick={() => onChange("")}>
              Quitar
            </button>
          )}
        </div>
      </div>
      <input
        type="text"
        placeholder="…o pega la URL de una imagen"
        value={isData ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Se ve mejor en formato horizontal (16:9).</span>
      {err && <span style={{ fontSize: 12, color: "var(--down)" }}>{err}</span>}
    </div>
  );
}
