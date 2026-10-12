"use client";

import { useState, useTransition } from "react";
import { grantCourseAccess, revokeCourseAccess } from "@/app/admin/formacion-actions";

type Buyer = { id: string; email: string; name: string | null; source: string; amount: string | null; date: string };

// Quién tiene esta formación: compras con Stripe y accesos dados a mano.
export function CourseBuyers({ courseId, buyers }: { courseId: string; buyers: Buyer[] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function grant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await grantCourseAccess(courseId, email);
        setEmail("");
      } catch (ex: any) {
        setError(ex?.message ?? "No se pudo dar acceso.");
      }
    });
  }

  const paid = buyers.filter((b) => b.source === "STRIPE").length;

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>
        Alumnos ({buyers.length}) · {paid} {paid === 1 ? "compra" : "compras"}
      </h3>
      <form onSubmit={grant} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, flex: "1 1 240px" }}>
          Dar acceso gratis a esta formación
          <input type="email" value={email} placeholder="email del usuario registrado" onChange={(e) => setEmail(e.target.value)} disabled={isPending} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={isPending || !email.trim()}>
          {isPending ? "…" : "Dar acceso"}
        </button>
      </form>
      {error && <div style={{ color: "var(--down)", fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Cómo</th>
              <th>Importe</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr key={b.id}>
                <td>
                  <div>{b.email}</div>
                  {b.name && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{b.name}</div>}
                </td>
                <td>
                  <span className={`tag ${b.source === "STRIPE" ? "pos" : "neu"}`}>{b.source === "STRIPE" ? "💳 Compra" : "🎁 Acceso manual"}</span>
                </td>
                <td>{b.amount ?? "—"}</td>
                <td>{new Date(b.date).toLocaleDateString("es-ES")}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={isPending}
                    onClick={() => {
                      const msg =
                        b.source === "STRIPE"
                          ? `${b.email} pagó esta formación. ¿Seguro que quieres quitarle el acceso? (El dinero no se devuelve solo: el reembolso se hace desde Stripe.)`
                          : `¿Quitar el acceso de ${b.email} a esta formación?`;
                      if (confirm(msg)) startTransition(() => revokeCourseAccess(b.id));
                    }}
                  >
                    Quitar acceso
                  </button>
                </td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                  Todavía nadie tiene esta formación.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
