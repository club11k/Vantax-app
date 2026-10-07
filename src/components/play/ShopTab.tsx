"use client";

import { useEffect, useState } from "react";
import styles from "@/components/play/arcade.module.css";
import { CoinIcon, LockIcon } from "@/components/play/PixelIcons";

// Pestaña TIENDA de Vantax Play (07/10/2026): lista los artículos activos del
// catálogo que el admin crea en /admin/play-config y deja canjearlos con
// V-COIN. El cobro y el registro del pedido se hacen en /api/play/shop/redeem.

type Category = "MERCH" | "MENTORIA" | "CASHBACK";
type Article = { id: string; name: string; category: Category; price: number; imageUrl: string | null };
type HistoryRow = { id: string; name: string; price: number; status: string; done: boolean; date: string };
type ShopData = { balance: number; wallet: string; network: "TRC20" | "BEP20"; articles: Article[]; history: HistoryRow[] };

const CAT: Record<Category, { label: string; icon: string; from: string; to: string }> = {
  CASHBACK: { label: "Cashback", icon: "💵", from: "#065F46", to: "#1E1B4B" },
  MERCH: { label: "Merch", icon: "🧢", from: "#9D174D", to: "#312E81" },
  MENTORIA: { label: "Mentoría", icon: "🎓", from: "#A16207", to: "#3B0764" },
};

function fmt(n: number) {
  return Math.round(n).toLocaleString("es-ES");
}

