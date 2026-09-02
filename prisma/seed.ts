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
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as any },
    });
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
