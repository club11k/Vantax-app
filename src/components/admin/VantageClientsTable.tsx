"use client";

import { useMemo, useState, useTransition } from "react";
import { setVantageManualOverride } from "@/app/admin/actions";

type ClientRow = {
  id: string;
  userEmail: string;
  userName: string | null;
  accountNumber: string;
  accountType: string | null;
  platform: string | null;
  lastCommission: number;
  vCoinEarned: number;
  lastTradeTime: string | null;
  activeLast30Days: boolean;
  ibStatus: "LINKED" | "UNLINKED";
  lastAllocationAt: string | null;
  lastSyncedAt: string | null;
  manualActiveOverride: boolean | null;
  effectiveActive: boolean;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

type Filter = "all" | "active" | "inactive" | "unlinked" | "blocked";

function OverrideControl({ row }: { row: ClientRow }) {
  const [pending, startTransition] = useTransition();
  const value = row.manualActiveOverride === null ? "auto" : row.manualActiveOverride ? "active" : "inactive";

  function apply(next: "auto" | "active" | "inactive") {
    const override = next === "auto" ? null : next === "active";
    startTransition(() => {
      setVantageManualOverride(row.id, override);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className={`tag ${row.effectiveActive ? "pos" : "neg"}`}>
        {row.effectiveActive ? "Con acceso" : "Bloqueado"}
      </span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => apply(e.target.value as "auto" | "active" | "inactive")}
        style={{ fontSize: 11.5, padding: "2px 4px" }}
      >
        <option value="auto">Automático</option>
        <option value="active">Forzar activa</option>
        <option value="inactive">Forzar inactiva</option>
      </select>
    </div>
  );
}

export function VantageClientsTable({ rows }: { rows: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.activeLast30Days && r.ibStatus === "LINKED").length,
      inactive: rows.filter((r) => !r.activeLast30Days && r.ibStatus === "LINKED").length,
      unlinked: rows.filter((r) => r.ibStatus === "UNLINKED").length,
      blocked: rows.filter((r) => !r.effectiveActive).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "active") list = list.filter((r) => r.activeLast30Days && r.ibStatus === "LINKED");
    if (filter === "inactive") list = list.filter((r) => !r.activeLast30Days && r.ibStatus === "LINKED");
    if (filter === "unlinked") list = list.filter((r) => r.ibStatus === "UNLINKED");
    if (filter === "blocked") list = list.filter((r) => !r.effectiveActive);

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.userEmail, r.userName ?? "", r.accountNumber].join(" ").toLowerCase().includes(q)
    );
  }, [rows, query, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por email, nombre o nº de cuenta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320, flex: 1, minWidth: 200 }}
        />
        <button className={`btn ${filter === "all" ? "btn-primary" : ""}`} onClick={() => setFilter("all")}>
          Todos ({rows.length})
        </button>
        <button className={`btn ${filter === "active" ? "btn-primary" : ""}`} onClick={() => setFilter("active")}>
          Activos 30d ({counts.active})
        </button>
        <button className={`btn ${filter === "inactive" ? "btn-primary" : ""}`} onClick={() => setFilter("inactive")}>
          Inactivos ({counts.inactive})
        </button>
        <button className={`btn ${filter === "unlinked" ? "btn-primary" : ""}`} onClick={() => setFilter("unlinked")}>
          Desvinculados ({counts.unlinked})
        </button>
        <button className={`btn ${filter === "blocked" ? "btn-primary" : ""}`} onClick={() => setFilter("blocked")}>
          Sin acceso ({counts.blocked})
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Cuenta Vantage</th>
              <th>V-COIN (lotaje MT5)</th>
              <th>Última operación</th>
              <th>Actividad</th>
              <th>Estado IB</th>
              <th>Acceso a Vantax</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <div>{r.userEmail}</div>
                  {r.userName && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{r.userName}</div>}
                </td>
                <td>
                  <div style={{ fontFamily: "var(--font-mono)" }}>{r.accountNumber}</div>
                  <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    {[r.accountType, r.platform].filter(Boolean).join(" · ") || "—"}
                  </div>
                </td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{r.vCoinEarned} V-COIN</td>
                <td style={{ fontSize: 12.5 }}>{fmtDate(r.lastTradeTime)}</td>
                <td>
                  <span className={`tag ${r.activeLast30Days ? "pos" : "neu"}`}>
                    {r.activeLast30Days ? "Activo (30d)" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <span className={`tag ${r.ibStatus === "LINKED" ? "pos" : "neg"}`}>
                    {r.ibStatus === "LINKED" ? "Vinculado" : "Desvinculado"}
                  </span>
                  {r.ibStatus === "UNLINKED" && (
                    <div style={{ color: "var(--text-dim)", fontSize: 11 }}>desde {fmtDate(r.lastAllocationAt)}</div>
                  )}
                </td>
                <td>
                  <OverrideControl row={r} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

