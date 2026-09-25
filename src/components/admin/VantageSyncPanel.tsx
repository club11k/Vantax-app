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
      <label>Sincronizar historial del IB de Vantage</label>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
        Trae el historial de entradas/salidas del IB (quién se desvincula) — lo puedes ver en detalle en{" "}
        <a href="/admin/vantage-clients">Clientes Vantage</a>. El V-COIN y la fecha de última operación de cada
        cuenta YA NO salen de aquí: desde que MT5 es obligatorio para todo el mundo, esos dos datos se actualizan
        solos vía el orquestador propio de la VPS, cada vez que sincroniza. Esto de aquí también corre solo, cada
        15-30 min (Cron Job en Render) — este botón es solo para forzarlo a mano sin esperar.
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
          <div style={{ marginTop: 4 }}>
            Eventos de entrada/salida leídos: {result.allocationEventsFound} · Entraron: {result.accountsEntered} ·{" "}
            <span style={{ color: result.accountsExited > 0 ? "var(--down)" : undefined }}>
              Salieron: {result.accountsExited}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}


