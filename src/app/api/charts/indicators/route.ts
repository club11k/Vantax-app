import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChartsViewer, packCode, parseIndicatorBody as parseBody } from "@/lib/charts/viewer";

export const dynamic = "force-dynamic";

// Indicadores Pine de CHARTS (28/10/2026).
// GET: los que puede usar quien pregunta (admin: todos).
// POST (solo admin): crear uno nuevo.
export async function GET() {
  const viewer = await getChartsViewer();
  if (!viewer) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const rows = await prisma.chartIndicator.findMany({
    where: viewer.isAdmin
      ? {}
      : { OR: [{ visibility: "ALL" }, { visibility: "SELECTED", access: { some: { userId: viewer.userId } } }] },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: viewer.isAdmin ? { _count: { select: { access: true } } } : undefined,
  });
  return NextResponse.json(
    {
      isAdmin: viewer.isAdmin,
      indicators: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        // el admin recibe el código tal cual para editarlo; el resto, ofuscado
        code: viewer.isAdmin ? r.code : undefined,
        packed: viewer.isAdmin ? undefined : packCode(r.code, r.id),
        visibility: viewer.isAdmin ? r.visibility : undefined,
        accessCount: viewer.isAdmin ? r._count?.access ?? 0 : undefined,
        updatedAt: r.updatedAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const viewer = await getChartsViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Solo el admin puede crear indicadores." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = parseBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const count = await prisma.chartIndicator.count();
  const row = await prisma.chartIndicator.create({ data: { ...parsed, sortOrder: count } });
  return NextResponse.json({ ok: true, id: row.id });
}
