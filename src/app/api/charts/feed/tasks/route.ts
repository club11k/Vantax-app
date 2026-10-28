import { NextResponse } from "next/server";
import { checkFeedSecret } from "@/lib/charts/feed-auth";
import { feedTasks } from "@/lib/charts/feed-store";

export const dynamic = "force-dynamic";

// El feed de la VPS pregunta aquí cada segundo qué tiene que mandar.
export async function GET(req: Request) {
  if (!checkFeedSecret(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  return NextResponse.json(feedTasks(), { headers: { "Cache-Control": "no-store" } });
}
