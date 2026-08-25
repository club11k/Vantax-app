"use client";

import { useState, useTransition } from "react";
import { createPlan, updatePlan, togglePlanActive } from "@/app/admin/actions";

type PlanData = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  monthlyQuota: number;
  stripePriceId: string | null;
  active: boolean;
};

export function PlanForm({ plan, onDone }: { plan?: PlanData; onDone?: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan ? (plan.priceCents / 100).toString() : "");
  const [quota, setQuota] = useState(plan ? plan.monthlyQuota.toString() : "");
  const [stripePriceId, setStripePriceId] = useState(plan?.stripePriceId ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(price) * 100);
    const monthlyQuota = parseInt(quota, 10);

    startTransition(async () => {
      if (plan) {
        await updatePlan(plan.id, { name, description, priceCents, monthlyQuota, stripePriceId });
      } else {
        await createPlan({ name, description, priceCents, monthlyQuota, stripePriceId });
        setName("");
        setDescription("");
        setPrice("");
        setQuota("");
        setStripePriceId("");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel" style={{ background: "var(--bg-panel-raised)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>Precio mensual (EUR)</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
      </div>
      <div>
        <label>Descripción</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label>Análisis por mes</label>
          <input type="number" value={quota} onChange={(e) => setQuota(e.target.value)} required />
        </div>
        <div>
          <label>Stripe Price ID</label>
          <input value={stripePriceId} onChange={(e) => setStripePriceId(e.target.value)} placeholder="price_..." />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : plan ? "Guardar cambios" : "Crear plan"}
        </button>
        {plan && (
          <button
            type="button"
            className="btn"
            disabled={isPending}
            onClick={() => startTransition(() => togglePlanActive(plan.id, !plan.active))}
          >
            {plan.active ? "Desactivar" : "Activar"}
          </button>
        )}
        {saved && <span style={{ color: "var(--up)", fontSize: 12, fontFamily: "var(--font-mono)" }}>Guardado ✓</span>}
      </div>
    </form>
  );
}
