"use client";

import { useState, useTransition } from "react";
import { resetUserQuota, setUserPlan, toggleUserSuspended, setUserRole, grantFreeAccess, toggleMarketAccess } from "@/app/admin/actions";

type Plan = { id: string; name: string };
type UserRowData = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  subscriptionStatus: string;
  suspended: boolean;
  analysesUsedInPeriod: number;
  planId: string | null;
  planName: string | null;
  planQuota: number | null;
  planIsFree: boolean;
  marketAccess: boolean;
};

export function UserRow({ user, plans }: { user: UserRowData; plans: Plan[] }) {
  const [isPending, startTransition] = useTransition();
  const [freeQuota, setFreeQuota] = useState(30);

  return (
    <tr>
      <td>
        <div>{user.email}</div>
        {user.name && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{user.name}</div>}
      </td>
      <td>
        <span className={`tag ${user.subscriptionStatus === "ACTIVE" ? "pos" : "neu"}`}>{user.subscriptionStatus}</span>
        {user.planIsFree && <span className="tag pos" style={{ marginLeft: 6 }}>Gratis (admin)</span>}
        {user.suspended && <span className="tag neg" style={{ marginLeft: 6 }}>Suspendido</span>}
      </td>
      <td>
        <button
          className="btn"
          disabled={isPending}
          style={user.marketAccess ? { borderColor: "var(--up)", color: "var(--up)" } : {}}
          onClick={() => startTransition(() => toggleMarketAccess(user.id, !user.marketAccess))}
        >
          {user.marketAccess ? "Mercado: abierto" : "Mercado: bloqueado"}
        </button>
      </td>
      <td>
        <select
          defaultValue={user.planId ?? ""}
          disabled={isPending}
          onChange={(e) => startTransition(() => setUserPlan(user.id, e.target.value || null))}
        >
          <option value="">Sin plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>
        {user.analysesUsedInPeriod}
        {user.planQuota ? ` / ${user.planQuota}` : ""}
      </td>
      <td>
        <select
          defaultValue={user.role}
          disabled={isPending}
          onChange={(e) => startTransition(() => setUserRole(user.id, e.target.value as "USER" | "ADMIN"))}
        >
          <option value="USER">Usuario</option>
          <option value="ADMIN">Admin</option>
        </select>
      </td>
      <td style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {user.planIsFree ? (
          <button className="btn" disabled={isPending} onClick={() => startTransition(() => setUserPlan(user.id, null))}>
            Quitar acceso gratuito
          </button>
        ) : (
          <>
            <input
              type="number"
              min={1}
              value={freeQuota}
              onChange={(e) => setFreeQuota(Number(e.target.value) || 1)}
              title="Análisis por mes para el acceso gratuito"
              style={{ width: 56 }}
              disabled={isPending}
            />
            <button className="btn" disabled={isPending} onClick={() => startTransition(() => grantFreeAccess(user.id, freeQuota))}>
              Dar acceso gratuito
            </button>
          </>
        )}
        <button className="btn" disabled={isPending} onClick={() => startTransition(() => resetUserQuota(user.id))}>
          Resetear cuota
        </button>
        <button
          className={`btn ${user.suspended ? "" : "btn-danger"}`}
          disabled={isPending}
          onClick={() => startTransition(() => toggleUserSuspended(user.id, !user.suspended))}
        >
          {user.suspended ? "Reactivar" : "Suspender"}
        </button>
      </td>
    </tr>
  );
}

