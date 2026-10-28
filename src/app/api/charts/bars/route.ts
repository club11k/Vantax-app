import { NextResponse } from "next/server";
import { getChartsUserId } from "@/lib/charts/viewer";
import { feedOnline, getBars, isTimeframe, symbolInfo } from "@/lib/charts/feed-store";

export const dynamic = "force-dynamic";

// Velas de un símbolo. Si todavía no están, devuelve "pending" y el gráfico
// vuelve a preguntar en un momento (el feed de la VPS las trae en 1-2 s).
export async function GET(req: Request) {
  if (!(await getChartsUserId())) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get("symbol") ?? "").slice(0, 64);
  const tf = sp.get("tf") ?? "";
  const beforeRaw = Number(sp.get("before"));
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;
  if (!symbol || !isTimeframe(tf)) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  const result = getBars(symbol, tf, before);
  return NextResponse.json(
    { ...result, online: feedOnline(), digits: symbolInfo(symbol)?.digits ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
