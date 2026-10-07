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
type ShopData = { balance: number; hasWallet: boolean; articles: Article[]; history: HistoryRow[] };

const CAT: Record<Category, { label: string; icon: string; from: string; to: string }> = {
  CASHBACK: { label: "Cashback", icon: "💵", from: "#065F46", to: "#1E1B4B" },
  MERCH: { label: "Merch", icon: "🧢", from: "#9D174D", to: "#312E81" },
  MENTORIA: { label: "Mentoría", icon: "🎓", from: "#A16207", to: "#3B0764" },
};

function fmt(n: number) {
  return Math.round(n).toLocaleString("es-ES");
}

export function ShopTab({ onBalanceChange }: { onBalanceChange?: () => void }) {
  const [data, setData] = useState<ShopData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"ALL" | Category>("ALL");

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

  async function redeem(a: Article) {
    if (!data) return;
    const extra = a.category === "CASHBACK" ? " Te lo pagaremos en USDT a la wallet de tu perfil." : " Nos pondremos en contacto contigo para la entrega.";
    if (!confirm(`¿Canjear «${a.name}» por ${fmt(a.price)} V-COIN?${extra}`)) return;
    setBusyId(a.id);
    setMessage(null);
    try {
      const res = await fetch("/api/play/shop/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: a.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: json.error ?? "No se pudo completar el canje." });
      } else {
        setMessage({
          ok: true,
          text:
            a.category === "CASHBACK"
              ? `¡Canje hecho! «${a.name}» queda pendiente de pago a tu wallet.`
              : `¡Canje hecho! «${a.name}» queda pendiente de entrega.`,
        });
        onBalanceChange?.();
      }
      await load();
    } catch {
      setMessage({ ok: false, text: "No se pudo completar el canje. Prueba de nuevo." });
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
              const needsWallet = a.category === "CASHBACK" && !data.hasWallet;
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
                    {needsWallet && affordable && (
                      <span style={{ fontSize: 12, color: "#FACC15" }}>Añade tu wallet USDT en Perfil para canjearlo.</span>
                    )}
                    <button
                      type="button"
                      className={styles.btn}
                      style={{ marginTop: "auto", width: "100%" }}
                      disabled={!affordable || needsWallet || busyId !== null}
                      onClick={() => redeem(a)}
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
