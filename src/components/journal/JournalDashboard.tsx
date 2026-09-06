"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Currency = "EUR" | "USD" | "CENT";
type Source = "MANUAL" | "AI_PHOTO";
type ChartPeriod = "day" | "week" | "month";
type FormMode = "create" | "edit" | null;

type Entry = {
  id: string;
  date: string; // "YYYY-MM-DD"
  resultAmount: number;
  source: Source;
  imageNote?: string | null;
};

type AccountData = {
  id: string;
  accountUid: string;
  currency: Currency;
  initialBalance: number;
  entries: Entry[];
};

type ChartPoint = { key: string; label: string; value: number };

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: "EUR", label: "Euros (€)" },
  { value: "USD", label: "Dólares (US$)" },
  { value: "CENT", label: "Cuenta cent (¢)" },
];

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", CENT: "¢" };

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAY_NAMES_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

// --- Agregación del progreso por día / semana / mes ---
// Todo se calcula a partir de los mismos resultados reales que el usuario
// registró — nunca se inventa ni interpola nada, solo se agrupa la misma
// cifra a distinta granularidad.

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// Semana ISO-8601 (lunes a domingo, semana 1 = la que contiene el primer jueves del año).
function isoWeekKey(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const target = new Date(date.getTime());
  const dayNr = (date.getUTCDay() + 6) % 7; // lunes = 0 ... domingo = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${target.getUTCFullYear()}-S${pad2(weekNumber)}`;
}

function formatDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_NAMES_ES[m - 1].slice(0, 3)}`;
}

function formatWeekLabel(key: string): string {
  const [year, week] = key.split("-");
  return `Semana ${week.replace("S", "")} · ${year}`;
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${capitalize(MONTH_NAMES_ES[m - 1])} ${y}`;
}

function buildPeriodSeries(sortedEntries: Entry[], initialBalance: number, period: ChartPeriod): ChartPoint[] {
  const points: ChartPoint[] = [{ key: "inicio", label: "Inicio", value: initialBalance }];

  if (period === "day") {
    let running = initialBalance;
    for (const e of sortedEntries) {
      running += e.resultAmount;
      points.push({ key: e.date, label: formatDayLabel(e.date), value: running });
    }
    return points;
  }

  const keyFn = period === "week" ? isoWeekKey : monthKey;
  const labelFn = period === "week" ? formatWeekLabel : formatMonthLabel;
  const buckets = new Map<string, number>();
  for (const e of sortedEntries) {
    const k = keyFn(e.date);
    buckets.set(k, (buckets.get(k) ?? 0) + e.resultAmount);
  }
  const keys = [...buckets.keys()].sort();
  let running = initialBalance;
  for (const k of keys) {
    running += buckets.get(k)!;
    points.push({ key: k, label: labelFn(k), value: running });
  }
  return points;
}

function computeCoords(values: number[], width: number, height: number, padding: number): { x: number; y: number }[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (values.length - 1);
  return values.map((v, i) => ({
    x: padding + i * stepX,
    y: padding + (height - padding * 2) * (1 - (v - min) / range),
  }));
}

function buildLinePath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return "";
  return `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ")}`;
}

// --- Calendario mensual ---

function buildMonthGrid(year: number, month: number): (string | null)[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startWeekday = (firstDay.getUTCDay() + 6) % 7; // lunes = 0
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month + 1)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  background: "var(--bg-panel-raised)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  color: "var(--text)",
};

