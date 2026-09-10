"use client";

import { useState, useTransition } from "react";
import { syncMyfxbookAccounts } from "@/app/admin/actions";
import type { MyfxbookSyncResult } from "@/lib/play/myfxbook-sync";

export function MyfxbookSyncPanel() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<(MyfxbookSyncResult & { error?: string }) | null>(null);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncMyfxbookAccounts();
      setResult(res);
    });
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>Sincronizar V-COIN por lotaje (Myfxbook)</label>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
        Lee el lotaje de XAUUSD operado este mes en cada cuenta con Myfxbook vinculado, y acredita V-COIN solo por
        los lotes nuevos desde la última sincronización (nunca se acredita dos veces lo mismo). Solo cuenta
        cuentas marcadas como activas (luz verde) en su panel. No hay sincronización automática todavía — hay que
        lanzarla a mano.
      </p>
      <div>
        <button className="btn btn-primary" onClick={handleSync} disabled={isPending}>
          {isPending ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </div>

      {result?.error && <div className="error-msg">{result.error}</div>}

      {result && !result.error && result.skippedNoRate && (
        <div className="error-msg">
          Falta configurar la tasa de V-COIN por lote (campo de abajo) antes de poder sincronizar.
        </div>
      )}

      {result && !result.error && !result.skippedNoRate && (
        <div style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          Jugadores con Myfxbook vinculado: {result.totalLinkedPlayers} · Cuentas leídas: {result.accountsSynced} ·
          Acreditadas en este sync: {result.accountsCredited} · V-COIN repartidos: {result.totalVCoinAwarded}
          {result.errors.length > 0 && (
            <div style={{ color: "var(--down)", marginTop: 6 }}>
              {result.errors.length} jugador(es) con error al sincronizar (contraseña cambiada, cuenta bloqueada,
              etc.) — no bloquea al resto.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
