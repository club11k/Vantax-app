import { prisma } from "@/lib/prisma";
import { PlanForm } from "@/components/admin/PlanForm";

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Para que un plan se pueda cobrar, primero crea un <strong>Product</strong> y un{" "}
        <strong>Price</strong> recurrente mensual en el Dashboard de Stripe (Product catalog), y pega
        aquí el <code>Stripe Price ID</code> (empieza con <code>price_</code>). Los precios de Stripe son
        inmutables: si cambias el precio de un plan, crea un Price nuevo en Stripe y actualiza el ID aquí.
      </div>

      <div>
        <h2 style={{ fontSize: 16 }}>Planes existentes</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {plans.map((plan) => (
            <PlanForm
              key={plan.id}
              plan={{
                id: plan.id,
                name: plan.name,
                description: plan.description,
                priceCents: plan.priceCents,
                monthlyQuota: plan.monthlyQuota,
                stripePriceId: plan.stripePriceId,
                active: plan.active,
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 16 }}>Crear plan nuevo</h2>
        <PlanForm />
      </div>
    </div>
  );
}

