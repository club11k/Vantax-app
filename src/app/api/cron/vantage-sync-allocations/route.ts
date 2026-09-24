import { NextResponse } from "next/server";
import { syncVantageAllocations } from "@/lib/vantage-ib";

// Sync LIGERO: solo el historial de entradas/salidas del IB de Vantage
// (Allocation Data API), que es lo único que decide ibStatus (LINKED /
// UNLINKED) — ver src/lib/vantage-ib.ts y src/lib/vantage-block.ts.
//
// Se separa a propósito del sync completo (/api/cron/vantage-sync, que
// además trae comisión/V-COIN/lastTradeTime y solo debería correr una vez
// al día): cuando alguien se va del IB, el bloqueo tiene que notarse casi
// al momento, no al día siguiente — así que ESTE endpoint está pensado para
// llamarse mucho más a menudo (ej. cada 15-30 min) desde un Cron Job de
// Render aparte. La API de allocations no tiene la restricción horaria de
// la de comisión, así que no hay problema en llamarla seguido.
//
// Mismo secreto que el otro cron (CRON_SECRET) — configúralo igual.

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
    const result = await syncVantageAllocations();
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("Error en el cron de allocations de Vantage:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Error desconocido." }, { status: 500 });
  }
}
