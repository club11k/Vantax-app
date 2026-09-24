import { NextResponse } from "next/server";
import { syncVantageFull } from "@/lib/vantage-ib";

// Dispara el sync COMPLETO de Vantage (comisión → V-COIN y lastTradeTime,
// más el historial de entradas/salidas del IB) de forma AUTOMÁTICA, sin que
// nadie tenga que entrar a /admin/settings y darle al botón.
//
// Pensado para llamarse UNA VEZ AL DÍA desde un Cron Job de Render (no
// desde el orquestador de la VPS a propósito: ese depende de que el VPS y
// MT5 estén sanos, y este sync no necesita nada de eso — es una llamada
// HTTPS normal desde el propio servidor de Render, así que mejor mantenerlo
// separado para que un problema en la VPS no afecte también al bloqueo de
// cuentas). Protegido con un secreto propio (CRON_SECRET), igual que el
// orquestador de MT5 usa el suyo (MT5_ORCHESTRATOR_SECRET) — nunca con la
// sesión de NextAuth, porque quien llama no es un usuario con sesión.
//
// IMPORTANTE: el bloqueo por SALIR del IB no depende de este cron diario —
// eso lo cubre /api/cron/vantage-sync-allocations, pensado para correr
// mucho más seguido (cada 15-30 min), para que se note casi al momento. Este
// de aquí es solo para la comisión/V-COIN y el refresco de lastTradeTime
// (que alimenta el bloqueo por 30 días de inactividad, donde un día de
// margen no importa nada).
//
// Configuración en Render:
//  1. Variable de entorno CRON_SECRET (un valor largo al azar) en el
//     servicio web de Vantax.
//  2. Un Cron Job en Render, con la MISMA variable CRON_SECRET, que
//     ejecute UNA VEZ AL DÍA algo como:
//       curl -fsS -X POST https://<tu-dominio-de-render>/api/cron/vantage-sync \
//         -H "Authorization: Bearer $CRON_SECRET"
//  3. OTRO Cron Job (o el mismo servicio con dos schedules si Render lo
//     permite), cada 15-30 min, apuntando a
//     /api/cron/vantage-sync-allocations en vez de a esta ruta — ver ese
//     archivo para más detalle.

function checkSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === expected;
}

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await syncVantageFull();
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("Error en el cron de sync de Vantage:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Error desconocido." }, { status: 500 });
  }
}
