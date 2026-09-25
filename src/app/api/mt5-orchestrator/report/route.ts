import { NextResponse } from "next/server";
import { z } from "zod";
import { applyMt5SyncResult } from "@/lib/play/mt5-native-sync";
import { applyJournalMt5Result } from "@/lib/journal/mt5-sync";

// El orquestador Python llama aquí después de leer cada cuenta en MT5. El
// campo "kind" (el mismo que le llegó en /api/mt5-orchestrator/pending) dice
// qué lógica aplicar: Play acredita V-COIN/progreso por el delta de lotes
// del mes (ver src/lib/play/mt5-native-sync.ts); Journaly solo guarda el
// resultado del día en el diario, sin pisar nunca una entrada manual o de
// foto (ver src/lib/journal/mt5-sync.ts).
//
// Sustituye a la ruta antigua /api/play/mt5-orchestrator/report (ahora
// eliminada) — si tu repo en GitHub todavía tiene esa carpeta antigua,
// bórrala, ya no se usa.

function checkSecret(req: Request): boolean {
  const expected = process.env.MT5_ORCHESTRATOR_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === expected;
}

const reportSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("play"),
    accountId: z.string().min(1),
    balance: z.number(),
    equity: z.number(),
    lotsThisMonth: z.number(),
    profitAmount: z.number().optional(),
    // Opcional para no romper con un orquestador viejo que todavía no lo
    // mande — ver src/lib/play/mt5-native-sync.ts.
    lastTradeTime: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("journal"),
    accountId: z.string().min(1),
    resultAmount: z.number(),
    date: z.string().optional(),
    // Saldo actual de la cuenta — opcional para no romper con un
    // orquestador viejo que todavía no lo mande; se usa como saldo inicial
    // solo la primera vez que se sincroniza esta cuenta (ver
    // src/lib/journal/mt5-sync.ts).
    balance: z.number().optional(),
  }),
]);

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  try {
    if (parsed.data.kind === "play") {
      const { kind, ...report } = parsed.data;
      const outcome = await applyMt5SyncResult(report);
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error }, { status: 404 });
      }
      return NextResponse.json(outcome);
    }

    const { kind, ...report } = parsed.data;
    const outcome = await applyJournalMt5Result(report);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.reason }, { status: 404 });
    }
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("Error aplicando el sync MT5 propio:", err);
    return NextResponse.json({ error: "No se pudo procesar el reporte." }, { status: 500 });
  }
}
