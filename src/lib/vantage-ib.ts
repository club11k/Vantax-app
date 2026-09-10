// Integración con la API de IB de Vantage (documento "Vantage IB Access API"
// que compartió Esther). Solo se usa el endpoint de comisión (commissionData):
// la API de Vantage NO expone el lotaje de cada operación individual, solo
// comisión acumulada por cuenta — por eso el sistema de V-COIN para cuentas
// de Vantage se basa en comisión generada, no en lotes como en el resto del
// proyecto Vantax Play (que usa Myfxbook).
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

// La API de comisión de Vantage no admite llamadas entre las 00:00 y las
// 06:00 (hora del servidor de Vantage) y solo devuelve datos del último año.
export async function fetchVantageCommissions(): Promise<VantageCommissionRow[]> {
  const res = await callVantageIb<VantageCommissionRow[]>("/api/ibData/commissionData");
  if (res.code !== 1) {
    throw new Error(`Vantage devolvió un error al pedir comisiones: ${res.msg}`);
  }
  return res.data ?? [];
}

async function getVCoinRate(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: "vcoin.rate_per_dollar_commission" } });
  const value = setting?.value as any;
  const rate = Number(value && typeof value === "object" && "value" in value ? value.value : value);
  return Number.isFinite(rate) ? rate : 0;
}

export type VantageSyncResult = {
  totalAccountsFromVantage: number;
  matchedAccounts: number;
  accountsCredited: number;
  totalVCoinAwarded: number;
  skippedNoRate: boolean;
};

// Compara la comisión acumulada que devuelve Vantage ahora mismo contra la
// que teníamos guardada de la última vez (lastCommission) y solo acredita
// V-COIN por la diferencia — así una misma comisión nunca se paga dos veces
// aunque se ejecute la sincronización varias veces.
export async function syncVantageVCoin(): Promise<VantageSyncResult> {
  const rate = await getVCoinRate();
  if (!rate || rate <= 0) {
    return {
      totalAccountsFromVantage: 0,
      matchedAccounts: 0,
      accountsCredited: 0,
      totalVCoinAwarded: 0,
      skippedNoRate: true,
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

    if (delta <= 0) {
      // Sin comisión nueva desde el último sync. Si Vantage devolvió un
      // valor distinto (p.ej. un ajuste a la baja), igualmente actualizamos
      // la referencia para no perder el hilo, pero sin acreditar V-COIN.
      if (commission !== linked.lastCommission) {
        await prisma.vantageIbAccount.update({
          where: { id: linked.id },
          data: {
            lastCommission: commission,
            accountType: row.accountType ?? linked.accountType,
            platform: row.platform ?? linked.platform,
            lastSyncedAt: new Date(),
          },
        });
      }
      continue;
    }

    const vCoinToAward = Math.floor(delta * rate);
    if (vCoinToAward <= 0) {
      await prisma.vantageIbAccount.update({
        where: { id: linked.id },
        data: { lastCommission: commission, lastSyncedAt: new Date() },
      });
      continue;
    }

    await prisma.$transaction([
      prisma.vantageIbAccount.update({
        where: { id: linked.id },
        data: {
          lastCommission: commission,
          vCoinEarned: { increment: vCoinToAward },
          accountType: row.accountType ?? linked.accountType,
          platform: row.platform ?? linked.platform,
          lastSyncedAt: new Date(),
        },
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
  };
}
