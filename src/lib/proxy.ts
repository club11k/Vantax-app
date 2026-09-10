// Agente de proxy HTTPS compartido, para que las llamadas salientes a APIs
// externas que exigen una IP fija (Vantage IB, Myfxbook) salgan siempre por
// el proxy Squid montado en el droplet de DigitalOcean (46.101.254.106).
//
// El nombre de la variable de entorno (VANTAGE_PROXY_URL) quedó así porque
// se creó primero para la API de Vantage, pero el proxy en sí es genérico:
// cualquier integración que necesite salir siempre por la misma IP fija
// puede reutilizar esta misma variable, sin tener que dar de alta un nuevo
// droplet ni una nueva variable en Render.
//
// Caso de uso confirmado en Myfxbook: sus sesiones de API quedan atadas a
// la IP que hizo el login ("Sessions are IP-bound... valid only from the IP
// address used during login" — https://www.myfxbook.com/api). Como Render
// no usa una IP de salida fija por defecto, el login podía salir por una IP
// y la siguiente llamada (leer cuentas) por otra, y Myfxbook respondía
// "Invalid session" aunque el login hubiera sido correcto. Pasando TODAS
// las llamadas por este proxy, login y lectura salen siempre por la misma
// IP y la sesión ya no se invalida.

import { HttpsProxyAgent } from "https-proxy-agent";

export function getFixedIpProxyAgent(): HttpsProxyAgent<string> {
  const proxyUrl = process.env.VANTAGE_PROXY_URL;
  if (!proxyUrl) {
    throw new Error(
      "Falta la variable de entorno VANTAGE_PROXY_URL (proxy del droplet de DigitalOcean con la IP fija)."
    );
  }
  return new HttpsProxyAgent(proxyUrl);
}
