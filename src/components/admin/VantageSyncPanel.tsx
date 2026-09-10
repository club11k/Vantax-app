"use client";

import { useState, useTransition } from "react";
import { syncVantageCommissions } from "@/app/admin/actions";
import type { VantageSyncResult } from "@/lib/vantage-ib";

export function VantageSyncPanel() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<(VantageSyncResult & { error?: string }) | null>(null);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncVantageCommissions();
      setResult(res);
    });
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>Sincronizar V-COIN con la comisión de Vantage (IB)</label>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
        Consulta la comisión acumulada de todas tus cuentas de Vantage y acredita V-COIN solo por la comisión nueva
        generada desde la última vez (nunca se acredita dos veces lo mismo). No hay sincronización automática
        todavía — hay que lanzarla a mano.
      </p>
      <div>
        <button className="btn btn-primary" onClick={handleSync} disabled={isPending}>
          {isPending ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </div>

      {result?.error && <div className="error-msg">{result.error}</div>}

      {result && !result.error && result.skippedNoRate && (
        <div className="error-msg">
          Falta configurar la tasa de V-COIN por $ de comisión (campo de abajo) antes de poder sincronizar.
        </div>
      )}

      {result && !result.error && !result.skippedNoRate && (
        <div style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          Cuentas recibidas de Vantage: {result.totalAccountsFromVantage} · Vinculadas en VANTAX: {result.matchedAccounts} ·
          Acreditadas en este sync: {result.accountsCredited} · V-COIN repartidos: {result.totalVCoinAwarded}
        </div>
      )}
    </div>
  );
}
