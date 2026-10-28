import { NextResponse } from "next/server";
import { getChartsUserId } from "@/lib/charts/viewer";
import { feedOnline, searchSymbols, symbolsReady } from "@/lib/charts/feed-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getChartsUserId())) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ online: feedOnline(), ready: symbolsReady(), symbols: searchSymbols(q) });
}
