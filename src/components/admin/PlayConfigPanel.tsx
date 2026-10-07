"use client";

import { useState, useTransition } from "react";
import {
  updateVCoinRate,
  updateTierGoal,
  updateChest,
  upsertChestLoot,
  deleteChestLoot,
  createArticle,
  toggleArticleActive,
  updateArticle,
  markPayoutPaid,
  markShopOrderDelivered,
} from "@/app/admin/play-config-actions";

type PlayTierValue = "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO";
const TIER_LABEL: Record<PlayTierValue, string> = {
  BASICO: "Básico",
  INTERMEDIO: "Intermedio",
  EPICO: "Épico",
  LEGENDARIO: "Legendario",
};

type Article = { id: string; name: string; category: "MERCH" | "MENTORIA" | "CASHBACK"; price: number; imageUrl: string | null; active: boolean };
type LootRow = { id: string; chestId: string; articleId: string; probability: number; article: { id: string; name: string } };
type TierRow = {
  tier: PlayTierValue;
  goal: { lotsTarget: number; daysLimit: number };
  chest: { id: string | null; label: string; unlockCondition: string; vcoinReward: number; extraReward: string | null; active: boolean };
  loot: LootRow[];
};
type PayoutRow = {
  id: string;
  userEmail: string;
  userName: string | null;
  amountVCoin: number;
  network: "TRC20" | "BEP20";
  wallet: string;
  requestedAt?: string;
  txHash?: string | null;
  paidAt?: string | null;
  note?: string | null;
};
type ShopOrderRow = { id: string; userEmail: string; userName: string | null; articleName: string; price: number; createdAt: string };

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{title}</h3>
      {help && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>{help}</p>}
      {children}
    </div>
  );
}

// --- Tasa de V-COIN por lote ---

function VCoinRateForm({ vcoinRatePerLot, centFactor }: { vcoinRatePerLot: number; centFactor: number }) {
  const [rate, setRate] = useState(String(vcoinRatePerLot));
  const [factor, setFactor] = useState(String(centFactor));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      await updateVCoinRate(Number(rate), Number(factor));
      setSaved(true);
    });
  }

  const centRate = (Number(rate) || 0) * (Number(factor) || 0);

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label>
        V-COIN por lote (cuenta normal)
        <input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} disabled={isPending} />
      </label>
      <label>
        Factor cuenta Cent (multiplica a la tasa normal)
        <input type="number" step="0.0001" min="0" value={factor} onChange={(e) => setFactor(e.target.value)} disabled={isPending} />
      </label>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", paddingBottom: 8 }}>
        → {centRate.toFixed(4)} V-COIN por lote Cent
      </div>
      <button className="btn btn-primary" type="submit" disabled={isPending}>
        {isPending ? "Guardando…" : "Guardar tasa"}
      </button>
      {saved && !isPending && <span style={{ color: "var(--up)", fontSize: 12.5 }}>Guardado.</span>}
    </form>
  );
}

// --- Umbrales de tramo + cofre + premios de un tramo ---

function TierGoalRow({ row }: { row: TierRow }) {
  const [lotsTarget, setLotsTarget] = useState(String(row.goal.lotsTarget));
  const [daysLimit, setDaysLimit] = useState(String(row.goal.daysLimit));
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateTierGoal(row.tier, Number(lotsTarget), Number(daysLimit));
    });
  }

  return (
    <tr>
      <td>{TIER_LABEL[row.tier]}</td>
      <td>
        <input type="number" step="0.01" min="0" value={lotsTarget} onChange={(e) => setLotsTarget(e.target.value)} disabled={isPending} style={{ width: 100 }} />
      </td>
      <td>
        <input type="number" step="1" min="0" value={daysLimit} onChange={(e) => setDaysLimit(e.target.value)} disabled={isPending} style={{ width: 80 }} />
      </td>
      <td>
        <button className="btn" onClick={save} disabled={isPending}>
          {isPending ? "…" : "Guardar"}
        </button>
      </td>
    </tr>
  );
}

// --- Cofre de un tramo (label, condición, premio, activo) + loot table ---

