"use client";

import { useState } from "react";

export function SubscribeButton({ planId, label }: { planId: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar el pago.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={handleClick} disabled={loading}>
        {loading ? "Redirigiendo…" : label ?? "Suscribirme"}
      </button>
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo abrir el portal de facturación.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div>
      <button className="btn" onClick={handleClick} disabled={loading}>
        {loading ? "Abriendo…" : "Gestionar suscripción"}
      </button>
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
