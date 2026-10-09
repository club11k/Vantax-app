"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Botón "Marcar como completado" de un módulo de Formación. Al completarlo
// pasa solo al siguiente módulo (si lo hay).
export function CompleteButton({ moduleId, initialDone, nextHref }: { moduleId: string; initialDone: boolean; nextHref: string | null }) {
  const [done, setDone] = useState(initialDone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    const target = !done;
    setError(null);
    try {
      const res = await fetch("/api/formacion/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, done: target }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "No se pudo guardar.");
        return;
      }
      setDone(target);
      startTransition(() => {
        if (target && nextHref) router.push(nextHref);
        else router.refresh();
      });
    } catch {
      setError("No se pudo guardar. Prueba de nuevo.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button type="button" className={`btn fm-complete${done ? " done" : ""}`} onClick={toggle} disabled={isPending}>
        {done ? "✓ Completado" : "Marcar como completado"}
      </button>
      {error && <span style={{ fontSize: 12, color: "var(--down)" }}>{error}</span>}
    </div>
  );
}
