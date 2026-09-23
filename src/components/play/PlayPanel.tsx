"use client";

import { useEffect, useState } from "react";
import styles from "@/components/play/arcade.module.css";
import { TraderProgressBar, type PlayProgress } from "@/components/play/TraderProgressBar";
import { ChestCabinet } from "@/components/play/ChestCabinet";

// Vantax Play, con la piel arcade del Vantax Play original (vcoin.html):
// tabs con glow, HUD de stats en pixel font, cofres dibujados en CSS. Todo
// el contenido de aquí para abajo vive dentro de .root (arcade.module.css)
// — el header/menú de VANTAX por fuera de este panel se queda con el tema
// normal del resto de la app, esto es solo "la pantalla del juego".

type PlayAccount = {
  id: string;
  accountNumber: string;
  accountType: string;
  mt5Server: string | null;
  investorLogin: string | null;
  mt5Connected: boolean;
  lastSyncedAt: string | null;
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
  accounts: PlayAccount[];
  progress: PlayProgress | null;
};

// Última sincronización de la cuenta, en formato relativo corto — la
// sincroniza sola el orquestador MT5 propio (mt5-orchestrator/) cada ~15
// minutos en cuanto la cuenta tiene login/contraseña investor y servidor.
function formatLastSync(iso: string | null): string {
  if (!iso) return "Todavía sin sincronizar";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Sincronizada hace un momento";
  if (diffMin < 60) return `Sincronizada hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Sincronizada hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `Sincronizada hace ${diffD} d`;
}

type Tab = "progreso" | "perfil" | "vcoin" | "tienda";

const TAB_LABEL: Record<Tab, string> = {
  progreso: "PROGRESO",
  perfil: "PERFIL",
  vcoin: "V-COIN",
  tienda: "TIENDA",
};

export function PlayPanel() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("progreso");

  // Registro de jugador
  const [publicId, setPublicId] = useState("");
  const [payoutWallet, setPayoutWallet] = useState("");
  const [payoutNetwork, setPayoutNetwork] = useState<"TRC20" | "BEP20">("TRC20");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Vinculación manual de cuenta MT5
  const [brokerName, setBrokerName] = useState("Vantage");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"NORMAL" | "CENT">("NORMAL");
  const [investorLogin, setInvestorLogin] = useState("");
  const [investorPassword, setInvestorPassword] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Edición del login/contraseña investor de una cuenta ya vinculada (para
  // corregir datos mal metidos, ej. un email en vez del número de login).
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editInvestorLogin, setEditInvestorLogin] = useState("");
  const [editInvestorPassword, setEditInvestorPassword] = useState("");
  const [editMt5Server, setEditMt5Server] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      setError("No se pudo cargar tu perfil de jugador. Prueba de nuevo.");
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
      setProfileError("No se pudo guardar el perfil. Prueba de nuevo.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brokerName.trim() || !accountNumber.trim() || !investorLogin.trim() || !investorPassword || !mt5Server.trim()) {
      setAccountError("Para vincular la cuenta hace falta conectar MT5: login investor, contraseña y servidor.");
      return;
    }
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
      setBrokerName("Vantage");
      setAccountNumber("");
      setInvestorLogin("");
      setInvestorPassword("");
      setMt5Server("");
      await load();
    } catch {
      setAccountError("No se pudo vincular la cuenta. Prueba de nuevo.");
    } finally {
      setSavingAccount(false);
    }
  }

  function startEditAccount(a: PlayAccount) {
    setEditingAccountId(a.id);
    setEditInvestorLogin(a.investorLogin ?? "");
    setEditInvestorPassword("");
    setEditMt5Server(a.mt5Server ?? "");
    setEditError(null);
  }

  function cancelEditAccount() {
    setEditingAccountId(null);
    setEditError(null);
  }

  async function saveEditAccount(accountId: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/play/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorLogin: editInvestorLogin.trim(),
          investorPassword: editInvestorPassword,
          mt5Server: editMt5Server.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "No se pudo guardar el cambio.");
        return;
      }
      setEditingAccountId(null);
      setEditInvestorPassword("");
      await load();
    } catch {
      setEditError("No se pudo guardar el cambio. Prueba de nuevo.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function disconnectMt5Account(accountId: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/play/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearMt5: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "No se pudo desconectar MT5.");
        return;
      }
      setEditingAccountId(null);
      await load();
    } catch {
      setEditError("No se pudo desconectar MT5. Prueba de nuevo.");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.card}>Cargando…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.root}>
        <div className={styles.errorMsg}>{error}</div>
      </div>
    );
  }
  if (!profile) return null;

  const effectiveTab: Tab = profile.registered ? tab : "perfil";

  return (
    <div className={styles.root}>
      <div className={`${styles.grid} ${styles.cols4}`}>
        <div className={styles.stat}>
          <div className={styles.statVal}>{profile.vCoinBalance}</div>
          <div className={styles.statLab}>V-COIN</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal} style={{ fontSize: 12 }}>
            {profile.progress ? profile.progress.tier : "—"}
          </div>
          <div className={styles.statLab}>Tramo actual</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{profile.progress && profile.progress.aheadOfCount >= 0 ? `#${profile.progress.aheadOfCount + 1}` : "—"}</div>
          <div className={styles.statLab}>Ranking (aprox.)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{profile.accounts.filter((a) => a.ibActive).length}</div>
          <div className={styles.statLab}>Cuentas activas</div>
        </div>
      </div>

      <div className={styles.tabs}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tabBtn} ${effectiveTab === t ? styles.active : ""}`}
            disabled={t !== "perfil" && !profile.registered}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {!profile.registered && (
        <p style={{ fontSize: 14, color: "var(--textDim)", marginTop: -8, marginBottom: 16 }}>
          Completa tu registro en "PERFIL" para desbloquear Progreso, V-COIN y Tienda.
        </p>
      )}

      {effectiveTab === "progreso" && profile.progress && (
        <>
          <TraderProgressBar progress={profile.progress} />
          <ChestCabinet progress={profile.progress} onChanged={load} />
        </>
      )}

      {effectiveTab === "vcoin" && (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>V-COIN</h3>
          <div className={styles.pix} style={{ fontSize: 26, color: "var(--gold)", textShadow: "0 0 8px #facc1580" }}>
            {profile.vCoinBalance} V-COIN
          </div>
          <p style={{ fontSize: 15, color: "var(--textDim)", marginTop: 10 }}>
            Es un saldo único: lo ganas tanto por la comisión que generas operando con tu cuenta de Vantage, como por
            el lotaje en XAUUSD que operas en cualquier otro broker — todo sincronizado solo desde tu cuenta MT5, sin
            que tengas que hacer nada más. Aquí en Vantax Play se usa para los cofres, y la vinculación de tu cuenta
            se hace una sola vez, en la pestaña "PERFIL".
          </p>
        </div>
      )}

      {effectiveTab === "tienda" && (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>TIENDA</h3>
          <p style={{ fontSize: 15, color: "var(--textDim)" }}>
            Muy pronto vas a poder canjear tu V-COIN por artículos del catálogo directamente aquí. De momento, los
            artículos solo se consiguen como premio extra al abrir un cofre.
          </p>
          <span className={styles.tag}>Próximamente</span>
        </div>
      )}

      {effectiveTab === "perfil" && (
        <>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>
              {profile.registered ? "TU PERFIL DE JUGADOR" : "COMPLETA TU REGISTRO"}
            </h3>
            {!profile.registered && (
              <p style={{ fontSize: 15, color: "var(--textDim)" }}>
                Elige un ID público (es lo que se va a ver en los rankings de Vantax Play, nunca tu nombre real) y, si
                quieres, tus datos para cobrar V-COIN en cripto. Puedes completar la wallet más adelante.
              </p>
            )}
            <form onSubmit={handleProfileSubmit}>
              <label className={styles.label}>ID público</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Ej: trader_esther"
                value={publicId}
                onChange={(e) => setPublicId(e.target.value)}
                disabled={savingProfile}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label className={styles.label}>Wallet de cobro (USDT)</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Opcional"
                    value={payoutWallet}
                    onChange={(e) => setPayoutWallet(e.target.value)}
                    disabled={savingProfile}
                  />
                </div>
                <div>
                  <label className={styles.label}>Red</label>
                  <select
                    className={styles.input}
                    value={payoutNetwork}
                    onChange={(e) => setPayoutNetwork(e.target.value as "TRC20" | "BEP20")}
                    disabled={savingProfile}
                  >
                    <option value="TRC20">TRC20</option>
                    <option value="BEP20">BEP20</option>
                  </select>
                </div>
              </div>
              <button className={styles.btn} type="submit" disabled={savingProfile || !publicId.trim()}>
                {savingProfile ? "GUARDANDO…" : "GUARDAR PERFIL"}
              </button>
            </form>
            {profileError && <div className={styles.errorMsg}>{profileError}</div>}
          </div>

          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>VINCULAR CUENTA MT5</h3>
            <p style={{ fontSize: 15, color: "var(--textDim)" }}>
              Un solo paso: indica el broker, el número de cuenta y conecta MT5 con la contraseña <b>investor</b> (solo
              lectura, nunca la de trading). Con eso ya está — tu saldo, el lotaje de XAUUSD y (si es una cuenta de
              Vantage) tu comisión de IB se sincronizan solos cada 15 minutos, sin nada más que vincular en ningún
              otro sitio.
            </p>
            <form onSubmit={handleAccountSubmit}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label className={styles.label}>Broker</label>
                  <input className={styles.input} type="text" placeholder="Ej: Vantage" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} disabled={savingAccount} />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label className={styles.label}>Número de cuenta</label>
                  <input className={styles.input} type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={savingAccount} />
                </div>
                <div>
                  <label className={styles.label}>Tipo</label>
                  <select className={styles.input} value={accountType} onChange={(e) => setAccountType(e.target.value as "NORMAL" | "CENT")} disabled={savingAccount}>
                    <option value="NORMAL">Normal</option>
                    <option value="CENT">Cent</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label className={styles.label}>Servidor MT5</label>
                  <input className={styles.input} type="text" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} disabled={savingAccount} />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label className={styles.label}>Login investor</label>
                  <input className={styles.input} type="text" value={investorLogin} onChange={(e) => setInvestorLogin(e.target.value)} disabled={savingAccount} />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label className={styles.label}>Contraseña investor</label>
                  <input className={styles.input} type="password" value={investorPassword} onChange={(e) => setInvestorPassword(e.target.value)} disabled={savingAccount} />
                </div>
              </div>
              <button
                className={styles.btn}
                type="submit"
                disabled={savingAccount || !brokerName.trim() || !accountNumber.trim() || !investorLogin.trim() || !investorPassword || !mt5Server.trim()}
              >
                {savingAccount ? "VINCULANDO…" : "VINCULAR CUENTA"}
              </button>
            </form>
            {accountError && <div className={styles.errorMsg}>{accountError}</div>}
          </div>

          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>TUS CUENTAS VINCULADAS</h3>
            {profile.accounts.length === 0 && <p style={{ color: "var(--textDim)" }}>Todavía no vinculaste ninguna cuenta.</p>}
            {profile.accounts.map((a) => (
              <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className={styles.accRow}>
                  <div className={`${styles.led} ${a.ibActive ? styles.on : styles.off}`} />
                  <div className={styles.accMeta}>
                    <b>
                      {a.broker.name} · {a.accountNumber}
                    </b>
                    <small>
                      Saldo: {a.balance.toFixed(2)} · Equity: {a.equity.toFixed(2)}
                      {a.mt5Server ? ` · Servidor: ${a.mt5Server}` : ""}
                      {a.mt5Connected ? ` · ${formatLastSync(a.lastSyncedAt)}` : ""}
                    </small>
                  </div>
                  <span className={`${styles.tag} ${a.accountType === "CENT" ? styles.cent : ""}`}>{a.accountType === "CENT" ? "CENT" : "NORMAL"}</span>
                  {!a.ibActive && <span className={styles.tag}>Pendiente</span>}
                  <button
                    type="button"
                    className={styles.btn}
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => (editingAccountId === a.id ? cancelEditAccount() : startEditAccount(a))}
                  >
                    {editingAccountId === a.id ? "CANCELAR" : "EDITAR MT5"}
                  </button>
                </div>
                {editingAccountId === a.id && (
                  <div className={styles.card} style={{ marginLeft: 24 }}>
                    <p style={{ fontSize: 13, color: "var(--textDim)" }}>
                      Login investor: el número de login investor de MT5 (no un email). Contraseña investor: déjala en
                      blanco si no la quieres cambiar.
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label className={styles.label}>Servidor MT5</label>
                        <input
                          className={styles.input}
                          type="text"
                          value={editMt5Server}
                          onChange={(e) => setEditMt5Server(e.target.value)}
                          disabled={savingEdit}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label className={styles.label}>Login investor</label>
                        <input
                          className={styles.input}
                          type="text"
                          value={editInvestorLogin}
                          onChange={(e) => setEditInvestorLogin(e.target.value)}
                          disabled={savingEdit}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label className={styles.label}>Contraseña investor (nueva)</label>
                        <input
                          className={styles.input}
                          type="password"
                          value={editInvestorPassword}
                          onChange={(e) => setEditInvestorPassword(e.target.value)}
                          disabled={savingEdit}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={savingEdit}
                        onClick={() => saveEditAccount(a.id)}
                      >
                        {savingEdit ? "GUARDANDO…" : "GUARDAR"}
                      </button>
                      {a.mt5Connected && (
                        <button
                          type="button"
                          className={styles.btn}
                          disabled={savingEdit}
                          onClick={() => {
                            if (confirm("¿Quitar la conexión MT5 de esta cuenta? Dejará de sincronizarse automáticamente.")) {
                              disconnectMt5Account(a.id);
                            }
                          }}
                        >
                          QUITAR MT5
                        </button>
                      )}
                    </div>
                    {editError && <div className={styles.errorMsg}>{editError}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


