// Integración con la API de IB de Vantage (documento "Vantage IB Access API"
// que compartió Esther). Se usan dos de sus 4 endpoints:
//  - commissionData: la API de Vantage NO expone el lotaje de cada operación
//    individual, solo comisión acumulada por cuenta — por eso el sistema de
//    V-COIN para cuentas de Vantage se basa en comisión generada, no en
//    lotes como en el resto del proyecto Vantax Play (que usa Myfxbook). De
//    aquí también sale lastTradeTime, para saber si una cuenta está activa.
//  - allocationData: historial de entradas ("In") y salidas ("Out") de
//    clientes de tu IB — la única forma de saber si alguien deja de estar
//    bajo tu IB (ver syncVantageAllocations).
// (Los otros dos, leadsData y accountData, no se usan todavía.)
//
// Las peticiones salen a través del proxy Squid montado en el droplet de
// DigitalOcean (46.101.254.106), porque Vantage solo permite llamadas desde
// esa IP fija, que es la que tienen en su lista blanca.
//
// Variables de entorno necesarias (Render → Environment):
//   VANTAGE_PROXY_URL     → http://vantax:CONTRASEÑA@46.101.254.106:3128
//   VANTAGE_IB_USER_ID    → tu userId del Portal IB de Vantage
//   VANTAGE_IB_SECRET     → tu secret generado en el Portal IB de Vantage
//
// Nunca deben ir escritas en el código ni subidas a GitHub.

import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { prisma } from "@/lib/prisma";

const VANTAGE_BASE = "https://openapi.vantagemarkets.com";

type VantageEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

export type VantageCommissionRow = {
  userId: number;
  account: number;
  accountType: string;
  platform: string;
  currency: string;
  lastTradeTime: number | null;
  commission: number;
};

function getProxyAgent(): HttpsProxyAgent<string> {
  const proxyUrl = process.env.VANTAGE_PROXY_URL;
  if (!proxyUrl) {
    throw new Error(
      "Falta la variable de entorno VANTAGE_PROXY_URL (proxy del droplet de DigitalOcean con la IP fija de Vantage)."
    );
  }
  return new HttpsProxyAgent(proxyUrl);
}

