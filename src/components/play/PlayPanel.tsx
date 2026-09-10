"use client";

import { useEffect, useState } from "react";

// Panel funcional (sin pulir visualmente todavía) para la Fase 1 de la
// migración de Vantax Play: registro de jugador (publicId + wallet de cobro)
// y vinculación de cuentas de trading (a mano o vía Myfxbook). Los cofres,
// rankings, tienda y torneos llegan en fases posteriores.

type PlayAccount = {
  id: string;
  accountNumber: string;
  accountType: string;
  mt5Server: string | null;
  ibActive: boolean;
  balance: number;
  equity: number;
  createdAt: string;
  broker: { name: string };
};

type Profile = {
  registered: boolean;
  publicId: string | null;
  payoutWallet: string | null;
  payoutNetwork: string | null;
  vCoinBalance: number;
  myfxbookLink: { email: string; lastSyncedAt: string | null } | null;
  accounts: PlayAccount[];
};

export function PlayPanel() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Registro de jugador
  const [publicId, setPublicId] = useState("");
  const [payoutWallet, setPayoutWallet] = useState("");
  const [payoutNetwork, setPayoutNetwork] = useState<"TRC20" | "BEP20">("TRC20");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Vinculación manual de cuenta MT5
  const [brokerName, setBrokerName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"NORMAL" | "CENT">("NORMAL");
  const [investorLogin, setInvestorLogin] = useState("");
  const [investorPassword, setInvestorPassword] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Vinculación vía Myfxbook
  const [myfxEmail, setMyfxEmail] = useState("");
  const [myfxPassword, setMyfxPassword] = useState("");
  const [savingMyfx, setSavingMyfx] = useState(false);
  const [myfxError, setMyfxError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/play/profile");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo cargar tu perfil de jugador.");
        return;
      }
      setProfile(data);
      setPublicId(data.publicId ?? "");
      setPayoutWallet(data.payoutWallet ?? "");
      setPayoutNetwork(data.payoutNetwork ?? "TRC20");
    } catch {
      setError("No se pudo cargar tu perfil de jugador. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicId.trim()) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/play/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: publicId.trim(), payoutWallet: payoutWallet.trim(), payoutNetwork }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error ?? "No se pudo guardar el perfil.");
        return;
      }
      await load();
    } catch {
      setProfileError("No se pudo guardar el perfil. Probá de nuevo.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brokerName.trim() || !accountNumber.trim()) return;
    setSavingAccount(true);
    setAccountError(null);
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
      const data = await res.json();
      if (!res.ok) {
        setAccountError(data.error ?? "No se pudo vincular la cuenta.");
        return;
      }
      setBrokerName("");
      setAccountNumber("");
      setInvestorLogin("");
      setInvestorPassword("");
      setMt5Server("");
      await load();
    } catch {
      setAccountError("No se pudo vincular la cuenta. Probá de nuevo.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleMyfxSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!myfxEmail.trim() || !myfxPassword) return;
    setSavingMyfx(true);
    setMyfxError(null);
    try {
      const res = await fetch("/api/play/myfxbook-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: myfxEmail.trim(), password: myfxPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMyfxError(data.error ?? "No se pudo vincular Myfxbook.");
        return;
      }
      setMyfxPassword("");
      await load();
    } catch {
      setMyfxError("No se pudo vincular Myfxbook. Probá de nuevo.");
    } finally {
      setSavingMyfx(false);
    }
  }

  if (loading) {
    return <div className="panel">Cargando…</div>;
  }
  if (error) {
    return <div className="error-msg">{error}</div>;
  }
  if (!profile) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Tu saldo
          </div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--gold-bright)" }}>
            {profile.vCoinBalance} V-COIN
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            Saldo único: incluye lo ganado por comisión de Vantage (ver /vcoin) y por lotaje vía Myfxbook en otros brokers.
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          {profile.registered ? "Tu perfil de jugador" : "Completa tu registro de jugador"}
        </h2>
        {!profile.registered && (
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
            Elegí un ID público (es lo que se va a ver en los rankings de Vantax Play, nunca tu nombre real) y, si
            querés, tus datos para cobrar V-COIN en cripto. Podés completar la wallet más adelante.
          </p>
        )}
        <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            ID público
            <input
              type="text"
              placeholder="Ej: trader_esther"
              value={publicId}
              onChange={(e) => setPublicId(e.target.value)}
              disabled={savingProfile}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 200 }}>
              Wallet de cobro (USDT)
              <input
                type="text"
                placeholder="Opcional"
                value={payoutWallet}
                onChange={(e) => setPayoutWallet(e.target.value)}
                disabled={savingProfile}
              />
            </label>
            <label>
              Red
              <select value={payoutNetwork} onChange={(e) => setPayoutNetwork(e.target.value as "TRC20" | "BEP20")} disabled={savingProfile}>
                <option value="TRC20">TRC20</option>
                <option value="BEP20">BEP20</option>
              </select>
            </label>
          </div>
          <div>
            <button className="btn btn-primary" type="submit" disabled={savingProfile || !publicId.trim()}>
              {savingProfile ? "Guardando…" : "Guardar perfil"}
            </button>
          </div>
        </form>
        {profileError && <div className="error-msg">{profileError}</div>}
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Vincular cuenta vía Myfxbook (recomendado)</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
          Creá una cuenta gratis en myfxbook.com, añadí ahí tu cuenta MT5 con la contraseña investor, y pegá acá el
          email/contraseña de esa cuenta de Myfxbook (no de tu MT5). Detectamos el broker, el tipo de cuenta y el
          saldo automáticamente.
        </p>
        {profile.myfxbookLink ? (
          <p style={{ fontSize: 13 }}>
            Myfxbook vinculado: <strong>{profile.myfxbookLink.email}</strong>
            {profile.myfxbookLink.lastSyncedAt
              ? ` · última sincronización: ${new Date(profile.myfxbookLink.lastSyncedAt).toLocaleString("es-ES")}`
              : " · todavía sin sincronizar"}
          </p>
        ) : (
          <form onSubmit={handleMyfxSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder="Email de Myfxbook"
              value={myfxEmail}
              onChange={(e) => setMyfxEmail(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
              disabled={savingMyfx}
            />
            <input
              type="password"
              placeholder="Contraseña de Myfxbook"
              value={myfxPassword}
              onChange={(e) => setMyfxPassword(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
              disabled={savingMyfx}
            />
            <button className="btn btn-primary" type="submit" disabled={savingMyfx || !myfxEmail.trim() || !myfxPassword}>
              {savingMyfx ? "Vinculando…" : "Vincular"}
            </button>
          </form>
        )}
        {myfxError && <div className="error-msg">{myfxError}</div>}
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>O vincular una cuenta MT5 a mano</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
          Usá esto solo si no querés usar Myfxbook. La contraseña investor es opcional por ahora (todavía no hay
          sincronización automática para cuentas vinculadas a mano).
        </p>
        <form onSubmit={handleAccountSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Broker (ej: Vantage)"
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
              disabled={savingAccount}
            />
            <input
              type="text"
              placeholder="Número de cuenta"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
              disabled={savingAccount}
            />
            <select value={accountType} onChange={(e) => setAccountType(e.target.value as "NORMAL" | "CENT")} disabled={savingAccount}>
              <option value="NORMAL">Normal</option>
              <option value="CENT">Cent</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Servidor MT5 (opcional)"
              value={mt5Server}
              onChange={(e) => setMt5Server(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
              disabled={savingAccount}
            />
            <input
              type="text"
              placeholder="Login investor (opcional)"
              value={investorLogin}
              onChange={(e) => setInvestorLogin(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
              disabled={savingAccount}
            />
            <input
              type="password"
              placeholder="Contraseña investor (opcional)"
              value={investorPassword}
              onChange={(e) => setInvestorPassword(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
              disabled={savingAccount}
            />
          </div>
          <div>
            <button className="btn btn-primary" type="submit" disabled={savingAccount || !brokerName.trim() || !accountNumber.trim()}>
              {savingAccount ? "Vinculando…" : "Vincular cuenta"}
            </button>
          </div>
        </form>
        {accountError && <div className="error-msg">{accountError}</div>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Tus cuentas vinculadas</h2>
        {profile.accounts.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Todavía no vinculaste ninguna cuenta.</p>
        )}
        {profile.accounts.map((a) => (
          <div key={a.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0", fontSize: 13.5 }}>
            <div>
              {a.broker.name} · <span style={{ fontFamily: "var(--font-mono)" }}>{a.accountNumber}</span>{" "}
              <span className="tag neu" style={{ marginLeft: 4 }}>{a.accountType === "CENT" ? "Cent" : "Normal"}</span>
              {!a.ibActive && <span className="tag neu" style={{ marginLeft: 4 }}>Pendiente de activar</span>}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              Saldo: {a.balance.toFixed(2)} · Equity: {a.equity.toFixed(2)}
              {a.mt5Server ? ` · Servidor: ${a.mt5Server}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