function ChestCard({ row, articles }: { row: TierRow; articles: Article[] }) {
  const [label, setLabel] = useState(row.chest.label);
  const [unlockCondition, setUnlockCondition] = useState(row.chest.unlockCondition);
  const [vcoinReward, setVcoinReward] = useState(String(row.chest.vcoinReward));
  const [extraReward, setExtraReward] = useState(row.chest.extraReward ?? "");
  const [active, setActive] = useState(row.chest.active);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [lootArticleId, setLootArticleId] = useState(articles[0]?.id ?? "");
  const [lootProbability, setLootProbability] = useState("10");
  const [lootPending, startLootTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateChest({
        tier: row.tier,
        label,
        unlockCondition,
        vcoinReward: Number(vcoinReward),
        extraReward,
        active,
      });
      setSaved(true);
    });
  }

  function addLoot() {
    if (!row.chest.id || !lootArticleId) return;
    startLootTransition(async () => {
      await upsertChestLoot(row.chest.id as string, lootArticleId, Number(lootProbability));
    });
  }

  function removeLoot(id: string) {
    startLootTransition(async () => {
      await deleteChestLoot(id);
    });
  }

  return (
    <div style={{ border: "1px solid var(--line)", padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <b>{TIER_LABEL[row.tier]}</b>
        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={isPending} />
          Cofre activo
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 200px" }}>
          Nombre del cofre
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} disabled={isPending} />
        </label>
        <label style={{ flex: "1 1 200px" }}>
          Condición de desbloqueo (texto libre)
          <input
            type="text"
            placeholder='Ej: "10 lotes/mes" o "Top 3 ranking mensual"'
            value={unlockCondition}
            onChange={(e) => setUnlockCondition(e.target.value)}
            disabled={isPending}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label>
          V-COIN garantizado al abrir
          <input type="number" step="1" min="0" value={vcoinReward} onChange={(e) => setVcoinReward(e.target.value)} disabled={isPending} style={{ width: 120 }} />
        </label>
        <label style={{ flex: "1 1 200px" }}>
          Premio extra (badge/sorpresa, opcional)
          <input type="text" value={extraReward} onChange={(e) => setExtraReward(e.target.value)} disabled={isPending} />
        </label>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={isPending} style={{ marginTop: 8 }}>
        {isPending ? "Guardando…" : "Guardar cofre"}
      </button>
      {saved && !isPending && <span style={{ color: "var(--up)", fontSize: 12.5, marginLeft: 8 }}>Guardado.</span>}
      {!row.chest.id && (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>
          Guarda el cofre primero para poder añadirle artículos de premio extra abajo.
        </p>
      )}

      {row.chest.id && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>
            Probabilidad de artículo extra al abrir este cofre (además del V-COIN garantizado):
          </div>
          {row.loot.length > 0 && (
            <table style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Probabilidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row.loot.map((l) => (
                  <tr key={l.id}>
                    <td>{l.article.name}</td>
                    <td>{l.probability}%</td>
                    <td>
                      <button className="btn btn-danger" disabled={lootPending} onClick={() => removeLoot(l.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {articles.length > 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label>
                Artículo
                <select value={lootArticleId} onChange={(e) => setLootArticleId(e.target.value)} disabled={lootPending}>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Probabilidad %
                <input type="number" min="0" max="100" value={lootProbability} onChange={(e) => setLootProbability(e.target.value)} disabled={lootPending} style={{ width: 90 }} />
              </label>
              <button className="btn" onClick={addLoot} disabled={lootPending}>
                {lootPending ? "…" : "Añadir"}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Crea antes algún artículo en el catálogo, más abajo.</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Catálogo de artículos ---

// Reduce la foto en el navegador (máx. 600 px, JPEG) para guardarla junto al
// artículo sin necesitar un servidor de imágenes aparte.
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      img.onload = () => {
        const max = 600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
        ctx.fillStyle = "#14121f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function ImageField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const isData = value.startsWith("data:");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 240px" }}>
      <span>Imagen (opcional)</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border, #333)" }} />
        )}
        <label className="btn" style={{ cursor: disabled ? "default" : "pointer", margin: 0 }}>
          📷 Subir foto
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setErr(null);
                onChange(await resizeImage(f));
              } catch (ex: any) {
                setErr(ex?.message ?? "No se pudo cargar la imagen.");
              }
            }}
          />
        </label>
        {value && (
          <button type="button" className="btn" disabled={disabled} onClick={() => onChange("")}>
            Quitar
          </button>
        )}
      </div>
      <input
        type="text"
        placeholder="…o pega la URL de una imagen"
        value={isData ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {isData && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Foto subida desde tu ordenador.</span>}
      {err && <span style={{ fontSize: 11, color: "#F472B6" }}>{err}</span>}
    </div>
  );
}

function ArticleForm() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MERCH" | "MENTORIA" | "CASHBACK">("MERCH");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !(Number(price) >= 0)) return;
    startTransition(async () => {
      await createArticle({ name: name.trim(), category, price: Number(price), imageUrl: imageUrl.trim() });
      setName("");
      setPrice("");
      setImageUrl("");
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
      <label style={{ flex: "1 1 180px" }}>
        Nombre
        <input type="text" placeholder="Ej: Gorra Club 11K" value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
      </label>
      <label>
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value as any)} disabled={isPending}>
          <option value="MERCH">Merch</option>
          <option value="MENTORIA">Mentoría</option>
          <option value="CASHBACK">Cashback</option>
        </select>
      </label>
      <label>
        Precio (V-COIN)
        <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} disabled={isPending} style={{ width: 110 }} />
      </label>
      <ImageField value={imageUrl} onChange={setImageUrl} disabled={isPending} />
      <button className="btn btn-primary" type="submit" disabled={isPending || !name.trim()}>
        {isPending ? "Añadiendo…" : "+ Añadir artículo"}
      </button>
    </form>
  );
}

