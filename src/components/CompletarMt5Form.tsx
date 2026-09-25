"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--bg-elevated, #14141c)",
  color: "var(--text-primary)",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-dim)",
  marginBottom: 4,
  display: "block",
};

export function CompletarMt5Form() {
  const router = useRouter();
  const { update } = useSession();

  const [brokerName, setBrokerName] = useState("Vantage");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"NORMAL" | "CENT">("NORMAL");
  const [investorLogin, setInvestorLogin] = useState("");
  const [investorPassword, setInvestorPassword] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    brokerName.trim() && accountNumber.trim() && investorLogin.trim() && investorPassword && mt5Server.trim() && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/play/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerName: brokerName.trim(),
          accountNumber: accountNumber.trim(),
          accountType,
          investorLogin: investorLogin.trim(),
          investorPassword,
          mt5Server: mt5Server.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudo vincular la cuenta.");
        setSaving(false);
        return;
      }

      // Fuerza a que el token de sesión se recalcule YA (needsMt5Setup pasa
      // a false) — si no, el middleware seguiría viendo el token antiguo
      // hasta el próximo refresco automático y te devolvería aquí mismo.
      await update();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
      <div>
        <label style={labelStyle}>Bróker</label>
        <input style={inputStyle} type="text" placeholder="Ej: Vantage" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} disabled={saving} />
      </div>
      <div>
        <label style={labelStyle}>Número de cuenta</label>
        <input style={inputStyle} type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={saving} />
      </div>
      <div>
        <label style={labelStyle}>Tipo de cuenta</label>
        <select style={inputStyle} value={accountType} onChange={(e) => setAccountType(e.target.value as "NORMAL" | "CENT")} disabled={saving}>
          <option value="NORMAL">Normal</option>
          <option value="CENT">Cent</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Servidor MT5</label>
        <input style={inputStyle} type="text" placeholder="Ej: VantageMarkets-Live 14" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} disabled={saving} />
      </div>
      <div>
        <label style={labelStyle}>Login de inversor</label>
        <input style={inputStyle} type="text" value={investorLogin} onChange={(e) => setInvestorLogin(e.target.value)} disabled={saving} />
      </div>
      <div>
        <label style={labelStyle}>Contraseña de inversor</label>
        <input style={inputStyle} type="password" value={investorPassword} onChange={(e) => setInvestorPassword(e.target.value)} disabled={saving} />
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
          Es la contraseña de SOLO LECTURA de tu cuenta MT5 (nunca la de operar) — se guarda cifrada y solo la usa
          nuestro sistema para leer tu saldo y tus operaciones, nunca para operar por ti.
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {saving ? "Vinculando…" : "Vincular cuenta y continuar"}
      </button>
    </form>
  );
}

