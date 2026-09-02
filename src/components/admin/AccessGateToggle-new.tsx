"use client";

import { useState, useTransition } from "react";
import { updateSetting } from "@/app/admin/actions";

// Mientras el negocio decide abrir las suscripciones de pago, este toggle
// controla si el dashboard le ofrece a los usuarios sin plan el flujo de
// pago con Stripe, o un aviso de "acceso gestionado a mano por el equipo".
// El acceso gratuito puntual (por usuario) se sigue dando desde la tabla de
// usuarios con "Dar acceso gratuito" — esto es un interruptor global.
export function AccessGateToggle({ settingKey, initialLocked }: { settingKey: string; initialLocked: boolean }) {
  const [locked, setLocked] = useState(initialLocked);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle() {
    const next = !locked;
    setLocked(next);
    startTransition(async () => {
      await updateSetting(settingKey, next ? "true" : "false");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>Acceso público de pago (Stripe)</label>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
        Con el candado activado, los usuarios nuevos ven un aviso de "acceso gestionado por el equipo" en
        vez de los planes de pago, y solo pueden generar análisis si les das acceso gratuito manualmente
        desde la tabla de usuarios. Desactívalo cuando quieras reabrir las suscripciones de pago.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn" disabled={isPending} onClick={toggle}>
          {locked ? "🔒 Candado activado — activar suscripciones de pago" : "🔓 Suscripciones de pago activas — activar candado"}
        </button>
        {saved && <span style={{ color: "var(--up)", fontSize: 12, fontFamily: "var(--font-mono)" }}>Guardado ✓</span>}
      </div>
    </div>
  );
}