function ArticleRow({ article }: { article: Article }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(article.name);
  const [category, setCategory] = useState(article.category);
  const [price, setPrice] = useState(String(article.price));
  const [imageUrl, setImageUrl] = useState(article.imageUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setName(article.name);
    setCategory(article.category);
    setPrice(String(article.price));
    setImageUrl(article.imageUrl ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    if (!name.trim() || !(Number(price) >= 0)) {
      setError("Pon un nombre y un precio válido.");
      return;
    }
    startTransition(async () => {
      try {
        await updateArticle(article.id, { name: name.trim(), category, price: Number(price), imageUrl });
        setEditing(false);
      } catch (e: any) {
        setError(e?.message ?? "No se pudo guardar.");
      }
    });
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 180px" }}>
              Nombre
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
            </label>
            <label>
              Categoría
              <select value={category} onChange={(e) => setCategory(e.target.value as any)} disabled={isPending}>
                <option value="MERCH">Merch</option>
                <option value="MENTORIA">Mentoría</option>
                <option value="CASHBACK">Cashback</option>
              </select>
            </label>
            <label>
              Precio (V-COIN)
              <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} disabled={isPending} style={{ width: 110 }} />
            </label>
            <ImageField value={imageUrl} onChange={setImageUrl} disabled={isPending} />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary" type="button" disabled={isPending} onClick={save}>
                {isPending ? "Guardando…" : "Guardar"}
              </button>
              <button className="btn" type="button" disabled={isPending} onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
          {error && <div style={{ color: "#F472B6", fontSize: 12, marginTop: 6 }}>{error}</div>}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {article.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
          ) : (
            <span style={{ width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(167,139,250,0.12)", fontSize: 11, color: "var(--text-dim)" }}>
              sin foto
            </span>
          )}
          <span>{article.name}</span>
        </div>
      </td>
      <td>{article.category}</td>
      <td>{article.price} V-COIN</td>
      <td>
        <span className={`tag ${article.active ? "pos" : "neu"}`}>{article.active ? "Activo" : "Inactivo"}</span>
      </td>
      <td>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn" disabled={isPending} onClick={startEdit}>
            Editar
          </button>
          <button
            className={`btn ${article.active ? "btn-danger" : ""}`}
            disabled={isPending}
            onClick={() => startTransition(() => toggleArticleActive(article.id, !article.active))}
          >
            {article.active ? "Desactivar" : "Activar"}
          </button>
        </div>
      </td>
    </tr>
  );
}

// --- Pagos pendientes ---

function PayoutRowItem({ payout }: { payout: PayoutRow }) {
  const [txHash, setTxHash] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <tr>
      <td>
        <div>{payout.userEmail}</div>
        {payout.userName && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{payout.userName}</div>}
      </td>
      <td>
        {payout.note && <div style={{ fontWeight: 600 }}>Pagar: {payout.note}</div>}
        <div style={{ color: payout.note ? "var(--text-dim)" : undefined, fontSize: payout.note ? 11 : undefined }}>{payout.amountVCoin} V-COIN</div>
      </td>
      <td>{payout.network}</td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all", maxWidth: 220 }}>{payout.wallet}</td>
      <td>{payout.requestedAt ? new Date(payout.requestedAt).toLocaleDateString("es-ES") : "—"}</td>
      <td>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Hash de la tx (opcional)"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            disabled={isPending}
            style={{ width: 160 }}
          />
          <button
            className="btn btn-primary"
            disabled={isPending}
            onClick={() => startTransition(() => markPayoutPaid(payout.id, txHash))}
          >
            {isPending ? "…" : "Marcar pagado"}
          </button>
        </div>
      </td>
    </tr>
  );
}

