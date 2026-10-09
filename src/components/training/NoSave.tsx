"use client";

// Envoltorio que bloquea el menú del botón derecho (evita "Guardar vídeo
// como…" en los vídeos directos de Formación).
export function NoSave({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={className} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}
