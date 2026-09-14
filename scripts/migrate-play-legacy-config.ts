// Segunda pasada de la migración de Vantax Play: trae la CONFIGURACIÓN que
// el primer script (migrate-play-legacy.ts) dejó fuera a propósito por no
// ser "datos de usuarios reales" — escala de V-COIN por lotes, metas de
// cada tramo (lotes/días), ligas y torneos. Solo AÑADE lo que falte: si en
// el sistema nuevo ya hay una fila que coincide por su clave natural
// (accountType+minLots, tier, nombre de liga), la deja tal cual, nunca la
// sobrescribe — así no se pisa nada que ya se haya configurado a mano en
// /admin desde que arrancó la Fase 1.
//
// ============================================================
// CÓMO EJECUTARLO (igual que el primer script)
// ============================================================
// 1. Modo prueba (no escribe nada, solo cuenta qué falta):
//
//      OLD_DATABASE_URL="postgres://...la_url_vieja..." \
//      npx tsx scripts/migrate-play-legacy-config.ts
//
// 2. Si el resumen muestra que falta algo y quieres traerlo, repite con
//    DRY_RUN=false:
//
//      OLD_DATABASE_URL="postgres://...la_url_vieja..." \
//      DRY_RUN=false \
//      npx tsx scripts/migrate-play-legacy-config.ts
//
// No hace falta OLD_ENCRYPTION_KEY aquí (esta tabla no tiene nada cifrado).
// Es seguro de correr varias veces: la segunda vez ya no habrá nada que
// añadir porque todo lo que trajo la primera ya tiene su clave natural en
// el sistema nuevo.

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DRY_RUN = process.env.DRY_RUN !== "false";
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;

if (!OLD_DATABASE_URL) {
  console.error("Falta OLD_DATABASE_URL (la DATABASE_URL del servicio vantax-play-backend en Render).");
  process.exit(1);
}

const prisma = new PrismaClient();
const oldPool = new Pool({ connectionString: OLD_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ACCOUNT_TYPE: Record<string, "NORMAL" | "CENT"> = { normal: "NORMAL", cent: "CENT" };
const TIER: Record<string, "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO"> = {
  basico: "BASICO",
  intermedio: "INTERMEDIO",
  epico: "EPICO",
  legendario: "LEGENDARIO",
};
const RANKING_CRITERION: Record<string, "PROFIT_PCT" | "LOTS"> = { profit_pct: "PROFIT_PCT", lots: "LOTS" };

type Counts = Record<string, number>;

async function main() {
  console.log(`\n=== Migración Vantax Play — configuración (2ª pasada) — modo ${DRY_RUN ? "PRUEBA (no escribe nada)" : "REAL"} ===\n`);

  const counts: Counts = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // ---------- Escala de V-COIN por lotes (normal/cent) ----------
  const { rows: oldScale } = await oldPool.query("SELECT * FROM vcoin_scale ORDER BY account_type, min_lots");
  for (const s of oldScale) {
    const accountType = ACCOUNT_TYPE[s.account_type];
    if (!accountType) continue;
    const existing = await prisma.playVCoinScale.findUnique({
      where: { accountType_minLots: { accountType, minLots: Number(s.min_lots) } },
    });
    if (existing) {
      bump("escala_vcoin.ya_existia");
      continue;
    }
    bump("escala_vcoin.añadida");
    console.log(`  + escala ${accountType} desde ${s.min_lots} lotes → ${s.rate_per_lot} V-COIN/lote`);
    if (DRY_RUN) continue;
    await prisma.playVCoinScale.create({
      data: {
        accountType,
        minLots: Number(s.min_lots),
        maxLots: s.max_lots != null ? Number(s.max_lots) : undefined,
        ratePerLot: Number(s.rate_per_lot),
        sortOrder: s.sort_order,
      },
    });
  }

  // ---------- Metas de progreso por tramo ----------
  const { rows: oldGoals } = await oldPool.query("SELECT * FROM tier_goals");
  for (const g of oldGoals) {
    const tier = TIER[g.tier];
    if (!tier) continue;
    const existing = await prisma.playTierGoal.findUnique({ where: { tier } });
    if (existing) {
      bump("metas_tramo.ya_existia");
      continue;
    }
    bump("metas_tramo.añadida");
    console.log(`  + meta ${tier}: ${g.lots_target} lotes en ${g.days_limit} días`);
    if (DRY_RUN) continue;
    await prisma.playTierGoal.create({ data: { tier, lotsTarget: Number(g.lots_target), daysLimit: g.days_limit } });
  }

  // ---------- Ligas ----------
  const { rows: oldLeagues } = await oldPool.query("SELECT * FROM leagues ORDER BY sort_order");
  for (const l of oldLeagues) {
    const existing = await prisma.playLeague.findUnique({ where: { name: l.name } });
    if (existing) {
      bump("ligas.ya_existia");
      continue;
    }
    bump("ligas.añadida");
    console.log(`  + liga "${l.name}" (${l.min_balance} - ${l.max_balance ?? "sin límite"})`);
    if (DRY_RUN) continue;
    await prisma.playLeague.create({
      data: {
        name: l.name,
        minBalance: Number(l.min_balance),
        maxBalance: l.max_balance != null ? Number(l.max_balance) : undefined,
        prizeChestTier: l.prize_chest_tier ? TIER[l.prize_chest_tier] : undefined,
        sortOrder: l.sort_order,
      },
    });
  }

  // ---------- Torneos ----------
  // No tienen una clave natural única en ningún sistema — se evita duplicar
  // en un reintento comparando nombre + fecha de inicio + fecha de fin.
  const { rows: oldTournaments } = await oldPool.query("SELECT * FROM tournaments");
  for (const t of oldTournaments) {
    const criterion = RANKING_CRITERION[t.criterion];
    if (!criterion) continue;
    const existing = await prisma.playTournament.findFirst({
      where: { name: t.name, startsAt: t.starts_at, endsAt: t.ends_at },
    });
    if (existing) {
      bump("torneos.ya_existia");
      continue;
    }
    bump("torneos.añadido");
    console.log(`  + torneo "${t.name}" (${t.starts_at.toISOString?.() ?? t.starts_at} → ${t.ends_at.toISOString?.() ?? t.ends_at})`);
    if (DRY_RUN) continue;
    await prisma.playTournament.create({
      data: {
        name: t.name,
        criterion,
        tierFilter: t.tier_filter ? TIER[t.tier_filter] : undefined,
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        prize: t.prize,
        createdAt: t.created_at,
      },
    });
  }

  console.log("\n--- Resumen ---");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`${k}: ${v}`);
  if (Object.keys(counts).length === 0) {
    console.log("(las tablas de configuración del sistema viejo estaban vacías, no había nada que traer)");
  }
  console.log(DRY_RUN ? "\n(Modo prueba: no se escribió nada.)" : "\n✅ Listo.");
}

main()
  .catch((err) => {
    console.error("\n❌ Falló:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await oldPool.end();
  });
