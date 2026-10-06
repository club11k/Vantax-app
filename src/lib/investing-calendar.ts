// Calendario económico de EE. UU. leído del widget gratuito de Investing.com
// (sslecal2.investing.com) — mismo sistema que usa la librería
// open-source "investing-economic-calendar". Pedido el 06/10/2026: el widget
// incrustado tal cual se veía feo y sin botones de hoy/mañana/semana, así
// que el servidor lee sus datos (misma importancia y mismo dato real que en
// Investing) y la web los pinta con su propio diseño.
//
// - Esta semana: siempre disponible (calType=week).
// - Próxima semana: se intenta pidiendo el rango de fechas; si Investing no lo
//   devuelve, la pestaña lo avisa y enlaza a Investing.
// - Investing bloquea las IPs de Render (HTTP 403, visto el 06/10/2026), así
//   que si la petición directa falla se reintenta por el proxy del droplet
//   de DigitalOcean (VANTAGE_PROXY_URL, el mismo que ya usa Vantage).
// - Se guarda en memoria 5 minutos para no pedir de más; si falla, se sigue
//   mostrando el último dato bueno.

import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";

export type InvImportance = 1 | 2 | 3;

export type InvEvent = {
  id: string;
  time: string; // "15:45" (hora de España) o "Todo el día"
  importance: InvImportance;
  name: string;
  actual: string;
  actualTone: "up" | "down" | "";
  forecast: string;
  previous: string;
};

export type InvDay = { ts: number; label: string; events: InvEvent[] };

const BASE = "https://sslecal2.investing.com/";
const COMMON = {
  columns: "exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous",
  countries: "5", // Estados Unidos
  timeZone: "58", // hora de España (GMT+1/+2)
  lang: "4", // español
};

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function cellByClass(rowHtml: string, cls: string): { html: string; classAttr: string } | null {
  const re = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml))) {
    const classAttr = (/class\s*=\s*"([^"]*)"/i.exec(m[1])?.[1] ?? "").toLowerCase();
    const parts = classAttr.split(/\s+/);
    if (cls.split(" ").every((c) => parts.includes(c))) return { html: m[2], classAttr };
  }
  return null;
}

export function parseInvestingWidget(html: string): InvDay[] {
  const days: InvDay[] = [];
  const rows = html.split(/<tr\b/i).slice(1);
  let current: InvDay | null = null;
  for (const raw of rows) {
    const row = "<tr" + raw.split(/<\/tr>/i)[0];
    const dayMatch = /<td\b[^>]*class\s*=\s*"[^"]*theDay[^"]*"[^>]*id\s*=\s*"theDay(\d+)"[^>]*>([\s\S]*?)<\/td>/i.exec(row) ||
      /<td\b[^>]*id\s*=\s*"theDay(\d+)"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    if (dayMatch) {
      current = { ts: Number(dayMatch[1]), label: decode(dayMatch[2]), events: [] };
      days.push(current);
      continue;
    }
    const idMatch = /id\s*=\s*"eventRowId_(\d+)"/i.exec(row);
    if (!idMatch || !current) continue;
    const time = cellByClass(row, "time");
    const sentiment = cellByClass(row, "sentiment");
    const event = cellByClass(row, "event");
    const act = cellByClass(row, "act");
    const fore = cellByClass(row, "fore");
    const prev = cellByClass(row, "prev");
    const bulls = (sentiment?.html.match(/grayFullBullishIcon/g) ?? []).length;
    const actClass = act?.classAttr ?? "";
    current.events.push({
      id: idMatch[1],
      time: decode(time?.html ?? ""),
      importance: (bulls >= 3 ? 3 : bulls === 2 ? 2 : 1) as InvImportance,
      name: decode(event?.html ?? ""),
      actual: decode(act?.html ?? ""),
      actualTone: actClass.includes("green") ? "up" : actClass.includes("red") ? "down" : "",
      forecast: decode(fore?.html ?? ""),
      previous: decode(prev?.html ?? ""),
    });
  }
  return days.filter((d) => d.events.length > 0);
}

const BROWSER_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9",
  "Accept-Encoding": "identity",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  Referer: "https://es.investing.com/",
};

// Petición directa desde Render.
async function getDirect(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { cache: "no-store", headers: BROWSER_HEADERS });
  return { status: res.status, body: await res.text() };
}

// Misma petición, pero saliendo por el proxy del droplet (IP fija).
function getViaProxy(url: string): Promise<{ status: number; body: string }> {
  const proxyUrl = process.env.VANTAGE_PROXY_URL;
  if (!proxyUrl) return Promise.reject(new Error("sin VANTAGE_PROXY_URL"));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", agent: new HttpsProxyAgent(proxyUrl), headers: BROWSER_HEADERS, timeout: 20000 }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw }));
    });
    req.on("timeout", () => req.destroy(new Error("tiempo de espera agotado")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchWidget(extra: Record<string, string>): Promise<InvDay[] | null> {
  const url = `${BASE}?${new URLSearchParams({ ...COMMON, ...extra }).toString()}`;
  const attempts: [string, (u: string) => Promise<{ status: number; body: string }>][] = [
    ["directo", getDirect],
    ["proxy", getViaProxy],
  ];
  for (const [name, fn] of attempts) {
    try {
      const { status, body } = await fn(url);
      if (status < 200 || status >= 300) {
        console.warn(`[investing-calendar] ${name}: HTTP ${status}`);
        continue;
      }
      if (!/ecEventsTable|eventRowId/.test(body)) {
        console.warn(`[investing-calendar] ${name}: respuesta sin tabla de eventos (${body.slice(0, 80)})`);
        continue;
      }
      console.log(`[investing-calendar] ${name}: OK`);
      return parseInvestingWidget(body);
    } catch (err: any) {
      console.warn(`[investing-calendar] ${name}: error ${err?.message ?? err}`);
    }
  }
  return null;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Cache = { thisWeek: InvDay[]; nextWeek: InvDay[] | null; at: number; tried: number; ok: boolean };
const cache: Cache = { thisWeek: [], nextWeek: null, at: 0, tried: 0, ok: false };
const TTL = 5 * 60 * 1000;
const RETRY = 2 * 60 * 1000;

export async function getInvestingCalendar(): Promise<{ ok: boolean; thisWeek: InvDay[]; nextWeek: InvDay[] | null }> {
  const now = Date.now();
  if ((cache.ok && now - cache.at < TTL) || now - cache.tried < RETRY) {
    return { ok: cache.ok, thisWeek: cache.thisWeek, nextWeek: cache.nextWeek };
  }
  cache.tried = now;

  const thisWeek = await fetchWidget({ calType: "week" });
  if (thisWeek) {
    cache.thisWeek = thisWeek;
    cache.ok = true;
    cache.at = now;

    // Próxima semana: lunes a domingo siguientes. Solo se acepta si lo que
    // devuelve Investing cae de verdad dentro de ese rango.
    const today = new Date();
    const dow = (today.getUTCDay() + 6) % 7; // lunes = 0
    const nextMon = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dow + 7));
    const nextSun = new Date(nextMon.getTime() + 6 * 86400000);
    const next = await fetchWidget({ calType: "week", dateFrom: ymd(nextMon), dateTo: ymd(nextSun) });
    const from = nextMon.getTime() / 1000 - 86400;
    const to = nextSun.getTime() / 1000 + 86400;
    const valid = next && next.length > 0 && next.every((d) => d.ts >= from && d.ts <= to);
    cache.nextWeek = valid ? next : null;
  }
  return { ok: cache.ok, thisWeek: cache.thisWeek, nextWeek: cache.nextWeek };
}
