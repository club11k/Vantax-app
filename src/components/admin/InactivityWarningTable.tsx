"use client";

import { useState, useTransition } from "react";
import { warnUserInactivity } from "@/app/admin/actions";

type Row = {
  userId: string;
  userEmail: string;
  userName: string | null;
  daysInactive: number;
  blocked: boolean;
  warnedAt: string | null;
  lastTradeAt: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function WarnButton({ row }: { row: Row }) {
  const [pending, startTransition] = useTransition();
  const [justWarned, setJustWarned] = useState(false);

  return (
    <button
      className="btn"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await warnUserInactivity(row.userId);
          setJustWarned(true);
        })
      }
    >
      {justWarned || row.warnedAt ? "Volver a avisar" : "Avisar"}
    </button>
  );
}

export function InactivityWarningTable({ rows }: { rows: Row[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Última operación</th>
            <th>Días inactivo</th>
            <th>Estado</th>
            <th>Último aviso</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>
                <div>{r.userEmail}</div>
                {r.userName && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{r.userName}</div>}
              </td>
              <td style={{ fontSize: 12.5 }}>{fmtDate(r.lastTradeAt)}</td>
              <td style={{ fontFamily: "var(--font-mono)" }}>{r.daysInactive}</td>
              <td>
                <span className={`tag ${r.blocked ? "neg" : "neu"}`}>
                  {r.blocked ? "Ya bloqueado (30d)" : "Sin bloquear todavía"}
                </span>
              </td>
              <td style={{ fontSize: 12.5 }}>{fmtDate(r.warnedAt)}</td>
              <td>
                <WarnButton row={r} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                Nadie por avisar ahora mismo.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
