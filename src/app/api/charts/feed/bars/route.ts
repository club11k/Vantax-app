import { NextResponse } from "next/server";
import { z } from "zod";
import { checkFeedSecret } from "@/lib/charts/feed-auth";
import { TIMEFRAMES, feedPutBars } from "@/lib/charts/feed-store";

const bar = z.object({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number() });
const schema = z.object({
  symbol: z.string().min(1).max(64),
  tf: z.enum(TIMEFRAMES),
  before: z.number().nullable().optional(),
  bars: z.array(bar).max(10000),
  error: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  if (!checkFeedSecret(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;
  feedPutBars(d.symbol, d.tf, d.before ?? null, d.bars, d.error);
  return NextResponse.json({ ok: true });
}
