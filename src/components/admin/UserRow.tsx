"use client";

import { useTransition } from "react";
import { resetUserQuota, setUserPlan, toggleUserSuspended, setUserRole } from "@/app/admin/actions";

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
};

export function UserRow({ user, plans }: { user: UserRowData; plans: Plan[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr>
      <td>
        <div>{user.email}</div>
        {user.name && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{user.name}</div>}
      </td>
      <td>
        <span className={`tag ${user.subscriptionStatus === "ACTIVE" ? "pos" : "neu"}`}>{user.subscriptionStatus}</span>
        {user.suspended && <span className="tag neg" style={{ marginLeft: 6 }}>Suspendido</span>}
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
      <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
