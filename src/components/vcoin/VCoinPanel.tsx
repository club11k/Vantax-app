"use client";

import { useEffect, useState } from "react";

type VantageAccount = {
  id: string;
  accountNumber: string;
  accountType: string | null;
  platform: string | null;
  vCoinEarned: number;
  lastSyncedAt: string | null;
};

export function VCoinPanel() {
  const [loading, setLoading] = useState(true);
  const [vCoinBalance, setVCoinBalance] = useState(0);
  const [accounts, setAccounts] = useState<VantageAccount[]>([]);
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/vcoin/account");
      const data = await res.json();
      if (res.ok) {
        setVCoinBalance(data.vCoinBalance ?? 0);
        setAccounts(data.accounts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!accountNumber.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/vcoin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber: accountNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo vincular la cuenta.");
        return;
      }
      setAccountNumber("");
      await load();
    } catch {
      setError("No se pudo vincular la cuenta. Prueba de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Tu saldo
          </div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--gold-bright)" }}>
            {loading ? "…" : `${vCoinBalance} V-COIN`}
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label>Vincular cuenta de Vantage</label>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
          Escribe el número de tu cuenta de trading en Vantage (la que abriste bajo nuestro IB). En cuanto la
          vincules, la comisión que generes empezará a convertirse en V-COIN en cada sincronización.
        </p>
        <form onSubmit={handleLink} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Ej: 22380"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
            disabled={saving}
          />
          <button className="btn btn-primary" type="submit" disabled={saving || !accountNumber.trim()}>
            {saving ? "Vinculando…" : "Vincular"}
          </button>
        </form>
        {error && <div className="error-msg">{error}</div>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Tus cuentas vinculadas</h2>
        {!loading && accounts.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Todavía no vinculaste ninguna cuenta de Vantage.</p>
        )}
        {accounts.map((a) => (
          <div key={a.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0", fontSize: 13.5 }}>
            <div>
              Cuenta <span style={{ fontFamily: "var(--font-mono)" }}>{a.accountNumber}</span>
              {a.platform && <span className="tag neu" style={{ marginLeft: 8 }}>{a.platform}</span>}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              V-COIN ganados con esta cuenta: {a.vCoinEarned} ·{" "}
              {a.lastSyncedAt
                ? `Última sincronización: ${new Date(a.lastSyncedAt).toLocaleString("es-ES")}`
                : "Todavía sin sincronizar"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

