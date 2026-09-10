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
// hubiera sido correcto — esto es lo que impedía que Myfxbook se conectara
// en el backend original de Vantax Play. Por eso todas las llamadas de aquí
// pasan por el mismo proxy Squid del droplet de DigitalOcean que ya se usa
// para la API de Vantage (ver src/lib/proxy.ts) — login y lectura salen
// siempre por la misma IP fija (46.101.254.106).
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

function myfxbookGet(path: string, cookie?: string | null): Promise<{ data: any; cookie: string | null }> {
  return new Promise((resolve, reject) => {
    let agent: ReturnType<typeof getFixedIpProxyAgent>;
    try {
      agent = getFixedIpProxyAgent();
    } catch (err) {
      reject(err);
      return;
    }

    const headers: Record<string, string> = {};
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
          const setCookie = res.headers["set-cookie"];
          const newCookie = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie || cookie || null;
          resolve({ data, cookie: newCookie ?? null });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado llamando a la API de Myfxbook.")));
    req.on("error", reject);
    req.end();
  });
}

// Devuelve tanto el token de "session" como la cookie que exige Myfxbook por
// detrás — hace falta reenviar AMBAS cosas en cada petición siguiente, o
// Myfxbook responde "Invalid session" aunque el token en sí sea correcto.
export async function myfxbookLogin(email: string, password: string): Promise<MyfxbookAuth> {
  const { data, cookie } = await myfxbookGet(
    `login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );
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
