"use client";

import { useMemo, useState } from "react";

type Currency = "EUR" | "USD" | "CENT";
type Source = "MANUAL" | "AI_PHOTO";

type Account = {
  accountUid: string;
  currency: Currency;
  initialBalance: number;
};

type Entry = {
  id: string;
  date: string; // "YYYY-MM-DD"
  resultAmount: number;
  source: Source;
  imageNote?: string | null;
};

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: "EUR", label: "Euros (€)" },
  { value: "USD", label: "Dólares (US$)" },
  { value: "CENT", label: "Cuenta cent (¢)" },
];

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", CENT: "¢" };

function formatMoney(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "CENT" ? `${sign}${abs} ${symbol}` : `${sign}${symbol}${abs}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileToBase64(file: File): Promise<{ mediaType: string; base64Data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      const meta = result.substring(5, result.indexOf(";"));
      const base64Data = result.substring(commaIdx + 1);
      resolve({ mediaType: meta, base64Data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildLinePath(values: number[], width: number, height: number, padding: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = padding + (height - padding * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${points.join(" L ")}`;
}

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  background: "var(--bg-panel-raised)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  color: "var(--text)",
};

export function JournalDashboard({
  initialAccount,
  initialEntries,
}: {
  initialAccount: Account | null;
  initialEntries: Entry[];
}) {
  const [account, setAccount] = useState<Account | null>(initialAccount);
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [editingSetup, setEditingSetup] = useState(!initialAccount);

  // --- Formulario de configuración (saldo inicial / UID / moneda) ---
  const [setupUid, setSetupUid] = useState(initialAccount?.accountUid ?? "");
  const [setupCurrency, setSetupCurrency] = useState<Currency>(initialAccount?.currency ?? "USD");
  const [setupBalance, setSetupBalance] = useState(
    initialAccount ? String(initialAccount.initialBalance) : ""
  );
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  async function saveSetup() {
    setSetupError(null);
    const balanceNum = parseFloat(setupBalance.replace(",", "."));
    if (!setupUid.trim()) {
      setSetupError("El UID de la cuenta es obligatorio.");
      return;
    }
    if (!Number.isFinite(balanceNum)) {
      setSetupError("El saldo inicial no es un número válido.");
      return;
    }
    setSetupLoading(true);
    try {
      const res = await fetch("/api/journal/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountUid: setupUid.trim(), currency: setupCurrency, initialBalance: balanceNum }),
      });
      const data = await res.json().catch(() => ({}));
      setSetupLoading(false);
      if (!res.ok) {
        setSetupError(data.error ?? "No se pudo guardar la configuración.");
        return;
      }
      setAccount({ accountUid: setupUid.trim(), currency: setupCurrency, initialBalance: balanceNum });
      setEditingSetup(false);
    } catch {
      setSetupLoading(false);
      setSetupError("No se pudo guardar la configuración. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  // --- Formulario de resultado manual ---
  const [manualDate, setManualDate] = useState(todayStr());
  const [manualAmount, setManualAmount] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  async function saveEntry(date: string, amount: number, source: Source, imageNote?: string) {
    const res = await fetch("/api/journal/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, resultAmount: amount, source, imageNote }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "No se pudo guardar el resultado.");
    }
    const saved: Entry = {
      id: data.entry.id,
      date: (data.entry.date as string).slice(0, 10),
      resultAmount: data.entry.resultAmount,
      source: data.entry.source,
      imageNote: data.entry.imageNote,
    };
    setEntries((prev) => {
      const rest = prev.filter((e) => e.date !== saved.date);
      return [...rest, saved].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  async function handleManualSubmit() {
    setManualError(null);
    const amountNum = parseFloat(manualAmount.replace(",", "."));
    if (!manualDate) {
      setManualError("Elige una fecha.");
      return;
    }
    if (!Number.isFinite(amountNum)) {
      setManualError("El resultado no es un número válido.");
      return;
    }
    setManualLoading(true);
    try {
      await saveEntry(manualDate, amountNum, "MANUAL");
      setManualLoading(false);
      setManualAmount("");
    } catch (err: any) {
      setManualLoading(false);
      setManualError(err?.message ?? "No se pudo guardar el resultado.");
    }
  }

  function editEntry(entry: Entry) {
    setManualDate(entry.date);
    setManualAmount(String(entry.resultAmount));
    setManualError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // --- Foto + lectura automática por IA ---
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ amount: number; confidence: string; note: string } | null>(null);
  const [proposalDate, setProposalDate] = useState(todayStr());
  const [proposalAmountText, setProposalAmountText] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  function selectPhoto(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setProposal(null);
    setPhotoError(null);
  }

  async function readPhoto() {
    if (!photoFile) return;
    setPhotoLoading(true);
    setPhotoError(null);
    setProposal(null);
    try {
      const { mediaType, base64Data } = await fileToBase64(photoFile);
      const res = await fetch("/api/journal/entries/from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType, base64Data }),
      });
      const data = await res.json().catch(() => ({}));
      setPhotoLoading(false);
      if (!res.ok) {
        setPhotoError(data.error ?? "No se pudo leer la imagen.");
        return;
      }
      if (!data.found) {
        setPhotoError(data.reason ?? "La IA no pudo leer un resultado claro en esta foto. Prueba con otra imagen o ingresa el resultado a mano.");
        return;
      }
      setProposal({ amount: data.amount, confidence: data.confidence, note: data.note });
      setProposalAmountText(String(data.amount));
      setProposalDate(todayStr());
    } catch {
      setPhotoLoading(false);
      setPhotoError("No se pudo procesar la imagen. Prueba de nuevo.");
    }
  }

  async function confirmProposal() {
    const amountNum = parseFloat(proposalAmountText.replace(",", "."));
    if (!Number.isFinite(amountNum)) {
      setPhotoError("El resultado no es un número válido.");
      return;
    }
    setConfirmLoading(true);
    setPhotoError(null);
    try {
      await saveEntry(proposalDate, amountNum, "AI_PHOTO", proposal?.note);
      setConfirmLoading(false);
      setProposal(null);
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err: any) {
      setConfirmLoading(false);
      setPhotoError(err?.message ?? "No se pudo guardar el resultado.");
    }
  }

  // --- Totales y gráfico ---
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const totalResult = useMemo(() => sortedEntries.reduce((sum, e) => sum + e.resultAmount, 0), [sortedEntries]);
  const currentBalance = (account?.initialBalance ?? 0) + totalResult;
  const pctChange =
    account && account.initialBalance !== 0 ? (totalResult / Math.abs(account.initialBalance)) * 100 : null;

  const chartValues = useMemo(() => {
    if (!account) return [];
    let running = account.initialBalance;
    const values = [running];
    for (const e of sortedEntries) {
      running += e.resultAmount;
      values.push(running);
    }
    return values;
  }, [account, sortedEntries]);

  const chartWidth = 600;
  const chartHeight = 180;
  const chartPath = buildLinePath(chartValues, chartWidth, chartHeight, 16);
  const isUp = chartValues.length > 1 && chartValues[chartValues.length - 1] >= chartValues[0];

  if (!account || editingSetup) {
    return (
      <div className="panel" style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          {account ? "Editar configuración de tu cuenta" : "Configura tu cuenta para empezar"}
        </h2>
        <div>
          <label style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}>UID de la cuenta</label>
          <input
            type="text"
            value={setupUid}
            onChange={(e) => setSetupUid(e.target.value)}
            placeholder="Ej: 51234567"
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}>Moneda de la cuenta</label>
          <select
            value={setupCurrency}
            onChange={(e) => setSetupCurrency(e.target.value as Currency)}
            style={{ ...inputStyle, width: "100%" }}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}>Saldo inicial</label>
          <input
            type="text"
            inputMode="decimal"
            value={setupBalance}
            onChange={(e) => setSetupBalance(e.target.value)}
            placeholder="Ej: 1000"
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
        {setupError && <div className="error-msg">{setupError}</div>}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={saveSetup} disabled={setupLoading}>
            {setupLoading ? "Guardando…" : "Guardar y continuar"}
          </button>
          {account && (
            <button className="btn" onClick={() => setEditingSetup(false)} disabled={setupLoading}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Cuenta {account.accountUid}
          </div>
          <div style={{ fontSize: 24, fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {formatMoney(currentBalance, account.currency)}
          </div>
          <div style={{ fontSize: 12.5, color: totalResult >= 0 ? "var(--up)" : "var(--down)", marginTop: 2 }}>
            {totalResult >= 0 ? "+" : ""}
            {formatMoney(totalResult, account.currency)}
            {pctChange !== null && ` (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%)`} desde el saldo inicial
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Saldo inicial
          </div>
          <div style={{ fontSize: 16, marginTop: 4 }}>{formatMoney(account.initialBalance, account.currency)}</div>
        </div>
        <button className="btn" style={{ alignSelf: "center", fontSize: 12.5 }} onClick={() => setEditingSetup(true)}>
          Editar configuración
        </button>
      </div>

      <div className="panel">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 }}>
          Progreso
        </div>
        {chartValues.length > 1 ? (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: "100%", height: "auto", display: "block" }}>
            <path
              d={chartPath}
              fill="none"
              stroke={isUp ? "var(--up)" : "var(--down)"}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            Registra al menos un día para ver tu progreso en el gráfico.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Registrar resultado a mano</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 140px" }}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 45.50 o -20"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 140px" }}
            />
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
            Un resultado por día — si ya existe uno para esa fecha, se actualiza.
          </p>
          {manualError && <div className="error-msg">{manualError}</div>}
          <button className="btn btn-primary" onClick={handleManualSubmit} disabled={manualLoading}>
            {manualLoading ? "Guardando…" : "Guardar resultado"}
          </button>
        </div>

        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Subir foto del resultado</h3>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
            La IA propone una cifra a partir de la foto — siempre la revisas y confirmas antes de que se guarde.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => selectPhoto(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12 }}
          />
          {photoPreview && (
            <img src={photoPreview} alt="Captura" style={{ maxHeight: 140, borderRadius: 6, border: "1px solid var(--line)" }} />
          )}
          {photoFile && !proposal && (
            <button className="btn" onClick={readPhoto} disabled={photoLoading}>
              {photoLoading ? "Leyendo…" : "Leer resultado con IA"}
            </button>
          )}
          {photoError && <div className="error-msg">{photoError}</div>}
          {proposal && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                La IA leyó: <strong>{proposal.note || "resultado del día"}</strong>{" "}
                (confianza {proposal.confidence === "alta" ? "alta" : "media"}). Revisa la cifra antes de guardar.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={proposalDate}
                  onChange={(e) => setProposalDate(e.target.value)}
                  style={{ ...inputStyle, flex: "1 1 140px" }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={proposalAmountText}
                  onChange={(e) => setProposalAmountText(e.target.value)}
                  style={{ ...inputStyle, flex: "1 1 140px" }}
                />
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={confirmProposal} disabled={confirmLoading}>
                  {confirmLoading ? "Guardando…" : "Confirmar y guardar"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setProposal(null);
                    setPhotoFile(null);
                    setPhotoPreview(null);
                  }}
                  disabled={confirmLoading}
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ fontSize: 14, marginTop: 0 }}>Historial de resultados</h3>
        {sortedEntries.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Todavía no registraste ningún día.</p>
        )}
        {sortedEntries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[...sortedEntries].reverse().map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderBottom: "1px solid var(--line)",
                  padding: "10px 0",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-dim)", minWidth: 90 }}>
                  {entry.date}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13.5,
                    color: entry.resultAmount >= 0 ? "var(--up)" : "var(--down)",
                    minWidth: 100,
                  }}
                >
                  {entry.resultAmount >= 0 ? "+" : ""}
                  {formatMoney(entry.resultAmount, account.currency)}
                </span>
                <span className="tag neu" style={{ fontSize: 10.5 }}>
                  {entry.source === "AI_PHOTO" ? "Foto + IA" : "Manual"}
                </span>
                <button className="btn" style={{ marginLeft: "auto", fontSize: 11.5, padding: "4px 10px" }} onClick={() => editEntry(entry)}>
                  Editar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

