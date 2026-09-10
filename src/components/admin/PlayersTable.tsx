"use client";

import { useMemo, useState, useTransition } from "react";
import { toggleIbActive } from "@/app/admin/actions";

type PlayerRow = {
  id: string;
  userEmail: string;
  userName: string | null;
  vCoinBalance: number;
  brokerName: string;
  accountNumber: string;
  accountType: "NORMAL" | "CENT";
  accountTypeVerified: boolean;
  balance: number;
  equity: number;
  ibActive: boolean;
  myfxbookEmail: string | null;
  lastSyncedAt: string | null;
  lotsThisMonth: number;
  profitPctThisMonth: number;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function PlayerRowItem({ row }: { row: PlayerRow }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr>
      <td>
        <div>{row.userEmail}</div>
        {row.userName && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{row.userName}</div>}
      </td>
      <td>
        <div>{row.brokerName}</div>
        <div style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{row.accountNumber}</div>
      </td>
      <td>
        {row.accountType === "CENT" ? "Cent" : "Normal"}
        {!row.accountTypeVerified && (
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}> (sin confirmar)</span>
        )}
      </td>
      <td>
        {row.myfxbookEmail ? (
          <>
            <div>{row.myfxbookEmail}</div>
            <div style={{ color: "var(--text-dim)", fontSize: 11 }}>Última sync: {fmtDate(row.lastSyncedAt)}</div>
          </>
        ) : (
          <span className="tag neu">Sin vincular</span>
        )}
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>
        {row.balance.toFixed(2)} / {row.equity.toFixed(2)}
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>
        {row.lotsThisMonth.toFixed(2)} lotes
        <div style={{ color: row.profitPctThisMonth >= 0 ? "var(--up)" : "var(--down)", fontSize: 11 }}>
          {row.profitPctThisMonth >= 0 ? "+" : ""}
          {row.profitPctThisMonth.toFixed(2)}%
        </div>
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>{row.vCoinBalance}</td>
      <td>
        <span className={`tag ${row.ibActive ? "pos" : "neg"}`}>{row.ibActive ? "Activa" : "Inactiva"}</span>
      </td>
      <td>
        <button
          className={`btn ${row.ibActive ? "btn-danger" : ""}`}
          disabled={isPending}
          onClick={() => startTransition(() => toggleIbActive(row.id, !row.ibActive))}
        >
          {row.ibActive ? "Desactivar" : "Activar"}
        </button>
      </td>
    </tr>
  );
}

export function PlayersTable({ rows }: { rows: PlayerRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.userEmail, r.userName ?? "", r.accountNumber, r.brokerName, r.myfxbookEmail ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="text"
        placeholder="Buscar por email, nombre, nº de cuenta o broker…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 360 }}
      />
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Broker / Cuenta</th>
              <th>Tipo</th>
              <th>Myfxbook</th>
              <th>Saldo / Equity</th>
              <th>Lotaje XAUUSD (mes)</th>
              <th>V-COIN total</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <PlayerRowItem key={row.id} row={row} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--text-dim)" }}>
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
