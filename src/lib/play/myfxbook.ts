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
// Portado de club11k/vantax-play-backend (src/services/myfxbookSync.js).
// Esta primera fase solo incluye las piezas necesarias para el registro
// (login, listar cuentas, detectar broker/tipo de cuenta): la sincronización
// periódica de lotes/beneficio y el reparto automático de V-COIN son una
// fase posterior.
//
// No usamos ninguna librería de terceros para hablar con Myfxbook: son
// llamadas HTTP GET sencillas, así que las hacemos directamente con fetch
// (nativo en Node 18+) para no añadir una dependencia externa no oficial
// que maneje credenciales de los jugadores.

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

async function myfxbookGet(
  path: string,
  cookie?: string | null
): Promise<{ data: any; cookie: string | null }> {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};
  const res = await fetch(`${MYFXBOOK_BASE}/${path}`, { headers });
  if (!res.ok) throw new Error(`Myfxbook respondió ${res.status} en ${path}`);
  const data = await res.json();
  if (data.error) throw new Error(data.message || "Error desconocido de Myfxbook");
  return { data, cookie: res.headers.get("set-cookie") || cookie || null };
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