function callVantageIb<T>(path: string, extraParams: Record<string, unknown> = {}): Promise<VantageEnvelope<T>> {
  const userId = process.env.VANTAGE_IB_USER_ID;
  const secret = process.env.VANTAGE_IB_SECRET;
  if (!userId || !secret) {
    return Promise.reject(new Error("Faltan VANTAGE_IB_USER_ID o VANTAGE_IB_SECRET en las variables de entorno."));
  }

  const payload = JSON.stringify({
    userId: Number(userId),
    secret,
    ...extraParams,
  });

  return new Promise((resolve, reject) => {
    let agent: HttpsProxyAgent<string>;
    try {
      agent = getProxyAgent();
    } catch (err) {
      reject(err);
      return;
    }

    const req = https.request(
      `${VANTAGE_BASE}${path}`,
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 20000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw) as VantageEnvelope<T>);
          } catch {
            reject(new Error(`Respuesta no válida de Vantage (${res.statusCode}): ${raw.slice(0, 300)}`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado llamando a la API de Vantage.")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function formatVantageDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// Vantage exige startTime/endTime en TODAS las llamadas con rango de fechas
// (incluida commissionData, aunque su documentación no lo menciona) y no
// deja pedir más de 3 meses de golpe — "The start and end times are
// mandatory and must not exceed three months." Usamos 89 días para quedar
// siempre por debajo del límite exacto.
const MAX_VANTAGE_WINDOW_MS = 89 * 24 * 60 * 60 * 1000;

// La API de comisión de Vantage no admite llamadas entre las 00:00 y las
// 06:00 (hora del servidor de Vantage). Pedimos siempre los últimos ~3
// meses: para "commission" (comisión acumulada de toda la vida de la
// cuenta) el rango solo importa para decidir qué cuentas incluye, no para
// recortar el total — si una cuenta lleva más de 3 meses sin operar y deja
// de aparecer aquí, su inactividad ya se ve igualmente por lastTradeTime.
export async function fetchVantageCommissions(): Promise<VantageCommissionRow[]> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - MAX_VANTAGE_WINDOW_MS);
  const res = await callVantageIb<VantageCommissionRow[]>("/api/ibData/commissionData", {
    startTime: formatVantageDate(startTime),
    endTime: formatVantageDate(endTime),
  });
  if (res.code !== 1) {
    throw new Error(`Vantage devolvió un error al pedir comisiones: ${res.msg}`);
  }
  return res.data ?? [];
}

export type VantageAllocationRow = {
  userId: number;
  account: number | null; // puede venir null (evento a nivel de usuario, no de una cuenta concreta)
  createTime: number; // epoch ms
  content: string | null;
  details: string | null;
  type: "In" | "Out";
};

// Allocation Data API: historial de entradas ("In") y salidas ("Out") de
// clientes/cuentas de tu IB — es la única de las 4 APIs de Vantage que dice
// explícitamente cuándo alguien deja de estar en tu IB. Un solo llamado no
// puede pedir más de ~3 meses (ver MAX_VANTAGE_WINDOW_MS) — trocear rangos
// más largos es responsabilidad de quien llama (ver syncVantageAllocations).
export async function fetchVantageAllocations(startTime: Date, endTime: Date): Promise<VantageAllocationRow[]> {
  const res = await callVantageIb<VantageAllocationRow[]>("/api/ibData/allocationData", {
    startTime: formatVantageDate(startTime),
    endTime: formatVantageDate(endTime),
  });
  if (res.code !== 1) {
    throw new Error(`Vantage devolvió un error al pedir el historial de asignaciones: ${res.msg}`);
  }
  return res.data ?? [];
}

// Porcentaje (0-100) de la comisión nueva generada que se reparte como
// V-COIN, editable desde /admin/settings. La base de conversión es fija:
// 1 céntimo de comisión = 1 V-COIN al 100% — así que a un delta de comisión
// de $12.50 (1250 céntimos) con un 50% configurado le corresponden 625
// V-COIN. Se recorta a [0, 100] por seguridad: un valor mal tecleado (ej.
// "1000" en vez de "50") no debe multiplicar los pagos por 10.
async function getVCoinPercent(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: "vcoin.commission_percent" } });
  const value = setting?.value as any;
  const raw = Number(value && typeof value === "object" && "value" in value ? value.value : value);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, raw));
}

export type VantageSyncResult = {
  totalAccountsFromVantage: number;
  matchedAccounts: number;
  accountsCredited: number;
  totalVCoinAwarded: number;
  skippedNoRate: boolean;
  // Historial de entradas/salidas del IB (Allocation Data API) — ver
  // syncVantageAllocations más abajo.
  allocationEventsFound: number;
  accountsEntered: number; // pasaron a LINKED en este sync
  accountsExited: number; // pasaron a UNLINKED en este sync
};