export function ShopTab({ onBalanceChange, onGoProfile }: { onBalanceChange?: () => void; onGoProfile?: () => void }) {
  const [data, setData] = useState<ShopData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"ALL" | Category>("ALL");
  // Ventana de canje: para cashback, el jugador elige dónde cobrarlo.
  const [pending, setPending] = useState<Article | null>(null);
  const [method, setMethod] = useState<"WALLET" | "BROKER" | null>(null);
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState<"TRC20" | "BEP20">("TRC20");
  const [uid, setUid] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/play/shop", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "No se pudo cargar la tienda.");
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("No se pudo cargar la tienda. Prueba de nuevo.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openRedeem(a: Article) {
    if (!data) return;
    setPending(a);
    setMethod(null);
    setWallet(data.wallet ?? "");
    setNetwork(data.network ?? "TRC20");
    setUid("");
    setFormError(null);
    setMessage(null);
  }

  async function confirmRedeem() {
    const a = pending;
    if (!a || !data) return;
    let payment: any = undefined;
    if (a.category === "CASHBACK") {
      if (!method) return setFormError("Elige dónde quieres recibir tu cashback.");
      if (method === "WALLET") {
        const w = wallet.trim();
        if (w.length < 20 || /\s/.test(w)) return setFormError("Escribe una dirección de wallet válida.");
        payment = { method, wallet: w, network };
      } else {
        if (!uid.trim()) return setFormError("Escribe tu UID del broker.");
        payment = { method, uid: uid.trim() };
      }
    }
    setFormError(null);
    setBusyId(a.id);
    try {
      const res = await fetch("/api/play/shop/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: a.id, payment }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "No se pudo completar el canje.");
        return;
      }
      setPending(null);
      setMessage({
        ok: true,
        text:
          a.category === "CASHBACK"
            ? `¡Canje hecho! Te pagaremos «${a.name}» ${method === "WALLET" ? "en tu wallet" : "a través del broker"} lo antes posible.`
            : `¡Canje hecho! «${a.name}» queda pendiente de entrega. Nos pondremos en contacto contigo.`,
      });
      onBalanceChange?.();
      await load();
    } catch {
      setFormError("No se pudo completar el canje. Prueba de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div className={styles.card}><div className={styles.errorMsg}>{error}</div></div>;
  if (!data) return <div className={styles.card}>Cargando la tienda…</div>;

  const cats = Array.from(new Set(data.articles.map((a) => a.category)));
  const list = filter === "ALL" ? data.articles : data.articles.filter((a) => a.category === filter);

  return (
    <>
      <div className={styles.card}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <h3 className={styles.sectionTitle} style={{ margin: 0 }}>TIENDA</h3>
          <span className={styles.shopBalance}>
            <CoinIcon size={22} className={styles.coinSpin} />
            <span className={styles.pixel}>{fmt(data.balance)}</span>
            <span style={{ fontSize: 12, color: "var(--textDim)" }}>V-COIN disponibles</span>
          </span>
        </div>

        {cats.length > 1 && (
          <div className={styles.leagueTabs} role="tablist" aria-label="Categorías" style={{ marginBottom: 16 }}>
            {(["ALL", ...cats] as ("ALL" | Category)[]).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={filter === c}
                className={`${styles.leagueBtn} ${filter === c ? styles.active : ""}`}
                style={{ minHeight: 46 }}
                onClick={() => setFilter(c)}
              >
                <b>{c === "ALL" ? "Todo" : CAT[c].label}</b>
              </button>
            ))}
          </div>
        )}

        {message && (
          <div className={message.ok ? styles.shopOk : styles.errorMsg} style={{ marginBottom: 14 }}>
            {message.text}
          </div>
        )}

        {list.length === 0 ? (
          <div className={styles.emptyLeague}>
            <span className={styles.pixel} style={{ fontSize: 16, color: "#C4B5FD" }}>Tienda vacía</span>
            <span style={{ fontSize: 13, color: "var(--textDim)" }}>Todavía no hay artículos disponibles. ¡Vuelve pronto!</span>
          </div>
        ) : (
          <div className={styles.shopGrid}>
            {list.map((a) => {
              const c = CAT[a.category];
              const missing = Math.max(0, Math.round(a.price) - data.balance);
              const affordable = missing === 0;
              const pct = Math.min(100, (data.balance / Math.max(1, a.price)) * 100);
              return (
                <div key={a.id} className={`${styles.shopCard} ${affordable ? styles.shopAffordable : ""}`}>
                  <div className={styles.shopMedia} style={a.imageUrl ? undefined : { background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
                    {a.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className={styles.shopIcon}>{c.icon}</span>
                    )}
                    <span className={styles.shopCat}>{c.label}</span>
                  </div>
                  <div className={styles.shopBody}>
                    <span className={styles.shopName}>{a.name}</span>
                    <span className={styles.shopPrice}>
                      <CoinIcon size={18} />
                      {fmt(a.price)}
                    </span>
                    {!affordable && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div className={styles.shopProgress}>
                          <span style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--textDim)" }}>Te faltan {fmt(missing)} V-COIN</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.btn}
                      style={{ marginTop: "auto", width: "100%" }}
                      disabled={!affordable || busyId !== null}
                      onClick={() => openRedeem(a)}
                    >
                      {busyId === a.id ? "CANJEANDO…" : affordable ? "CANJEAR" : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <LockIcon /> BLOQUEADO
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pending && (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={() => busyId === null && setPending(null)}>
          <div className={`${styles.card} ${styles.shopModal}`} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>CANJEAR</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <span className={styles.shopName}>{pending.name}</span>
              <span className={styles.shopPrice}>
                <CoinIcon size={18} />
                {fmt(pending.price)}
              </span>
            </div>

            {pending.category === "CASHBACK" ? (
              <>
                <p style={{ margin: "0 0 10px", fontSize: 15 }}>¿Dónde quieres recibir tu cashback?</p>
                <div className={styles.shopMethods}>
                  <button
                    type="button"
                    className={`${styles.shopMethod} ${method === "WALLET" ? styles.active : ""}`}
                    onClick={() => setMethod("WALLET")}
                  >
                    <b>💳 Wallet USDT</b>
                    <span>Te lo enviamos a tu dirección</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.shopMethod} ${method === "BROKER" ? styles.active : ""}`}
                    onClick={() => setMethod("BROKER")}
                  >
                    <b>🏦 A través del broker</b>
                    <span>Te lo ingresamos en tu cuenta</span>
                  </button>
                </div>

                {method === "WALLET" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label className={styles.label}>Dirección de tu wallet</label>
                      <input className={styles.input} type="text" placeholder="Pega aquí tu dirección USDT" value={wallet} onChange={(e) => setWallet(e.target.value)} />
                    </div>
                    <div>
                      <label className={styles.label}>Red</label>
                      <select className={styles.input} value={network} onChange={(e) => setNetwork(e.target.value as "TRC20" | "BEP20")}>
                        <option value="TRC20">TRC20</option>
                        <option value="BEP20">BEP20</option>
                      </select>
                    </div>
                  </div>
                )}
                {method === "BROKER" && (
                  <div style={{ marginTop: 12 }}>
                    <label className={styles.label}>Tu UID del broker</label>
                    <input className={styles.input} type="text" placeholder="Ej: 12345678" value={uid} onChange={(e) => setUid(e.target.value)} />
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 15, color: "var(--textDim)" }}>
                Se descontarán {fmt(pending.price)} V-COIN de tu saldo y nos pondremos en contacto contigo para la entrega.
              </p>
            )}

            {formError && <div className={styles.errorMsg} style={{ marginTop: 12 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} style={{ flex: 1 }} disabled={busyId !== null} onClick={() => setPending(null)}>
                CANCELAR
              </button>
              <button
                type="button"
                className={styles.btn}
                style={{ flex: 1 }}
                disabled={busyId !== null || (pending.category === "CASHBACK" && !method)}
                onClick={confirmRedeem}
              >
                {busyId ? "CANJEANDO…" : "CONFIRMAR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {data.history.length > 0 && (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>MIS CANJES</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>V-COIN</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id}>
                  <td>
                    {h.name}
                    <div style={{ fontSize: 11, color: "var(--textDim)" }}>{new Date(h.date).toLocaleDateString("es-ES")}</div>
                  </td>
                  <td>{fmt(h.price)}</td>
                  <td style={{ color: h.done ? "#C4B5FD" : "#FACC15" }}>{h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