// --- Pedidos de la Tienda ---

function ShopOrderRowItem({ order }: { order: ShopOrderRow }) {
  const [isPending, startTransition] = useTransition();
  return (
    <tr>
      <td>
        <div>{order.userEmail}</div>
        {order.userName && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{order.userName}</div>}
      </td>
      <td>{order.articleName}</td>
      <td>{Math.round(order.price)} V-COIN</td>
      <td>{new Date(order.createdAt).toLocaleDateString("es-ES")}</td>
      <td>
        <button className="btn btn-primary" disabled={isPending} onClick={() => startTransition(() => markShopOrderDelivered(order.id))}>
          {isPending ? "…" : order.articleName.endsWith(" · pago por broker") ? "Marcar pagado" : "Marcar entregado"}
        </button>
      </td>
    </tr>
  );
}

export function PlayConfigPanel({
  config,
  tiers,
  articles,
  payoutsPending,
  payoutsPaid,
  shopOrders,
}: {
  config: { vcoinRatePerLot: number; centFactor: number };
  tiers: TierRow[];
  articles: Article[];
  payoutsPending: PayoutRow[];
  payoutsPaid: PayoutRow[];
  shopOrders: ShopOrderRow[];
}) {
  return (
    <>
      <Section title="Tasa de V-COIN por lote" help="Es la tasa fija que usa el cálculo automático cada vez que sincroniza una cuenta.">
        <VCoinRateForm vcoinRatePerLot={config.vcoinRatePerLot} centFactor={config.centFactor} />
      </Section>

      <Section title="Umbrales de tramo" help="Lotes de XAUUSD necesarios para completar cada tramo de la barra de Progreso del Trader, y el máximo de días del ciclo (informativo por ahora, no fuerza un reinicio automático).">
        <table>
          <thead>
            <tr>
              <th>Tramo</th>
              <th>Lotes objetivo</th>
              <th>Días límite</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((row) => (
              <TierGoalRow key={row.tier} row={row} />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Cofres y premios por tramo" help="Un cofre por tramo. El V-COIN se acredita siempre al abrirlo; el artículo extra sale por probabilidad, tirada al abrir.">
        {tiers.map((row) => (
          <ChestCard key={row.tier} row={row} articles={articles.filter((a) => a.active)} />
        ))}
      </Section>

      <Section title="Catálogo de artículos" help="Los artículos activos aparecen en la Tienda de Vantax Play y se canjean con V-COIN; también pueden salir como premio extra de un cofre. Los Cashback se pagan en USDT si el jugador tiene wallet (Pagos pendientes) o por broker si no la tiene (Pedidos de la tienda); Merch y Mentoría van a Pedidos de la tienda.">
        <ArticleForm />
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
            {articles.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                  Todavía no hay artículos en el catálogo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title={`Pagos pendientes (${payoutsPending.length})`} help="Canjes de Cashback de la Tienda (y solicitudes de V-COIN por USDT) esperando pago manual en TRC20/BEP20. «Pagar» indica lo que hay que enviar.">
        <table>
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Cantidad</th>
              <th>Red</th>
              <th>Wallet</th>
              <th>Pedido</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {payoutsPending.map((p) => (
              <PayoutRowItem key={p.id} payout={p} />
            ))}
            {payoutsPending.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                  Sin pagos pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title={`Pedidos de la tienda (${shopOrders.length})`} help="Artículos de Merch o Mentoría que falta entregar, y Cashback de jugadores sin wallet (marcados «pago por broker») que hay que pagar a través del broker. El V-COIN ya se ha descontado al jugador.">
        <table>
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Artículo</th>
              <th>Precio</th>
              <th>Pedido</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {shopOrders.map((o) => (
              <ShopOrderRowItem key={o.id} order={o} />
            ))}
            {shopOrders.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                  Sin pedidos pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {payoutsPaid.length > 0 && (
        <Section title="Últimos pagos realizados">
          <table>
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Cantidad</th>
                <th>Red</th>
                <th>Hash</th>
                <th>Pagado</th>
              </tr>
            </thead>
            <tbody>
              {payoutsPaid.map((p) => (
                <tr key={p.id}>
                  <td>{p.userEmail}</td>
                  <td>{p.note ? `${p.note} (${p.amountVCoin} V-COIN)` : `${p.amountVCoin} V-COIN`}</td>
                  <td>{p.network}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all", maxWidth: 220 }}>{p.txHash || "—"}</td>
                  <td>{p.paidAt ? new Date(p.paidAt).toLocaleDateString("es-ES") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
}

