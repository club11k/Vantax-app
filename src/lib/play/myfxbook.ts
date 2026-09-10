// myfxbook — alternativa gratuita a un servicio de pago (tipo MetaApi) para
// leer, en modo observador, el saldo de las cuentas MT5 de los jugadores de
// Vantax Play, usando la API pública de Myfxbook (https://www.myfxbook.com/api).
//
// Cada jugador tiene su PROPIA cuenta de Myfxbook (creada por él mismo),
// donde vincula su cuenta MT5 con la contraseña investor. Nosotros iniciamos
// sesión con el email/contraseña de esa cuenta de Myfxbook (guardados
// cifrados, ver src/lib/play/crypto.ts) para leer sus datos — no necesitamos
// la contraseña investor de MT5 directamente, porque Myfxbook ya hizo esa
// parte.
//
// IMPORTANTE — por qué esto pasa por el proxy de IP fija: las sesiones de
// la API de Myfxbook quedan atadas a la IP que hizo el login (lo confirma
// su propia documentación). Como el hosting no tiene una IP de salida fija
// por defecto, el login podía salir por una IP y la siguiente llamada por
// otra distinta, y Myfxbook devolvía "Invalid session" aunque el login
// hubiera sido correcto. Por eso todas las llamadas de aquí pasan por el
// mismo proxy Squid del droplet de DigitalOcean que ya se usa para la API
// de Vantage (ver src/lib/proxy.ts) — login y lectura salen siempre por la
// misma IP fija (46.101.254.106).
//
// SEGUNDO BUG encontrado (además del de la IP): la cookie que devuelve
// Myfxbook en el header Set-Cookie trae pegados atributos como "Path=/" o
// "HttpOnly" (ej. "MYFXBOOKSESSID=abc123; Path=/; HttpOnly"). Reenviar eso
// tal cual como header Cookie en la siguiente petición es inválido — el
// Cookie header solo debe llevar pares "nombre=valor", nunca esos
// atributos — y el servidor de Myfxbook lo estaba rechazando, devolviendo
// "Invalid session" aunque el login fuera correcto. parseCookieJar/
// mergeSetCookies de abajo limpian eso antes de reenviarlo.
//
// Esta primera fase solo incluye las piezas necesarias para el registro
// (login, listar cuentas, detectar broker/tipo de cuenta): la sincronización
// periódica de lotes/beneficio y el reparto automático de V-COIN son una
// fase posterior.
//
// No usamos ninguna librería de terceros para hablar con Myfxbook en sí
// (solo https-proxy-agent para el transporte, igual que en vantage-ib.ts):
// son llamadas HTTP GET sencillas hechas con el módulo nativo `https` de
// Node, para no depender de una librería externa no oficial que maneje
// credenciales de los jugadores.

import https from "node:https";
import { getFixedIpProxyAgent } from "@/lib/proxy";

const MYFXBOOK_BASE = "https://www.myfxbook.com/api";

export type MyfxbookAuth = {
  session: string;
  cookie: string | null;
};

export type MyfxbookAccount = {
  id: number;
  accountId?: number;
  login?: number | string;
  name?: string;
  server?: string;
  balance?: number;
  equity?: number;
  [key: string]: unknown;
};

// Extrae solo los pares "nombre=valor" de uno o varios headers Set-Cookie
// (descarta Path/Domain/Expires/HttpOnly/Secure/SameSite), y los combina con
// los que ya teníamos de una respuesta anterior (login puede fijar una
// cookie, y a veces el servidor renueva/agrega otra en una llamada
// posterior) para formar el header Cookie correcto de la siguiente petición.
function mergeSetCookies(existingCookie: string | null | undefined, setCookieHeader: string | string[] | undefined): string | null {
  const jar: Record<string, string> = {};
  for (const part of (existingCookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) jar[name] = value;
  }
  const rawCookies = setCookieHeader ? (Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]) : [];
  for (const raw of rawCookies) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) jar[name] = value;
  }
  const entries = Object.entries(jar);
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join("; ") : null;
}

function myfxbookGet(path: string, cookie?: string | null): Promise<{ data: any; cookie: string | null }> {
  return new Promise((resolve, reject) => {
    let agent: ReturnType<typeof getFixedIpProxyAgent>;
    try {
      agent = getFixedIpProxyAgent();
    } catch (err) {
      reject(err);
      return;
    }

    // User-Agent explícito: por defecto Node no manda uno "normal", y no
    // cuesta nada evitar que algún filtro anti-bot lo use como excusa.
    const headers: Record<string, string> = {
      "User-Agent": "VantaxPlay/1.0 (+https://club11k.com)",
    };
    if (cookie) headers.Cookie = cookie;

    const req = https.request(
      `${MYFXBOOK_BASE}/${path}`,
      { method: "GET", agent, headers, timeout: 20000 },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data: any;
          try {
            data = JSON.parse(raw);
          } catch {
            reject(new Error(`Respuesta no válida de Myfxbook (${res.statusCode}): ${raw.slice(0, 300)}`));
            return;
          }
          if (data.error) {
            reject(new Error(data.message || "Error desconocido de Myfxbook"));
            return;
          }
          const newCookie = mergeSetCookies(cookie, res.headers["set-cookie"]);
          resolve({ data, cookie: newCookie });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado llamando a la API de Myfxbook.")));
    req.on("error", reject);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Devuelve tanto el token de "session" como la cookie que exige Myfxbook por
// detrás — hace falta reenviar AMBAS cosas en cada petición siguiente, o
// Myfxbook responde "Invalid session" aunque el token en sí sea correcto.
//
// La pequeña espera antes de devolver el resultado es defensiva: en algún
// hilo de soporte de Myfxbook la sesión tarda un instante en propagarse del
// lado del servidor y una llamada inmediatamente después del login puede
// fallar con "Invalid session" aunque el login haya sido correcto.
export async function myfxbookLogin(email: string, password: string): Promise<MyfxbookAuth> {
  const { data, cookie } = await myfxbookGet(
    `login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );
  await sleep(800);
  return { session: data.session, cookie };
}

export async function myfxbookLogout(auth: MyfxbookAuth): Promise<void> {
  try {
    await myfxbookGet(`logout.json?session=${encodeURIComponent(auth.session)}`, auth.cookie);
  } catch {
    // no crítico
  }
}

export async function myfxbookGetMyAccounts(auth: MyfxbookAuth): Promise<MyfxbookAccount[]> {
  const { data } = await myfxbookGet(`get-my-accounts.json?session=${encodeURIComponent(auth.session)}`, auth.cookie);
  return data.accounts || [];
}

// Deduce un nombre de broker legible a partir del nombre de servidor MT5
// que reporta Myfxbook (ej. "VantageInternational-Live 11" -> "VantageInternational").
export function brokerNameFromServer(server: string | null | undefined): string {
  if (!server) return "Broker";
  const name = server.split(/[-\s]/)[0].trim();
  return name || "Broker";
}

// Heurística sencilla para distinguir cuentas Cent/Micro de cuentas Normal
// a partir del nombre de servidor o del nombre de la propia cuenta en Myfxbook.
export function detectAccountType(
  server: string | null | undefined,
  accountName: string | null | undefined
): "CENT" | "NORMAL" {
  const text = `${server || ""} ${accountName || ""}`.toLowerCase();
  return /cent|micro/.test(text) ? "CENT" : "NORMAL";
}
