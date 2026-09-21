"use client";

import { useMemo, useState, useTransition } from "react";
import { toggleIbActive, giftChest } from "@/app/admin/actions";

type PlayTierValue = "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO";

type PlayerRow = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  vCoinBalance: number;
  brokerName: string;
  accountNumber: string;
  accountType: "NORMAL" | "CENT";
  accountTypeVerified: boolean;
  balance: number;
  equity: number;
  ibActive: boolean;
  mt5Connected: boolean;
  lastSyncedAt: string | null;
  lotsThisMonth: number;
  profitPctThisMonth: number;
  progressTier: PlayTierValue | null;
  progressCycleLots: number | null;
  progressTierTarget: number | null;
};

type ArticleOption = { id: string; name: string };

const TIER_ORDER: PlayTierValue[] = ["BASICO", "INTERMEDIO", "EPICO", "LEGENDARIO"];
const TIER_LABEL: Record<PlayTierValue, string> = {
  BASICO: "Básico",
  INTERMEDIO: "Intermedio",
  EPICO: "Épico",
  LEGENDARIO: "Legendario",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

// Regalar un cofre a un jugador concreto — ventana pequeña con el tramo, el
// tipo de premio (V-COIN suelto o un artículo del catálogo) y la cantidad.
function GiftChestModal({
  userId,
  userLabel,
  articles,
  onClose,
}: {
  userId: string;
  userLabel: string;
  articles: ArticleOption[];
  onClose: () => void;
}) {
  const [tier, setTier] = useState<PlayTierValue>("BASICO");
  const [rewardType, setRewardType] = useState<"VCOIN" | "ARTICLE">("VCOIN");
  const [amount, setAmount] = useState("");
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rewardType === "VCOIN") {
      const parsed = Number(amount);
      if (!(parsed > 0)) {
        setError("Indica una cantidad de V-COIN mayor que 0.");
        return;
      }
      startTransition(async () => {
        try {
          await giftChest(userId, tier, { type: "VCOIN", amount: parsed });
          setDone(true);
        } catch {
          setError("No se pudo regalar el cofre. Prueba de nuevo.");
        }
      });
    } else {
      if (!articleId) {
        setError("Elige un artículo del catálogo.");
        return;
      }
      startTransition(async () => {
        try {
          await giftChest(userId, tier, { type: "ARTICLE", articleId });
          setDone(true);
        } catch {
          setError("No se pudo regalar el cofre. Prueba de nuevo.");
        }
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 3, 10, 0.8)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>Regalar cofre a {userLabel}</h3>

        {done ? (
          <>
            <p style={{ fontSize: 13, color: "var(--up)", margin: 0 }}>
              Cofre regalado. Le aparecerá pendiente de abrir en su panel de Vantax Play.
            </p>
            <button className="btn btn-primary" onClick={onClose}>
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Tramo
              <select value={tier} onChange={(e) => setTier(e.target.value as PlayTierValue)} disabled={isPending}>
                {TIER_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Premio
              <select value={rewardType} onChange={(e) => setRewardType(e.target.value as "VCOIN" | "ARTICLE")} disabled={isPending}>
                <option value="VCOIN">V-COIN suelto</option>
                <option value="ARTICLE">Artículo del catálogo</option>
              </select>
            </label>
            {rewardType === "VCOIN" ? (
              <label>
                Cantidad de V-COIN
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isPending}
                />
              </label>
            ) : (
              <label>
                Artículo
                <select value={articleId} onChange={(e) => setArticleId(e.target.value)} disabled={isPending || articles.length === 0}>
                  {articles.length === 0 && <option value="">No hay artículos activos en el catálogo</option>}
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && <div className="error-msg">{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={isPending}>
                {isPending ? "Regalando…" : "Regalar cofre"}
              </button>
              <button className="btn" type="button" onClick={onClose} disabled={isPending}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PlayerRowItem({ row, articles }: { row: PlayerRow; articles: ArticleOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [gifting, setGifting] = useState(false);

  return (
    <tr>
      <td>
        <div>{row.userEmail}</div>
        {row.userName && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{row.userName}</div>}
      </td>
      <td>
        <div>{row.brokerName}</div>
        <div style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{row.accountNumber}</div>
      </td>
      <td>
        {row.accountType === "CENT" ? "Cent" : "Normal"}
        {!row.accountTypeVerified && (
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}> (sin confirmar)</span>
        )}
      </td>
      <td>
        {row.mt5Connected ? (
          <>
            <span className="tag pos">MT5 conectado</span>
            <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>Última sync: {fmtDate(row.lastSyncedAt)}</div>
          </>
        ) : (
          <span className="tag neu">Sin conectar</span>
        )}
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>
        {row.balance.toFixed(2)} / {row.equity.toFixed(2)}
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>
        {row.lotsThisMonth.toFixed(2)} lotes
        <div style={{ color: row.profitPctThisMonth >= 0 ? "var(--up)" : "var(--down)", fontSize: 11 }}>
          {row.profitPctThisMonth >= 0 ? "+" : ""}
          {row.profitPctThisMonth.toFixed(2)}%
        </div>
      </td>
      <td style={{ fontFamily: "var(--font-mono)" }}>{row.vCoinBalance}</td>
      <td>
        {row.progressTier ? (
          <>
            <div>{TIER_LABEL[row.progressTier]}</div>
            <div style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
              {(row.progressCycleLots ?? 0).toFixed(2)} / {row.progressTierTarget ? row.progressTierTarget.toFixed(2) : "—"} lotes
            </div>
          </>
        ) : (
          <span className="tag neu">Sin progreso</span>
        )}
      </td>
      <td>
        <span className={`tag ${row.ibActive ? "pos" : "neg"}`}>{row.ibActive ? "Activa" : "Inactiva"}</span>
      </td>
      <td style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          className={`btn ${row.ibActive ? "btn-danger" : ""}`}
          disabled={isPending}
          onClick={() => startTransition(() => toggleIbActive(row.id, !row.ibActive))}
        >
          {row.ibActive ? "Desactivar" : "Activar"}
        </button>
        <button className="btn" onClick={() => setGifting(true)}>
          Regalar cofre
        </button>
      </td>
      {gifting && (
        <GiftChestModal
          userId={row.userId}
          userLabel={row.userName || row.userEmail}
          articles={articles}
          onClose={() => setGifting(false)}
        />
      )}
    </tr>
  );
}

export function PlayersTable({ rows, articles }: { rows: PlayerRow[]; articles: ArticleOption[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.userEmail, r.userName ?? "", r.accountNumber, r.brokerName]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="text"
        placeholder="Buscar por email, nombre, nº de cuenta o broker…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 360 }}
      />
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Broker / Cuenta</th>
              <th>Tipo</th>
              <th>Sync MT5</th>
              <th>Saldo / Equity</th>
              <th>Lotaje XAUUSD (mes)</th>
              <th>V-COIN total</th>
              <th>Progreso</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <PlayerRowItem key={row.id} row={row} articles={articles} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