export function JournalDashboard({ initialAccounts }: { initialAccounts: AccountData[] }) {
  const [accounts, setAccounts] = useState<AccountData[]>(initialAccounts);
  const [activeId, setActiveId] = useState<string | null>(initialAccounts[0]?.id ?? null);
  const [formMode, setFormMode] = useState<FormMode>(initialAccounts.length === 0 ? "create" : null);
  const manualFormRef = useRef<HTMLDivElement>(null);

  const account = accounts.find((a) => a.id === activeId) ?? null;

  // --- Formulario de cuenta: crear una nueva o editar la activa ---
  const [setupUid, setSetupUid] = useState("");
  const [setupCurrency, setSetupCurrency] = useState<Currency>("USD");
  const [setupBalance, setSetupBalance] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  function openCreateForm() {
    setSetupUid("");
    setSetupCurrency("USD");
    setSetupBalance("");
    setSetupError(null);
    setFormMode("create");
  }

  function openEditForm() {
    if (!account) return;
    setSetupUid(account.accountUid);
    setSetupCurrency(account.currency);
    setSetupBalance(String(account.initialBalance));
    setSetupError(null);
    setFormMode("edit");
  }

  async function submitSetup() {
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
      if (formMode === "create") {
        const res = await fetch("/api/journal/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountUid: setupUid.trim(), currency: setupCurrency, initialBalance: balanceNum }),
        });
        const data = await res.json().catch(() => ({}));
        setSetupLoading(false);
        if (!res.ok) {
          setSetupError(data.error ?? "No se pudo crear la cuenta.");
          return;
        }
        const newAccount: AccountData = {
          id: data.account.id,
          accountUid: data.account.accountUid,
          currency: data.account.currency,
          initialBalance: data.account.initialBalance,
          entries: [],
        };
        setAccounts((prev) => [...prev, newAccount]);
        setActiveId(newAccount.id);
        setFormMode(null);
      } else if (formMode === "edit" && account) {
        const res = await fetch(`/api/journal/account/${account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountUid: setupUid.trim(), currency: setupCurrency, initialBalance: balanceNum }),
        });
        const data = await res.json().catch(() => ({}));
        setSetupLoading(false);
        if (!res.ok) {
          setSetupError(data.error ?? "No se pudo actualizar la cuenta.");
          return;
        }
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === account.id
              ? { ...a, accountUid: data.account.accountUid, currency: data.account.currency, initialBalance: data.account.initialBalance }
              : a
          )
        );
        setFormMode(null);
      }
    } catch {
      setSetupLoading(false);
      setSetupError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  async function deleteActiveAccount() {
    if (!account) return;
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(`¿Seguro que quieres borrar la cuenta "${account.accountUid}"? Se perderán todos sus resultados registrados.`);
    if (!confirmed) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch(`/api/journal/account/${account.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setSetupLoading(false);
      if (!res.ok) {
        setSetupError(data.error ?? "No se pudo borrar la cuenta.");
        return;
      }
      const rest = accounts.filter((a) => a.id !== account.id);
      setAccounts(rest);
      setActiveId(rest[0]?.id ?? null);
      setFormMode(rest.length === 0 ? "create" : null);
    } catch {
      setSetupLoading(false);
      setSetupError("No se pudo borrar la cuenta. Inténtalo de nuevo.");
    }
  }

  function switchAccount(id: string) {
    setActiveId(id);
    setFormMode(null);
    setManualDate(todayStr());
    setManualAmount("");
    setManualError(null);
    setProposal(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoError(null);
  }

  // --- Formulario de resultado manual (también lo rellena un clic en el calendario) ---
  const [manualDate, setManualDate] = useState(todayStr());
  const [manualAmount, setManualAmount] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  async function saveEntry(date: string, amount: number, source: Source, imageNote?: string) {
    if (!account) return;
    const res = await fetch("/api/journal/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id, date, resultAmount: amount, source, imageNote }),
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
    const accountId = account.id;
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== accountId) return a;
        const rest = a.entries.filter((e) => e.date !== saved.date);
        return { ...a, entries: [...rest, saved].sort((x, y) => x.date.localeCompare(y.date)) };
      })
    );
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

  // --- Totales ---
  const sortedEntries = useMemo(
    () => (account ? [...account.entries].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [account]
  );
  const entriesByDate = useMemo(() => new Map(sortedEntries.map((e) => [e.date, e])), [sortedEntries]);
  const totalResult = useMemo(() => sortedEntries.reduce((sum, e) => sum + e.resultAmount, 0), [sortedEntries]);
  const currentBalance = (account?.initialBalance ?? 0) + totalResult;
  const pctChange =
    account && account.initialBalance !== 0 ? (totalResult / Math.abs(account.initialBalance)) * 100 : null;

  // --- Gráfico interactivo (días / semanas / meses) ---
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("day");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    setHoverIndex(null);
  }, [activeId]);

  const chartPoints = useMemo(
    () => (account ? buildPeriodSeries(sortedEntries, account.initialBalance, chartPeriod) : []),
    [account, sortedEntries, chartPeriod]
  );
  const chartWidth = 600;
  const chartHeight = 180;
  const chartPadding = 16;
  const chartCoords = useMemo(
    () => computeCoords(chartPoints.map((p) => p.value), chartWidth, chartHeight, chartPadding),
    [chartPoints]
  );
  const chartPath = buildLinePath(chartCoords);
  const isUp = chartPoints.length > 1 && chartPoints[chartPoints.length - 1].value >= chartPoints[0].value;
  const safeHoverIndex = hoverIndex !== null && hoverIndex < chartPoints.length ? hoverIndex : null;
  const activePoint = chartPoints.length > 0 ? chartPoints[safeHoverIndex ?? chartPoints.length - 1] : null;

  function selectPeriod(p: ChartPeriod) {
    setChartPeriod(p);
    setHoverIndex(null);
  }

  // --- Calendario mensual (clic en un día = editar/añadir ese resultado) ---
  const [calendarCursor, setCalendarCursor] = useState<{ year: number; month: number }>(() => {
    if (initialAccounts[0]?.entries.length) {
      const [y, m] = initialAccounts[0].entries[initialAccounts[0].entries.length - 1].date.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const calendarCells = useMemo(
    () => buildMonthGrid(calendarCursor.year, calendarCursor.month),
    [calendarCursor]
  );
  const calendarMonthKey = `${calendarCursor.year}-${pad2(calendarCursor.month + 1)}`;
  const calendarMonthTotal = useMemo(
    () => sortedEntries.filter((e) => e.date.startsWith(calendarMonthKey)).reduce((s, e) => s + e.resultAmount, 0),
    [sortedEntries, calendarMonthKey]
  );

  function shiftMonth(delta: number) {
    setCalendarCursor(({ year, month }) => {
      const total = year * 12 + month + delta;
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    });
  }

  function goToCurrentMonth() {
    const now = new Date();
    setCalendarCursor({ year: now.getFullYear(), month: now.getMonth() });
  }

  function selectDay(dateStr: string) {
    const entry = entriesByDate.get(dateStr);
    setManualDate(dateStr);
    setManualAmount(entry ? String(entry.resultAmount) : "");
    setManualError(null);
    manualFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const accountTabs = accounts.length > 0 && (
    <div className="journal-account-tabs">
      {accounts.map((a) => (
        <button
          key={a.id}
          className="btn"
          style={{ fontSize: 12.5, ...(a.id === activeId && !formMode ? { borderColor: "var(--violet)" } : {}) }}
          onClick={() => switchAccount(a.id)}
        >
          {a.accountUid}
        </button>
      ))}
      <button className="btn" style={{ fontSize: 12.5 }} onClick={openCreateForm}>
        + Añadir cuenta
      </button>
    </div>
  );

  if (formMode === "create" || formMode === "edit") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {accountTabs}
        <div className="panel" style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            {formMode === "create" ? "Añadir una cuenta nueva" : "Editar cuenta"}
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
            <button className="btn btn-primary" onClick={submitSetup} disabled={setupLoading}>
              {setupLoading ? "Guardando…" : formMode === "create" ? "Crear cuenta" : "Guardar cambios"}
            </button>
            {accounts.length > 0 && (
              <button className="btn" onClick={() => setFormMode(null)} disabled={setupLoading}>
                Cancelar
              </button>
            )}
            {formMode === "edit" && (
              <button
                className="btn"
                style={{ marginLeft: "auto", color: "var(--down)", borderColor: "var(--down)" }}
                onClick={deleteActiveAccount}
                disabled={setupLoading}
              >
                Borrar esta cuenta
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!account) {
    return <div>{accountTabs}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {accountTabs}

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
        <button className="btn" style={{ alignSelf: "center", fontSize: 12.5 }} onClick={openEditForm}>
          Editar esta cuenta
        </button>
      </div>

      <div className="panel">
        <div className="panel-head" style={{ marginBottom: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Progreso
          </div>
          <div className="btn-row">
            {(["day", "week", "month"] as ChartPeriod[]).map((p) => (
              <button
                key={p}
                className="btn"
                style={{ fontSize: 12, padding: "5px 12px", ...(chartPeriod === p ? { borderColor: "var(--violet)" } : {}) }}
                onClick={() => selectPeriod(p)}
              >
                {p === "day" ? "Días" : p === "week" ? "Semanas" : "Meses"}
              </button>
            ))}
          </div>
        </div>

        {chartPoints.length > 1 ? (
          <>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: "100%", height: "auto", display: "block" }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <path
                d={chartPath}
                fill="none"
                stroke={isUp ? "var(--up)" : "var(--down)"}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {chartCoords.map((c, i) => (
                <circle
                  key={chartPoints[i].key}
                  cx={c.x}
                  cy={c.y}
                  r={safeHoverIndex === i ? 5 : 3}
                  fill={isUp ? "var(--up)" : "var(--down)"}
                  stroke="var(--bg-panel)"
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverIndex(i)}
                  onClick={() => setHoverIndex(i)}
                >
                  <title>{`${chartPoints[i].label}: ${formatMoney(chartPoints[i].value, account.currency)}`}</title>
                </circle>
              ))}
            </svg>
            {activePoint && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>
                {activePoint.label}: <strong style={{ color: "var(--text-primary)" }}>{formatMoney(activePoint.value, account.currency)}</strong>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            Registra al menos un día para ver tu progreso en el gráfico.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }} ref={manualFormRef}>
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
            Un resultado por día — si ya existe uno para esa fecha, se actualiza. También puedes hacer clic en un día
            del calendario de abajo para editarlo aquí.
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

      <div className="panel journal-calendar">
        <div className="journal-calendar-head">
          <h3 style={{ fontSize: 14, margin: 0 }}>Calendario de resultados</h3>
          <div className="btn-row" style={{ alignItems: "center" }}>
            <button className="btn" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => shiftMonth(-1)}>
              ←
            </button>
            <div className="journal-calendar-title">
              {capitalize(MONTH_NAMES_ES[calendarCursor.month])} {calendarCursor.year}
            </div>
            <button className="btn" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => shiftMonth(1)}>
              →
            </button>
            <button className="btn" style={{ fontSize: 12, padding: "5px 10px" }} onClick={goToCurrentMonth}>
              Hoy
            </button>
          </div>
        </div>
        <div className="journal-calendar-total">
          Total del mes:{" "}
          <strong style={{ color: calendarMonthTotal >= 0 ? "var(--up)" : "var(--down)" }}>
            {calendarMonthTotal >= 0 ? "+" : ""}
            {formatMoney(calendarMonthTotal, account.currency)}
          </strong>
        </div>

        <div className="cal-weekdays">
          {WEEKDAY_NAMES_ES.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {calendarCells.map((dateStr, idx) => {
            if (!dateStr) return <div key={`empty-${idx}`} className="cal-cell cal-cell-empty" />;
            const entry = entriesByDate.get(dateStr);
            const dayNum = parseInt(dateStr.slice(8, 10), 10);
            const isToday = dateStr === todayStr();
            return (
              <button
                key={dateStr}
                type="button"
                className={`cal-cell${isToday ? " cal-cell-today" : ""}`}
                onClick={() => selectDay(dateStr)}
              >
                <span className="cal-day-num">{dayNum}</span>
                {entry && (
                  <span
                    className="cal-cell-amount"
                    style={{ color: entry.resultAmount >= 0 ? "var(--up)" : "var(--down)" }}
                  >
                    {entry.resultAmount >= 0 ? "+" : ""}
                    {formatMoney(entry.resultAmount, account.currency)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

