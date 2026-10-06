"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mt5ServerField, VANTAGE_MT5_SERVERS } from "@/components/Mt5ServerField";

type Currency = "EUR" | "USD" | "CENT";
type Source = "MANUAL" | "AI_PHOTO" | "MT5_SYNC";
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
  // Ya no se pide a mano al crear la cuenta: null hasta que el orquestador
  // MT5 hace su primer sync y lo fija con el saldo real (ver
  // src/lib/journal/mt5-sync.ts).
  initialBalance: number | null;
  entries: Entry[];
  // Conexión MT5 opcional (ver mt5-orchestrator/): investorLogin y mt5Server
  // no son secretos y se pueden mostrar; la contraseña nunca vuelve del
  // servidor, solo este flag de si hay una guardada.
  mt5Connected?: boolean;
  investorLogin?: string | null;
  mt5Server?: string | null;
  lastSyncedAt?: string | null;
};

// Última sincronización, en formato relativo corto — la hace sola el
// orquestador MT5 propio (mt5-orchestrator/) cada ~15 minutos.
function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return "Todavía sin sincronizar";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

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
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  // Conexión MT5 opcional. La contraseña nunca se rellena al editar (el
  // servidor no la devuelve) — dejarla en blanco al editar significa "no
  // cambiar la que ya hay guardada".
  const [setupInvestorLogin, setSetupInvestorLogin] = useState("");
  const [setupInvestorPassword, setSetupInvestorPassword] = useState("");
  const [setupMt5Server, setSetupMt5Server] = useState("");
  // Journaly no guarda el broker (a diferencia de Vantax Play) -- esto es
  // solo para decidir en el formulario si mostrar el desplegable de
  // servidores de Vantage o el campo de texto libre para otro broker.
  const [setupIsVantage, setSetupIsVantage] = useState(true);

  function openCreateForm() {
    setSetupUid("");
    setSetupCurrency("USD");
    setSetupInvestorLogin("");
    setSetupInvestorPassword("");
    setSetupMt5Server("");
    setSetupError(null);
    setFormMode("create");
  }

  function openEditForm() {
    if (!account) return;
    setSetupUid(account.accountUid);
    setSetupCurrency(account.currency);
    setSetupInvestorLogin(account.investorLogin ?? "");
    setSetupInvestorPassword("");
    setSetupMt5Server(account.mt5Server ?? "");
    setSetupIsVantage(!account.mt5Server || VANTAGE_MT5_SERVERS.includes(account.mt5Server));
    setSetupError(null);
    setFormMode("edit");
  }

  async function disconnectMt5() {
    if (!account) return;
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm("¿Desconectar esta cuenta de MT5? Dejará de rellenarse sola y tendrás que seguir metiendo el resultado a mano o por foto.");
    if (!confirmed) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch(`/api/journal/account/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountUid: account.accountUid,
          currency: account.currency,
          clearMt5: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSetupLoading(false);
      if (!res.ok) {
        setSetupError(data.error ?? "No se pudo desconectar MT5.");
        return;
      }
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, mt5Connected: false, investorLogin: null, mt5Server: null } : a))
      );
      setSetupInvestorLogin("");
      setSetupMt5Server("");
      setSetupInvestorPassword("");
    } catch {
      setSetupLoading(false);
      setSetupError("No se pudo desconectar MT5. Inténtalo de nuevo.");
    }
  }

  async function resetInitialBalance() {
    if (!account) return;
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(
        `¿Recalcular el saldo inicial de "${account.accountUid}" desde MT5? Se borrará el saldo actual (${
          account.initialBalance != null ? account.initialBalance : "—"
        }) y en el próximo sync se rellenará solo con el saldo real que lea MT5.`
      );
    if (!confirmed) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch(`/api/journal/account/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountUid: account.accountUid,
          currency: account.currency,
          resetInitialBalance: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSetupLoading(false);
      if (!res.ok) {
        setSetupError(data.error ?? "No se pudo recalcular el saldo inicial.");
        return;
      }
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, initialBalance: null } : a)));
    } catch {
      setSetupLoading(false);
      setSetupError("No se pudo recalcular el saldo inicial. Inténtalo de nuevo.");
    }
  }

  async function submitSetup() {
    setSetupError(null);
    if (!setupUid.trim()) {
      setSetupError("El UID de la cuenta es obligatorio.");
      return;
    }
    if (formMode === "create" && (!setupInvestorLogin.trim() || !setupInvestorPassword || !setupMt5Server.trim())) {
      setSetupError("Para crear la cuenta hace falta conectar MT5: login investor, contraseña y servidor.");
      return;
    }
    setSetupLoading(true);
    try {
      if (formMode === "create") {
        const res = await fetch("/api/journal/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountUid: setupUid.trim(),
            currency: setupCurrency,
            investorLogin: setupInvestorLogin.trim(),
            investorPassword: setupInvestorPassword,
            mt5Server: setupMt5Server.trim(),
          }),
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
          mt5Connected: data.account.mt5Connected,
          investorLogin: data.account.investorLogin,
          mt5Server: data.account.mt5Server,
        };
        setAccounts((prev) => [...prev, newAccount]);
        setActiveId(newAccount.id);
        setFormMode(null);
      } else if (formMode === "edit" && account) {
        const res = await fetch(`/api/journal/account/${account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountUid: setupUid.trim(),
            currency: setupCurrency,
            investorLogin: setupInvestorLogin.trim(),
            investorPassword: setupInvestorPassword,
            mt5Server: setupMt5Server.trim(),
          }),
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
              ? {
                  ...a,
                  accountUid: data.account.accountUid,
                  currency: data.account.currency,
                  initialBalance: data.account.initialBalance,
                  mt5Connected: data.account.mt5Connected,
                  investorLogin: data.account.investorLogin,
                  mt5Server: data.account.mt5Server,
                }
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
  // Panel único "Registrar resultado": pestaña a mano / desde foto.
  const [entryMode, setEntryMode] = useState<"manual" | "photo">("manual");

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
  const hasInitialBalance = account?.initialBalance != null;
  const currentBalance = hasInitialBalance ? (account!.initialBalance as number) + totalResult : null;
  const pctChange =
    account && hasInitialBalance && account.initialBalance !== 0
      ? (totalResult / Math.abs(account.initialBalance as number)) * 100
      : null;

  // --- Gráfico interactivo (días / semanas / meses) ---
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("day");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    setHoverIndex(null);
  }, [activeId]);

  const chartPoints = useMemo(
    () => (account ? buildPeriodSeries(sortedEntries, account.initialBalance ?? 0, chartPeriod) : []),
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
    setEntryMode("manual");
    manualFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const accountTabs = accounts.length > 0 && (
    <div className="journal-account-tabs">
      {accounts.map((a) => (
        <button
          key={a.id}
          className={`btn journal-acc-tab${a.id === activeId && !formMode ? " active" : ""}`}
          onClick={() => switchAccount(a.id)}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>{a.accountUid}</span>
          {a.currency === "CENT" && <span className="journal-acc-tag">Cent</span>}
        </button>
      ))}
      <button className="btn journal-acc-add" onClick={openCreateForm}>
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
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              {formMode === "create" ? "Conectar con MT5 (obligatorio)" : "Conexión con MT5"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
              {formMode === "create"
                ? "El resultado del día se rellena solo a partir de tu cuenta real en MT5, sin escribirlo a mano ni subir foto — y el primer saldo que se lea se guarda como saldo inicial, también solo. Usa siempre la contraseña de "
                : "El resultado del día se puede rellenar solo a partir de tu cuenta real en MT5. Usa siempre la contraseña de "}
              <strong>investor</strong> (solo lectura), nunca la de trading.
              {formMode === "edit" && account?.mt5Connected ? " Ya tienes una contraseña guardada — déjala en blanco si no quieres cambiarla." : ""}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}>Login investor</label>
                <input
                  type="text"
                  value={setupInvestorLogin}
                  onChange={(e) => setSetupInvestorLogin(e.target.value)}
                  placeholder="Ej: 51234567"
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}>Contraseña investor</label>
                <input
                  type="password"
                  value={setupInvestorPassword}
                  onChange={(e) => setSetupInvestorPassword(e.target.value)}
                  placeholder={formMode === "edit" && account?.mt5Connected ? "•••••••• (sin cambios)" : "Contraseña de solo lectura"}
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}>Servidor MT5</label>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSetupIsVantage(true);
                      if (!VANTAGE_MT5_SERVERS.includes(setupMt5Server)) setSetupMt5Server("");
                    }}
                    className="btn"
                    style={setupIsVantage ? { borderColor: "var(--accent, #7aa2ff)" } : undefined}
                  >
                    Vantage
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupIsVantage(false)}
                    className="btn"
                    style={!setupIsVantage ? { borderColor: "var(--accent, #7aa2ff)" } : undefined}
                  >
                    Otro broker
                  </button>
                </div>
                <Mt5ServerField
                  brokerName={setupIsVantage ? "Vantage" : "Otro"}
                  value={setupMt5Server}
                  onChange={setSetupMt5Server}
                  style={{ ...inputStyle, width: "100%" }}
                />
                {!setupIsVantage && (
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
                    Escríbelo EXACTAMENTE igual que en tu terminal MT5 (mayúsculas y espacios incluidos) — si no
                    coincide letra por letra, la sincronización se queda colgada sin avisar.
                  </div>
                )}
              </div>
            </div>
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
            {formMode === "edit" && account?.mt5Connected && (
              <button className="btn" onClick={disconnectMt5} disabled={setupLoading}>
                Desconectar MT5
              </button>
            )}
            {formMode === "edit" && account?.mt5Connected && account?.initialBalance != null && (
              <button className="btn" onClick={resetInitialBalance} disabled={setupLoading}>
                Recalcular saldo inicial desde MT5
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

  // --- Indicadores rápidos (rediseño 06/10/2026): todo sale de los mismos
  // resultados registrados, no se inventa nada. ---
  const daysTraded = sortedEntries.length;
  const daysPositive = sortedEntries.filter((e) => e.resultAmount > 0).length;
  const bestDay = sortedEntries.reduce<Entry | null>((best, e) => (!best || e.resultAmount > best.resultAmount ? e : best), null);
  const avgPerDay = daysTraded > 0 ? totalResult / daysTraded : 0;
  const maxAbsInMonth = Math.max(
    1,
    ...sortedEntries.filter((e) => e.date.startsWith(calendarMonthKey)).map((e) => Math.abs(e.resultAmount))
  );
  const weekTotals = Array.from({ length: calendarCells.length / 7 }, (_, w) => {
    const days = calendarCells.slice(w * 7, w * 7 + 7).filter((d): d is string => !!d);
    const withData = days.filter((d) => entriesByDate.has(d));
    return {
      label: days.length ? `${parseInt(days[0].slice(8, 10), 10)}–${parseInt(days[days.length - 1].slice(8, 10), 10)}` : "",
      total: withData.reduce((sum, d) => sum + (entriesByDate.get(d)?.resultAmount ?? 0), 0),
      has: withData.length > 0,
    };
  });
  const selectedEntry = entriesByDate.get(manualDate);
  const chartColor = isUp ? "#A78BFA" : "#F472B6";
  const areaPath =
    chartCoords.length > 1
      ? `${chartPath} L ${chartCoords[chartCoords.length - 1].x.toFixed(1)},${chartHeight - chartPadding} L ${chartCoords[0].x.toFixed(1)},${chartHeight - chartPadding} Z`
      : "";

  function shortMoney(n: number): string {
    const a = Math.abs(n);
    const sign = n < 0 ? "−" : "+";
    if (a >= 1000) return `${sign}${(a / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k`;
    return `${sign}${Math.round(a)}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {accountTabs}

      {/* Saldo protagonista + indicadores */}
      <div className="panel journal-hero">
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Saldo actual · cuenta {account.accountUid}
          </span>
          <span className="journal-balance">
            {currentBalance !== null ? formatMoney(currentBalance, account.currency) : "—"}
          </span>
          {currentBalance !== null ? (
            <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14 }}>
              {pctChange !== null && (
                <span className={`journal-pct ${totalResult >= 0 ? "up" : "down"}`}>
                  {pctChange >= 0 ? "+" : ""}
                  {pctChange.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
                </span>
              )}
              <span style={{ color: "var(--text-muted)" }}>
                {totalResult >= 0 ? "+" : ""}
                {formatMoney(totalResult, account.currency)} desde{" "}
                {account.initialBalance != null ? formatMoney(account.initialBalance, account.currency) : "el saldo inicial"}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              Esperando el primer saldo real de MT5 (puede tardar hasta 15 min desde que conectaste la cuenta)
            </span>
          )}
          {account.mt5Connected && (
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              MT5 conectado · Sincronizada {formatLastSync(account.lastSyncedAt)}
            </span>
          )}
        </div>
        <div className="journal-kpis">
          <div className="calc-mini">
            <span>Días operados</span>
            <b>{daysTraded}</b>
          </div>
          <div className="calc-mini">
            <span>Días en positivo</span>
            <b>
              {daysPositive} de {daysTraded}
            </b>
          </div>
          <div className="calc-mini">
            <span>Mejor día</span>
            <b>{bestDay ? formatMoney(bestDay.resultAmount, account.currency) : "—"}</b>
          </div>
          <div className="calc-mini">
            <span>Media por día</span>
            <b>{daysTraded > 0 ? formatMoney(avgPerDay, account.currency) : "—"}</b>
          </div>
        </div>
        <button className="btn" style={{ alignSelf: "center" }} onClick={openEditForm}>
          Editar cuenta
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* Gráfico de progreso */}
        <div className="panel" style={{ flex: "2 1 520px", minWidth: 0 }}>
          <div className="panel-head" style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Progreso</h2>
            <div className="calc-tabs" role="tablist" aria-label="Periodo">
              {(["day", "week", "month"] as ChartPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={chartPeriod === p}
                  className={`calc-tab ${chartPeriod === p ? "active" : ""}`}
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
                <defs>
                  <linearGradient id="journalArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={chartColor} stopOpacity="0.3" />
                    <stop offset="1" stopColor={chartColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="var(--line)" strokeWidth={1}>
                  <line x1={chartPadding} y1={chartPadding} x2={chartWidth - chartPadding} y2={chartPadding} />
                  <line x1={chartPadding} y1={chartHeight / 2} x2={chartWidth - chartPadding} y2={chartHeight / 2} />
                  <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} />
                </g>
                <path d={areaPath} fill="url(#journalArea)" />
                {safeHoverIndex !== null && chartCoords[safeHoverIndex] && (
                  <line
                    x1={chartCoords[safeHoverIndex].x}
                    y1={chartPadding}
                    x2={chartCoords[safeHoverIndex].x}
                    y2={chartHeight - chartPadding}
                    stroke="var(--line-bright)"
                    strokeDasharray="4 4"
                  />
                )}
                <path d={chartPath} fill="none" stroke={chartColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                {chartCoords.map((c, i) => (
                  <circle
                    key={chartPoints[i].key}
                    cx={c.x}
                    cy={c.y}
                    r={safeHoverIndex === i ? 6 : 4}
                    fill={safeHoverIndex === i ? chartColor : "var(--bg-void)"}
                    stroke={chartColor}
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoverIndex(i)}
                    onClick={() => setHoverIndex(i)}
                  >
                    <title>{`${chartPoints[i].label}: ${formatMoney(chartPoints[i].value, account.currency)}`}</title>
                  </circle>
                ))}
              </svg>
              {activePoint && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                  {activePoint.label}:{" "}
                  <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatMoney(activePoint.value, account.currency)}
                  </strong>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
              Registra al menos un día para ver tu progreso en el gráfico.
            </p>
          )}
        </div>

        {/* Registrar resultado: a mano o desde foto, en un solo panel */}
        <div className="panel" style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }} ref={manualFormRef}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Registrar resultado</h2>
          <div className="calc-tabs" role="tablist" aria-label="Método" style={{ alignSelf: "stretch" }}>
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === "manual"}
              className={`calc-tab ${entryMode === "manual" ? "active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => setEntryMode("manual")}
            >
              A mano
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === "photo"}
              className={`calc-tab ${entryMode === "photo" ? "active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => setEntryMode("photo")}
            >
              Desde foto
            </button>
          </div>

          {entryMode === "manual" ? (
            <>
              <div>
                <label>Fecha</label>
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ colorScheme: "dark" }} />
              </div>
              <div>
                <label>Resultado ({CURRENCY_SYMBOL[account.currency]})</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej: 45,50 o -20"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 20, minHeight: 52 }}
                />
              </div>
              {manualError && <div className="error-msg">{manualError}</div>}
              <button className="btn btn-primary" style={{ minHeight: 52 }} onClick={handleManualSubmit} disabled={manualLoading}>
                {manualLoading ? "Guardando…" : "Guardar resultado"}
              </button>
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
                Un resultado por día — si ya existe uno para esa fecha, se actualiza. También puedes tocar un día del
                calendario para editarlo aquí.
              </p>
            </>
          ) : (
            <>
              <label className="journal-drop">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="15" rx="3" />
                  <circle cx="12" cy="12.5" r="3.5" />
                  <path d="M8 5l1.5-2h5L16 5" />
                </svg>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-body)" }}>
                  {photoFile ? photoFile.name : "Sube una captura del resultado"}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-body)" }}>
                  PNG o JPG de MT5
                </span>
                <input type="file" accept="image/*" onChange={(e) => selectPhoto(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
              </label>
              {photoPreview && (
                <img src={photoPreview} alt="Captura" style={{ maxHeight: 160, borderRadius: 12, border: "1px solid var(--line)", objectFit: "contain" }} />
              )}
              {photoFile && !proposal && (
                <button className="btn btn-primary" onClick={readPhoto} disabled={photoLoading}>
                  {photoLoading ? "Leyendo…" : "Leer resultado con IA"}
                </button>
              )}
              {photoError && <div className="error-msg">{photoError}</div>}
              {proposal && (
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    La IA leyó: <strong>{proposal.note || "resultado del día"}</strong> (confianza{" "}
                    {proposal.confidence === "alta" ? "alta" : "media"}). Revisa la cifra antes de guardar.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="date" value={proposalDate} onChange={(e) => setProposalDate(e.target.value)} style={{ flex: "1 1 140px", colorScheme: "dark" }} />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={proposalAmountText}
                      onChange={(e) => setProposalAmountText(e.target.value)}
                      style={{ flex: "1 1 140px", fontFamily: "var(--font-mono)" }}
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
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
                La IA propone una cifra a partir de la foto — siempre la revisas y confirmas antes de que se guarde.
              </p>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* Calendario tipo mapa de calor */}
        <div className="panel journal-calendar" style={{ flex: "2 1 520px", minWidth: 0 }}>
          <div className="journal-calendar-head">
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Calendario</h2>
              <div className="journal-calendar-total" style={{ marginTop: 4 }}>
                Total del mes:{" "}
                <strong style={{ color: calendarMonthTotal >= 0 ? "var(--up)" : "var(--down)", fontFamily: "var(--font-mono)" }}>
                  {calendarMonthTotal >= 0 ? "+" : ""}
                  {formatMoney(calendarMonthTotal, account.currency)}
                </strong>
              </div>
            </div>
            <div className="btn-row" style={{ alignItems: "center" }}>
              <button className="btn" aria-label="Mes anterior" style={{ width: 44, padding: 0 }} onClick={() => shiftMonth(-1)}>
                ‹
              </button>
              <div className="journal-calendar-title">
                {capitalize(MONTH_NAMES_ES[calendarCursor.month])} {calendarCursor.year}
              </div>
              <button className="btn" aria-label="Mes siguiente" style={{ width: 44, padding: 0 }} onClick={() => shiftMonth(1)}>
                ›
              </button>
              <button className="btn" onClick={goToCurrentMonth}>
                Hoy
              </button>
            </div>
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
              const isSelected = dateStr === manualDate;
              let bg: string | undefined;
              if (entry) {
                const t = 0.18 + 0.5 * Math.min(1, Math.abs(entry.resultAmount) / maxAbsInMonth);
                bg = entry.resultAmount > 0 ? `rgba(167,139,250,${t.toFixed(2)})` : entry.resultAmount < 0 ? `rgba(244,114,182,${t.toFixed(2)})` : "var(--bg-panel-hover)";
              }
              return (
                <button
                  key={dateStr}
                  type="button"
                  className={`cal-cell${isToday ? " cal-cell-today" : ""}${isSelected ? " cal-cell-selected" : ""}`}
                  style={bg ? { background: bg } : undefined}
                  onClick={() => selectDay(dateStr)}
                  aria-label={`${dayNum} de ${MONTH_NAMES_ES[calendarCursor.month]}${entry ? `, ${formatMoney(entry.resultAmount, account.currency)}` : ""}`}
                >
                  <span className="cal-day-num">{dayNum}</span>
                  {entry && (
                    <>
                      <span className="cal-cell-amount cal-amt-full" style={{ color: entry.resultAmount >= 0 ? "#E4DCFF" : "#FBCFE8" }}>
                        {entry.resultAmount >= 0 ? "+" : ""}
                        {formatMoney(entry.resultAmount, account.currency)}
                      </span>
                      <span className="cal-cell-amount cal-amt-short" style={{ color: entry.resultAmount >= 0 ? "#E4DCFF" : "#FBCFE8" }}>
                        {shortMoney(entry.resultAmount)}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: "rgba(167,139,250,0.6)" }} />
              Ganancia
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: "rgba(244,114,182,0.6)" }} />
              Pérdida
            </span>
            <span>Más intenso = mayor resultado</span>
          </div>
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Día seleccionado</span>
            <span style={{ fontSize: 17, fontWeight: 700 }}>
              {manualDate ? formatDayLabel(manualDate) : "—"}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 600,
                color: !selectedEntry ? "var(--text-dim)" : selectedEntry.resultAmount >= 0 ? "var(--up)" : "var(--down)",
              }}
            >
              {selectedEntry
                ? `${selectedEntry.resultAmount >= 0 ? "+" : ""}${formatMoney(selectedEntry.resultAmount, account.currency)}`
                : "Sin registro"}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Toca un día del calendario para verlo y editarlo.</span>
          </div>
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Por semanas</h2>
            {weekTotals.map((w, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 14 }}>
                <span style={{ color: "var(--text-muted)" }}>
                  {w.label} {MONTH_NAMES_ES[calendarCursor.month].slice(0, 3)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: !w.has ? "var(--text-dim)" : w.total >= 0 ? "var(--up)" : "var(--down)",
                  }}
                >
                  {w.has ? `${w.total >= 0 ? "+" : ""}${formatMoney(w.total, account.currency)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


