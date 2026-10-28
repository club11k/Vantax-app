import { NextResponse } from "next/server";
import { z } from "zod";
import { checkFeedSecret } from "@/lib/charts/feed-auth";
import { feedPutSymbols } from "@/lib/charts/feed-store";

const schema = z.object({
  symbols: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        description: z.string().max(200).default(""),
        path: z.string().max(200).default(""),
        digits: z.number().int().min(0).max(10).default(2),
      })
    )
    .max(20000),
});

export async function POST(req: Request) {
  if (!checkFeedSecret(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  feedPutSymbols(parsed.data.symbols);
  return NextResponse.json({ ok: true, count: parsed.data.symbols.length });
}
