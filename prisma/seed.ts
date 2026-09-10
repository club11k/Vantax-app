// Seed inicial: crea los planes por defecto, la configuración global por defecto,
// y (si se definieron SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) el primer usuario admin.
//
// Ejecutar con: npm run db:seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // --- Planes por defecto (editables después desde /admin/plans) ---
  const plans = [
    {
      name: "Básico",
      description: "Análisis diarios esenciales de XAU/USD y DXY.",
      priceCents: 2900,
      monthlyQuota: 30,
      sortOrder: 1,
    },
    {
      name: "Pro",
      description: "Más análisis por mes y prioridad en las corridas diarias.",
      priceCents: 4900,
      monthlyQuota: 45,
      sortOrder: 2,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
  }

  // --- Configuración global por defecto ---
  const defaultSettings: Record<string, unknown> = {
    "analysis.system_prompt": {
      value:
        "Eres el motor de análisis de VANTAX para XAU/USD y DXY. Usas únicamente los datos provistos en el snapshot para razonar. Nunca das recomendaciones de compra/venta directas ni te presentas como asesor financiero licenciado; el usuario es responsable de sus propias decisiones. Sé preciso con las cifras y cita la fecha del dato cuando sea relevante.",
    },
    "analysis.refresh_cron": {
      value: "0 7 * * 1-5",
      note: "Horario (UTC) en que se refresca el snapshot de datos de mercado usado para los análisis.",
    },
    "branding.support_email": {
      value: "vantaxproject@gmail.com",
    },
    "vcoin.rate_per_dollar_commission": {
      value: "1000",
      note: "V-COIN otorgados por cada $1 de comisión nueva que genera una cuenta de Vantage (IB), en cada sincronización manual desde /admin/settings.",
    },
    // --- Vantax Play (cashback por lotaje vía Myfxbook, brokers != Vantage) ---
    "play.vcoin_rate_per_lot": { value: "10", note: "V-COIN por lote XAUUSD en cuenta normal (Vantax Play)." },
    "play.cent_factor": { value: "0.01", note: "1 lote en cuenta Cent equivale a esta fracción de lote normal (Vantax Play)." },
    "play.tier_basico_min": { value: "0" },
    "play.tier_intermedio_min": { value: "200" },
    "play.tier_epico_min": { value: "1000" },
    "play.tier_legendario_min": { value: "5000" },
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as any },
    });
  }

  // --- Vantax Play: escala de V-COIN por rango de lotes (todavía no
  // conectada al cálculo automático, ver src/lib/play/vcoin-engine.ts) ---
  const vcoinScaleDefaults: { accountType: "NORMAL" | "CENT"; minLots: number; maxLots: number | null; ratePerLot: number; sortOrder: number }[] = [
    { accountType: "NORMAL", minLots: 0, maxLots: 5, ratePerLot: 5, sortOrder: 1 },
    { accountType: "NORMAL", minLots: 5, maxLots: null, ratePerLot: 10, sortOrder: 2 },
    { accountType: "CENT", minLots: 0, maxLots: 500, ratePerLot: 0.05, sortOrder: 1 },
    { accountType: "CENT", minLots: 500, maxLots: null, ratePerLot: 0.1, sortOrder: 2 },
  ];
  for (const row of vcoinScaleDefaults) {
    await prisma.playVCoinScale.upsert({
      where: { accountType_minLots: { accountType: row.accountType, minLots: row.minLots } },
      update: {},
      create: row,
    });
  }

  // --- Vantax Play: metas de progreso por tramo ---
  const tierGoalDefaults: { tier: "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO"; lotsTarget: number; daysLimit: number }[] = [
    { tier: "BASICO", lotsTarget: 5, daysLimit: 30 },
    { tier: "INTERMEDIO", lotsTarget: 15, daysLimit: 30 },
    { tier: "EPICO", lotsTarget: 40, daysLimit: 30 },
    { tier: "LEGENDARIO", lotsTarget: 100, daysLimit: 30 },
  ];
  for (const row of tierGoalDefaults) {
    await prisma.playTierGoal.upsert({ where: { tier: row.tier }, update: {}, create: row });
  }

  // --- Vantax Play: un cofre de configuración por tramo ---
  const chestDefaults: { tier: "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO"; label: string; unlockCondition: string; vcoinReward: number }[] = [
    { tier: "BASICO", label: "Cofre Básico", unlockCondition: "Completar el progreso del tramo Básico", vcoinReward: 100 },
    { tier: "INTERMEDIO", label: "Cofre Intermedio", unlockCondition: "Completar el progreso del tramo Intermedio", vcoinReward: 250 },
    { tier: "EPICO", label: "Cofre Épico", unlockCondition: "Completar el progreso del tramo Épico", vcoinReward: 500 },
    { tier: "LEGENDARIO", label: "Cofre Legendario", unlockCondition: "Completar el progreso del tramo Legendario", vcoinReward: 1000 },
  ];
  for (const row of chestDefaults) {
    await prisma.playChest.upsert({ where: { tier: row.tier }, update: {}, create: row });
  }

  // --- Vantax Play: ligas del ranking por saldo de cuenta ---
  const leagueDefaults: { name: string; minBalance: number; maxBalance: number | null; prizeChestTier: "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO"; sortOrder: number }[] = [
    { name: "Liga Bronce", minBalance: 0, maxBalance: 500, prizeChestTier: "BASICO", sortOrder: 1 },
    { name: "Liga Plata", minBalance: 500, maxBalance: 1000, prizeChestTier: "INTERMEDIO", sortOrder: 2 },
    { name: "Liga Oro", minBalance: 1000, maxBalance: 5000, prizeChestTier: "EPICO", sortOrder: 3 },
    { name: "Liga Diamante", minBalance: 5000, maxBalance: null, prizeChestTier: "LEGENDARIO", sortOrder: 4 },
  ];
  for (const row of leagueDefaults) {
    await prisma.playLeague.upsert({ where: { name: row.name }, update: {}, create: row });
  }

  // --- Primer usuario admin (opcional, solo si se definieron las env vars) ---
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN" },
      create: {
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
        name: "Administrador",
      },
    });
    console.log(`Usuario admin listo: ${adminEmail}`);
  } else {
    console.log(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no definidos: no se creó ningún admin. Puedes ascender un usuario a ADMIN manualmente desde la base de datos."
    );
  }

  console.log("Seed completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