// Compara la comisión acumulada que devuelve Vantage ahora mismo contra la
// que teníamos guardada de la última vez (lastCommission) y solo acredita
// V-COIN por la diferencia — así una misma comisión nunca se paga dos veces
// aunque se ejecute la sincronización varias veces.
export async function syncVantageVCoin(): Promise<VantageSyncResult> {
  const percent = await getVCoinPercent();
  if (!percent || percent <= 0) {
    return {
      totalAccountsFromVantage: 0,
      matchedAccounts: 0,
      accountsCredited: 0,
      totalVCoinAwarded: 0,
      skippedNoRate: true,
      allocationEventsFound: 0,
      accountsEntered: 0,
      accountsExited: 0,
    };
  }

  const [rows, linkedAccounts] = await Promise.all([
    fetchVantageCommissions(),
    prisma.vantageIbAccount.findMany(),
  ]);

  const byAccountNumber = new Map(linkedAccounts.map((a) => [a.accountNumber, a]));

  let matchedAccounts = 0;
  let accountsCredited = 0;
  let totalVCoinAwarded = 0;

  for (const row of rows) {
    const linked = byAccountNumber.get(String(row.account));
    if (!linked) continue; // referido de Vantage que aún no vinculó su cuenta en VANTAX
    matchedAccounts += 1;

    const commission = Number(row.commission) || 0;
    const delta = commission - linked.lastCommission;
    const lastTradeTime = row.lastTradeTime ? new Date(row.lastTradeTime) : null;

    // Estos campos se refrescan siempre que la cuenta aparece en
    // commissionData, haya o no comisión nueva — así lastTradeTime (con lo
    // que se calcula si está "activo este mes") y lastSyncedAt quedan al
    // día en cada sync, no solo cuando hay V-COIN que repartir.
    const baseData = {
      vantageUserId: row.userId,
      lastTradeTime,
      accountType: row.accountType ?? linked.accountType,
      platform: row.platform ?? linked.platform,
      lastSyncedAt: new Date(),
    };

    if (delta <= 0) {
      await prisma.vantageIbAccount.update({
        where: { id: linked.id },
        data: { ...baseData, lastCommission: commission },
      });
      continue;
    }

    // percent está en [0,100]; a 100% cada céntimo de comisión nueva (delta
    // en dólares × 100) se convierte en 1 V-COIN, así que multiplicar delta
    // directamente por percent da el resultado (ej. delta=$12.50, percent=50
    // → 625 V-COIN).
    const vCoinToAward = Math.floor(delta * percent);
    if (vCoinToAward <= 0) {
      await prisma.vantageIbAccount.update({
        where: { id: linked.id },
        data: { ...baseData, lastCommission: commission },
      });
      continue;
    }

    await prisma.$transaction([
      prisma.vantageIbAccount.update({
        where: { id: linked.id },
        data: { ...baseData, lastCommission: commission, vCoinEarned: { increment: vCoinToAward } },
      }),
      prisma.user.update({
        where: { id: linked.userId },
        data: { vCoinBalance: { increment: vCoinToAward } },
      }),
    ]);

    accountsCredited += 1;
    totalVCoinAwarded += vCoinToAward;
  }

  return {
    totalAccountsFromVantage: rows.length,
    matchedAccounts,
    accountsCredited,
    totalVCoinAwarded,
    skippedNoRate: false,
    allocationEventsFound: 0,
    accountsEntered: 0,
    accountsExited: 0,
  };
}

async function getAllocationCursor(): Promise<Date> {
  const setting = await prisma.setting.findUnique({ where: { key: "vantage.allocation_cursor" } });
  const value = setting?.value as any;
  const raw = value && typeof value === "object" && "value" in value ? value.value : null;
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  // Primera vez que se corre: arrancamos un año atrás, igual que el tope de
  // commissionData, para tener algo de histórico desde el principio.
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return oneYearAgo;
}

async function setAllocationCursor(at: Date): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "vantage.allocation_cursor" },
    update: { value: { value: at.toISOString() } },
    create: { key: "vantage.allocation_cursor", value: { value: at.toISOString() } },
  });
}

