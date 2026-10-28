import { NextResponse } from "next/server";
import { getChartsUserId } from "@/lib/charts/viewer";
import { feedOnline, getLastBars, isTimeframe } from "@/lib/charts/feed-store";

export const dynamic = "force-dynamic";

// Últimas velas (la de ahora y la anterior) para el tiempo real.
export async function GET(req: Request) {
  if (!(await getChartsUserId())) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get("symbol") ?? "").slice(0, 64);
  const tf = sp.get("tf") ?? "";
  if (!symbol || !isTimeframe(tf)) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  return NextResponse.json({ online: feedOnline(), bars: getLastBars(symbol, tf) }, { headers: { "Cache-Control": "no-store" } });
}