// Lee el historial de entradas/salidas desde el último sync (o del último
// año, la primera vez) y actualiza VantageIbAccount.ibStatus de cada cuenta
// ya vinculada en VANTAX según su evento más reciente. Las cuentas de
// Vantage que aún no se vincularon en VANTAX (o eventos sin número de
// cuenta que no matchean ningún vantageUserId conocido) se guardan igual en
// el historial crudo, pero no afectan a ningún ibStatus.
export async function syncVantageAllocations(): Promise<Pick<VantageSyncResult, "allocationEventsFound" | "accountsEntered" | "accountsExited">> {
  const cursor = await getAllocationCursor();
  const now = new Date();

  // Vantage no deja pedir más de ~3 meses por llamada (ver
  // MAX_VANTAGE_WINDOW_MS) — si el cursor viene de más atrás (típicamente
  // solo la primera vez, que arranca un año atrás), troceamos en varias
  // llamadas hasta llegar a "now".
  const rows: VantageAllocationRow[] = [];
  let windowStart = cursor;
  while (windowStart < now) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + MAX_VANTAGE_WINDOW_MS, now.getTime()));
    const chunk = await fetchVantageAllocations(windowStart, windowEnd);
    rows.push(...chunk);
    windowStart = windowEnd;
  }

  if (rows.length > 0) {
    await prisma.vantageAllocationEvent.createMany({
      data: rows.map((r) => ({
        vantageUserId: r.userId,
        accountNumber: r.account != null ? String(r.account) : null,
        type: r.type,
        occurredAt: new Date(r.createTime),
        content: r.content,
        details: r.details,
      })),
      skipDuplicates: true,
    });
  }

  const linkedAccounts = await prisma.vantageIbAccount.findMany();
  const byAccountNumber = new Map(linkedAccounts.map((a) => [a.accountNumber, a]));
  const byVantageUserId = new Map(linkedAccounts.filter((a) => a.vantageUserId != null).map((a) => [a.vantageUserId as number, a]));

  // Nos quedamos con el evento más reciente por cuenta vinculada, por si el
  // rango trajo varios (p.ej. salió y volvió a entrar en el mismo periodo).
  const latestByAccountId = new Map<string, VantageAllocationRow & { occurredAt: Date }>();
  for (const r of rows) {
    const linked = (r.account != null ? byAccountNumber.get(String(r.account)) : undefined) ?? byVantageUserId.get(r.userId);
    if (!linked) continue;
    const occurredAt = new Date(r.createTime);
    const prevLatest = latestByAccountId.get(linked.id);
    if (!prevLatest || occurredAt > prevLatest.occurredAt) {
      latestByAccountId.set(linked.id, { ...r, occurredAt });
    }
  }

  let accountsEntered = 0;
  let accountsExited = 0;

  for (const [accountId, event] of latestByAccountId) {
    const linked = linkedAccounts.find((a) => a.id === accountId)!;
    // Solo aplicamos si este evento es más nuevo que el último que ya
    // teníamos aplicado, para no retroceder el estado con datos viejos.
    if (linked.lastAllocationAt && event.occurredAt <= linked.lastAllocationAt) continue;

    const newStatus = event.type === "Out" ? "UNLINKED" : "LINKED";
    if (newStatus !== linked.ibStatus) {
      if (newStatus === "LINKED") accountsEntered += 1;
      else accountsExited += 1;
    }

    await prisma.vantageIbAccount.update({
      where: { id: accountId },
      data: { ibStatus: newStatus, lastAllocationAt: event.occurredAt, lastAllocationType: event.type },
    });
  }

  await setAllocationCursor(now);

  return { allocationEventsFound: rows.length, accountsEntered, accountsExited };
}

// Sync completo de Vantage (un solo botón en /admin/settings): comisión →
// V-COIN por lotaje de comisión, más el historial de entradas/salidas del
// IB. Se combinan en un único resultado para no tener dos botones separados.
export async function syncVantageFull(): Promise<VantageSyncResult> {
  const commissionResult = await syncVantageVCoin();
  if (commissionResult.skippedNoRate) return commissionResult;

  try {
    const allocationResult = await syncVantageAllocations();
    return { ...commissionResult, ...allocationResult };
  } catch (err) {
    // Si falla el historial de allocations (p.ej. la API no responde), no
    // queremos perder el resultado de la comisión que sí funcionó — se
    // informa como si no hubiera habido movimientos de entrada/salida esta
    // vez, y se puede reintentar en el próximo sync.
    console.error("Error sincronizando el historial de entradas/salidas de Vantage:", err);
    return commissionResult;
  }
}
