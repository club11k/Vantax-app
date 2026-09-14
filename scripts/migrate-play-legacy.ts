// Migra los datos REALES de jugadores del Vantax Play viejo
// (club11k/vantax-play-backend, base de datos propia en Render) a la base
// de datos unificada de este repo (Vantax-app). Solo migra datos de
// usuarios (cuentas, historial, V-COIN, cofres, rankings, progreso, pagos)
// — no toca configuración (escala de V-COIN, metas de tramo, ligas,
// torneos), que ya vive seedeada en este sistema nuevo.
//
// ============================================================
// CÓMO EJECUTARLO
// ============================================================
// 1. En el dashboard de Render del servicio VIEJO (vantax-play-backend) →
//    pestaña "Environment" → copia el valor de DATABASE_URL (la de SU
//    PROPIA base de datos, "vantax-play-db") y el de ENCRYPTION_KEY.
// 2. Abre la Shell del servicio NUEVO (Vantax-app) en Render.
// 3. Primero, modo de PRUEBA (no escribe nada, solo cuenta y avisa):
//
//      OLD_DATABASE_URL="postgres://...la_url_vieja..." \
//      OLD_ENCRYPTION_KEY="...la_clave_vieja..." \
//      npx tsx scripts/migrate-play-legacy.ts
//
//    Revisa el resumen que imprime al final antes de seguir.
//
// 4. Si el resumen tiene buena pinta, corre la migración DE VERDAD
//    añadiendo DRY_RUN=false:
//
//      OLD_DATABASE_URL="postgres://...la_url_vieja..." \
//      OLD_ENCRYPTION_KEY="...la_clave_vieja..." \
//      DRY_RUN=false \
//      npx tsx scripts/migrate-play-legacy.ts
//
// No hace falta pasar DATABASE_URL ni ENCRYPTION_KEY "nuevos" — el script
// usa automáticamente los de ESTE servicio (ya configurados en Render).
//
// SI NO TIENES OLD_ENCRYPTION_KEY: el script migra igualmente todo lo
// demás (usuarios, cuentas, historial, V-COIN, cofres, rankings, pagos…)
// pero deja en blanco la contraseña investor de MT5 y la de Myfxbook de
// cada cuenta — esos jugadores tendrían que volver a vincular su cuenta
// una vez; el resto de su progreso e historial se conserva igual.
//
// SEGURIDAD ANTE REINTENTOS: el script hace upsert por email/número de
// cuenta/etc. donde hay una clave natural, así que reintentar tras un
// fallo a medias no debería duplicar nada importante. Pero una vez termina
// CON ÉXITO en modo real (DRY_RUN=false), se guarda una marca
// (Setting "play.legacy_migration") y se niega a correr una segunda vez
// en modo real, para no duplicar movimientos de V-COIN por error. Si de
// verdad hace falta volver a correrlo, borra esa fila de Setting a mano.

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import crypto from "node:crypto";

const DRY_RUN = process.env.DRY_RUN !== "false";
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;
const OLD_ENCRYPTION_KEY = process.env.OLD_ENCRYPTION_KEY;
const MIGRATION_MARK_KEY = "play.legacy_migration";

if (!OLD_DATABASE_URL) {
  console.error("Falta OLD_DATABASE_URL (la DATABASE_URL del servicio vantax-play-backend en Render).");
  process.exit(1);
}
if (!OLD_ENCRYPTION_KEY) {
  console.warn(
    "⚠️  No se dio OLD_ENCRYPTION_KEY — se migrará todo salvo la contraseña investor de MT5 y la de Myfxbook " +
      "de cada cuenta (esos jugadores tendrán que volver a vincular su cuenta una vez)."
  );
}

const prisma = new PrismaClient();
const oldPool = new Pool({ connectionString: OLD_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- Cifrado: mismo esquema AES-256-GCM que src/lib/play/crypto.ts y que
// el crypto.js del backend viejo — "<iv_b64>:<authTag_b64>:<cipher_b64>".
function decryptWithKey(payload: string, base64Key: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Formato de dato cifrado inválido");
  const key = Buffer.from(base64Key, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
function encryptWithNewKey(plainText: string): string {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("Falta ENCRYPTION_KEY (la de ESTE servicio) en las variables de entorno.");
  const key = Buffer.from(raw, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}
// Descifra con la clave vieja y vuelve a cifrar con la clave nueva. Si no
// hay clave vieja, o el descifrado falla (clave equivocada, dato corrupto),
// devuelve null en vez de romper toda la migración por una sola cuenta.
function reencrypt(oldPayload: string | null, warnLabel: string, warnings: string[]): string | null {
  if (!oldPayload) return null;
  if (!OLD_ENCRYPTION_KEY) return null;
  try {
    const plain = decryptWithKey(oldPayload, OLD_ENCRYPTION_KEY);
    return encryptWithNewKey(plain);
  } catch (err) {
    warnings.push(`No se pudo descifrar/recifrar ${warnLabel}: ${(err as Error).message}`);
    return null;
  }
}

// Mapeos de tipo/enum del esquema viejo (texto libre en minúsculas) al
// esquema nuevo (enums en mayúsculas).
const ACCOUNT_TYPE: Record<string, "NORMAL" | "CENT"> = { normal: "NORMAL", cent: "CENT" };
const TIER: Record<string, "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO"> = {
  basico: "BASICO",
  intermedio: "INTERMEDIO",
  epico: "EPICO",
  legendario: "LEGENDARIO",
};
const VCOIN_TX_TYPE: Record<string, "LOTE" | "RANKING_BONUS" | "COFRE" | "TORNEO" | "AJUSTE_ADMIN"> = {
  lote: "LOTE",
  ranking_bonus: "RANKING_BONUS",
  cofre: "COFRE",
  torneo: "TORNEO",
  ajuste_admin: "AJUSTE_ADMIN",
};
const RANKING_CRITERION: Record<string, "PROFIT_PCT" | "LOTS"> = { profit_pct: "PROFIT_PCT", lots: "LOTS" };
const PAYOUT_STATUS: Record<string, "PENDIENTE" | "PAGADO"> = { pendiente: "PENDIENTE", pagado: "PAGADO" };
const GIFT_REWARD_TYPE: Record<string, "VCOIN" | "ARTICLE"> = { vcoin: "VCOIN", article: "ARTICLE" };

type Counts = Record<string, number>;

async function main() {
  console.log(`\n=== Migración Vantax Play (legacy) — modo ${DRY_RUN ? "PRUEBA (no escribe nada)" : "REAL"} ===\n`);

  if (!DRY_RUN) {
    const mark = await prisma.setting.findUnique({ where: { key: MIGRATION_MARK_KEY } });
    if (mark) {
      console.error(
        "Esta migración ya se marcó como completada antes (Setting 'play.legacy_migration'). " +
          "Para evitar duplicar V-COIN y otros datos, no se vuelve a correr en modo real. " +
          "Si de verdad hace falta, borra esa fila de Setting a mano y vuelve a intentarlo."
      );
      process.exit(1);
    }
  }

  const warnings: string[] = [];
  const counts: Counts = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // ---------- 1. Brokers (solo para poder enlazar las cuentas MT5) ----------
  const { rows: oldBrokers } = await oldPool.query("SELECT * FROM brokers");
  const brokerIdMap = new Map<number, string>();
  for (const b of oldBrokers) {
    const existing = await prisma.playBroker.findUnique({ where: { name: b.name } });
    if (existing) {
      brokerIdMap.set(b.id, existing.id);
      bump("brokers.encontrados");
      continue;
    }
    bump("brokers.creados");
    if (DRY_RUN) {
      brokerIdMap.set(b.id, `dryrun-broker-${b.id}`);
      continue;
    }
    const created = await prisma.playBroker.create({
      data: { name: b.name, logoUrl: b.logo_url ?? undefined, active: b.active },
    });
    brokerIdMap.set(b.id, created.id);
  }

  // ---------- 2. Catálogo de artículos (por si algún cofre/regalo los referencia) ----------
  const { rows: oldArticles } = await oldPool.query("SELECT * FROM catalog_articles");
  const articleIdMap = new Map<number, string>();
  for (const a of oldArticles) {
    const existing = await prisma.playCatalogArticle.findFirst({ where: { name: a.name } });
    if (existing) {
      articleIdMap.set(a.id, existing.id);
      bump("articulos.encontrados");
      continue;
    }
    bump("articulos.creados");
    if (DRY_RUN) {
      articleIdMap.set(a.id, `dryrun-article-${a.id}`);
      continue;
    }
    const created = await prisma.playCatalogArticle.create({
      data: {
        name: a.name,
        category: (a.category as string).toUpperCase() as any,
        price: Number(a.price),
        imageUrl: a.image_url ?? undefined,
        active: a.active,
      },
    });
    articleIdMap.set(a.id, created.id);
  }

  // ---------- 3. Cofres (solo si faltara alguno por tramo; normalmente ya existen) ----------
  const { rows: oldChests } = await oldPool.query("SELECT * FROM chests");
  const chestIdMap = new Map<number, string>();
  for (const c of oldChests) {
    const tier = TIER[c.tier];
    if (!tier) {
      warnings.push(`Cofre viejo #${c.id} con tier desconocido "${c.tier}", se ignora.`);
      continue;
    }
    const existing = await prisma.playChest.findUnique({ where: { tier } });
    if (existing) {
      chestIdMap.set(c.id, existing.id);
      bump("cofres.encontrados");
      continue;
    }
    bump("cofres.creados");
    if (DRY_RUN) {
      chestIdMap.set(c.id, `dryrun-chest-${c.id}`);
      continue;
    }
    const created = await prisma.playChest.create({
      data: {
        tier,
        label: c.label,
        unlockCondition: c.unlock_condition,
        vcoinReward: Number(c.vcoin_reward),
        extraReward: c.extra_reward ?? undefined,
        active: c.active,
      },
    });
    chestIdMap.set(c.id, created.id);
  }

  // ---------- 4. Usuarios ----------
  const { rows: oldUsers } = await oldPool.query("SELECT * FROM users");
  const userIdMap = new Map<number, string>();
  for (const u of oldUsers) {
    const email = String(u.email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      userIdMap.set(u.id, existing.id);
      bump("usuarios.ya_existian");
      if (existing.publicId && u.public_id && existing.publicId !== u.public_id) {
        warnings.push(
          `${email} ya existía en el sistema nuevo con publicId "${existing.publicId}" (el viejo era "${u.public_id}") — se dejó el actual.`
        );
      }
      continue;
    }
    if (u.role === "admin") {
      warnings.push(
        `${email} era admin en el Vantax Play viejo — se crea como usuario normal (USER) por seguridad; ` +
          `dale rol de administrador a mano desde /admin/usuarios si de verdad debe tenerlo en el sistema nuevo.`
      );
    }
    bump("usuarios.creados");
    if (DRY_RUN) {
      userIdMap.set(u.id, `dryrun-user-${u.id}`);
      continue;
    }
    let publicId: string | undefined = u.public_id ?? undefined;
    try {
      const created = await prisma.user.create({
        data: {
          email,
          passwordHash: u.password_hash, // mismo esquema bcrypt en ambos sistemas, se copia tal cual
          name: u.display_name ?? undefined,
          role: "USER",
          publicId,
          payoutWallet: u.payout_wallet ?? undefined,
          payoutNetwork: u.payout_network ? (u.payout_network as any) : undefined,
          brokerName: u.broker_name ?? undefined,
          brokerEmail: u.broker_email ?? undefined,
          brokerUid: u.broker_uid ?? undefined,
        },
      });
      userIdMap.set(u.id, created.id);
    } catch (err: any) {
      // Choque más probable: publicId ya usado (índice case-insensitive).
      if (String(err?.code) === "P2002" && publicId) {
        const fallbackId = `${publicId}_${Math.random().toString(36).slice(2, 6)}`;
        warnings.push(`publicId "${publicId}" (${email}) ya estaba en uso — se le asignó "${fallbackId}", avísale.`);
        const created = await prisma.user.create({
          data: {
            email,
            passwordHash: u.password_hash,
            name: u.display_name ?? undefined,
            role: "USER",
            publicId: fallbackId,
            payoutWallet: u.payout_wallet ?? undefined,
            payoutNetwork: u.payout_network ? (u.payout_network as any) : undefined,
            brokerName: u.broker_name ?? undefined,
            brokerEmail: u.broker_email ?? undefined,
            brokerUid: u.broker_uid ?? undefined,
          },
        });
        userIdMap.set(u.id, created.id);
      } else {
        throw err;
      }
    }
  }

  // ---------- 5. Cuentas MT5 ----------
  const { rows: oldAccounts } = await oldPool.query("SELECT * FROM mt5_accounts");
  const accountIdMap = new Map<number, string>();
  for (const acc of oldAccounts) {
    const newUserId = userIdMap.get(acc.user_id);
    const newBrokerId = brokerIdMap.get(acc.broker_id);
    if (!newUserId || !newBrokerId) {
      warnings.push(`Cuenta MT5 vieja #${acc.id} (nº ${acc.account_number}) sin usuario o broker mapeado, se omite.`);
      continue;
    }
    const existing = await prisma.playMt5Account.findUnique({
      where: { brokerId_accountNumber: { brokerId: newBrokerId, accountNumber: acc.account_number } },
    });
    if (existing) {
      accountIdMap.set(acc.id, existing.id);
      bump("cuentas.ya_existian");
      continue;
    }
    bump("cuentas.creadas");
    if (DRY_RUN) {
      accountIdMap.set(acc.id, `dryrun-account-${acc.id}`);
      continue;
    }
    const investorPasswordEnc = reencrypt(acc.investor_password_enc, `investor password de cuenta ${acc.account_number}`, warnings);
    const created = await prisma.playMt5Account.create({
      data: {
        userId: newUserId,
        brokerId: newBrokerId,
        accountNumber: acc.account_number,
        accountType: ACCOUNT_TYPE[acc.account_type] ?? "NORMAL",
        accountTypeVerified: acc.account_type_verified,
        investorLogin: acc.investor_login ?? undefined,
        investorPasswordEnc: investorPasswordEnc ?? undefined,
        mt5Server: acc.mt5_server ?? undefined,
        ibActive: acc.ib_active,
        balance: Number(acc.balance),
        equity: Number(acc.equity),
      },
    });
    accountIdMap.set(acc.id, created.id);
  }

  // ---------- 6. Snapshots de saldo/equity ----------
  const { rows: oldSnapshots } = await oldPool.query("SELECT * FROM account_snapshots");
  for (const s of oldSnapshots) {
    const newAccountId = accountIdMap.get(s.account_id);
    if (!newAccountId) continue;
    bump("snapshots.migrados");
    if (DRY_RUN) continue;
    await prisma.playAccountSnapshot.create({
      data: { accountId: newAccountId, balance: Number(s.balance), equity: Number(s.equity), capturedAt: s.captured_at },
    });
  }

  // ---------- 7. Estadísticas de trading por periodo ----------
  const { rows: oldStats } = await oldPool.query("SELECT * FROM trading_stats");
  for (const st of oldStats) {
    const newAccountId = accountIdMap.get(st.account_id);
    if (!newAccountId) continue;
    const existing = await prisma.playTradingStats.findUnique({
      where: {
        accountId_periodStart_periodEnd: { accountId: newAccountId, periodStart: st.period_start, periodEnd: st.period_end },
      },
    });
    if (existing) {
      bump("estadisticas.ya_existian");
      continue;
    }
    bump("estadisticas.migradas");
    if (DRY_RUN) continue;
    await prisma.playTradingStats.create({
      data: {
        accountId: newAccountId,
        periodStart: st.period_start,
        periodEnd: st.period_end,
        lotsTraded: Number(st.lots_traded),
        profitPct: Number(st.profit_pct),
        profitAmount: Number(st.profit_amount),
      },
    });
  }

  // ---------- 8. Vinculación de Myfxbook ----------
  const { rows: oldMyfxLinks } = await oldPool.query("SELECT * FROM myfxbook_links");
  for (const link of oldMyfxLinks) {
    const newUserId = userIdMap.get(link.user_id);
    if (!newUserId) continue;
    const existing = await prisma.playMyfxbookLink.findUnique({ where: { userId: newUserId } });
    if (existing) {
      bump("myfxbook_links.ya_existian");
      continue;
    }
    bump("myfxbook_links.migrados");
    if (DRY_RUN) continue;
    const passwordEnc = reencrypt(link.password_enc, `contraseña Myfxbook de usuario ${link.user_id}`, warnings);
    if (!passwordEnc) {
      warnings.push(`Vínculo de Myfxbook del usuario viejo #${link.user_id} sin contraseña migrada — tendrá que volver a vincularlo.`);
    }
    await prisma.playMyfxbookLink.create({
      data: {
        userId: newUserId,
        email: link.email,
        passwordEnc: passwordEnc ?? "",
        myfxbookAccountId: link.myfxbook_account_id ?? undefined,
        lastSyncedAt: link.last_synced_at ?? undefined,
      },
    });
  }

  // ---------- 9. Movimientos de V-COIN (+ saldo acumulado del usuario) ----------
  const { rows: oldVcoinTx } = await oldPool.query("SELECT * FROM vcoin_transactions ORDER BY id ASC");
  const vcoinDeltaByUser = new Map<string, number>();
  for (const tx of oldVcoinTx) {
    const newUserId = userIdMap.get(tx.user_id);
    if (!newUserId) continue;
    const newAccountId = tx.account_id ? accountIdMap.get(tx.account_id) : null;
    bump("vcoin_transacciones.migradas");
    const amount = Number(tx.amount);
    vcoinDeltaByUser.set(newUserId, (vcoinDeltaByUser.get(newUserId) ?? 0) + amount);
    if (DRY_RUN) continue;
    await prisma.playVCoinTransaction.create({
      data: {
        userId: newUserId,
        accountId: newAccountId ?? undefined,
        type: VCOIN_TX_TYPE[tx.type] ?? "AJUSTE_ADMIN",
        amount,
        description: tx.description ?? undefined,
        createdAt: tx.created_at,
      },
    });
  }
  // El saldo del usuario (User.vCoinBalance) es compartido con el V-COIN
  // de Vantage (comisión de IB) — por eso se SUMA el delta migrado en vez
  // de sobrescribirlo, para no borrar V-COIN que ya se hubiera acreditado
  // en el sistema nuevo por otra vía.
  for (const [newUserId, delta] of vcoinDeltaByUser) {
    bump("vcoin.saldo_actualizado_para_N_usuarios");
    if (DRY_RUN) continue;
    await prisma.user.update({ where: { id: newUserId }, data: { vCoinBalance: { increment: Math.round(delta) } } });
  }

  // ---------- 10. Cofres obtenidos por usuario ----------
  const { rows: oldUserChests } = await oldPool.query("SELECT * FROM user_chests");
  for (const uc of oldUserChests) {
    const newUserId = userIdMap.get(uc.user_id);
    const newChestId = chestIdMap.get(uc.chest_id);
    if (!newUserId || !newChestId) continue;
    bump("cofres_de_usuario.migrados");
    if (DRY_RUN) continue;
    await prisma.playUserChest.create({
      data: { userId: newUserId, chestId: newChestId, unlockedAt: uc.unlocked_at, openedAt: uc.opened_at ?? undefined },
    });
  }

  // ---------- 11. Historial de rankings ----------
  const { rows: oldRankings } = await oldPool.query("SELECT * FROM rankings");
  for (const r of oldRankings) {
    const newUserId = userIdMap.get(r.user_id);
    const newAccountId = accountIdMap.get(r.account_id);
    const tier = TIER[r.tier];
    const criterion = RANKING_CRITERION[r.criterion];
    if (!newUserId || !newAccountId || !tier || !criterion) continue;
    bump("rankings.migrados");
    if (DRY_RUN) continue;
    await prisma.playRanking.create({
      data: {
        periodStart: r.period_start,
        periodEnd: r.period_end,
        tier,
        criterion,
        userId: newUserId,
        accountId: newAccountId,
        value: Number(r.value),
        position: r.position,
      },
    });
  }

  // ---------- 12. Pagos (payouts) ----------
  const { rows: oldPayouts } = await oldPool.query("SELECT * FROM payouts");
  for (const p of oldPayouts) {
    const newUserId = userIdMap.get(p.user_id);
    if (!newUserId) continue;
    bump("pagos.migrados");
    if (DRY_RUN) continue;
    await prisma.playPayout.create({
      data: {
        userId: newUserId,
        amountVCoin: Number(p.amount_vcoin),
        network: p.network as any,
        wallet: p.wallet,
        status: PAYOUT_STATUS[p.status] ?? "PENDIENTE",
        txHash: p.tx_hash ?? undefined,
        requestedAt: p.requested_at,
        paidAt: p.paid_at ?? undefined,
      },
    });
  }

  // ---------- 13. Progreso del jugador (barra de tramo) ----------
  const { rows: oldProgress } = await oldPool.query("SELECT * FROM player_progress");
  for (const pr of oldProgress) {
    const newUserId = userIdMap.get(pr.user_id);
    if (!newUserId) continue;
    bump("progreso.migrado");
    if (DRY_RUN) continue;
    await prisma.playPlayerProgress.upsert({
      where: { userId: newUserId },
      create: {
        userId: newUserId,
        tierIndex: pr.tier_index,
        cycleLots: Number(pr.cycle_lots),
        cycleDay: pr.cycle_day,
        cycleStartedAt: pr.cycle_started_at,
      },
      update: {}, // si ya existe progreso en el sistema nuevo, no lo pisamos
    });
  }

  // ---------- 14. Regalos de admin pendientes ----------
  const { rows: oldGifts } = await oldPool.query("SELECT * FROM player_gifts");
  for (const g of oldGifts) {
    const newUserId = userIdMap.get(g.user_id);
    const tier = TIER[g.tier];
    const rewardType = GIFT_REWARD_TYPE[g.reward_type];
    if (!newUserId || !tier || !rewardType) continue;
    const newArticleId = g.article_id ? articleIdMap.get(g.article_id) : null;
    bump("regalos.migrados");
    if (DRY_RUN) continue;
    await prisma.playPlayerGift.create({
      data: {
        userId: newUserId,
        tier,
        rewardType,
        amount: g.amount != null ? Number(g.amount) : undefined,
        articleId: newArticleId ?? undefined,
        delivered: g.delivered,
        createdAt: g.created_at,
      },
    });
  }

  // ---------- Resumen ----------
  console.log("\n--- Resumen ---");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`${k}: ${v}`);
  if (warnings.length > 0) {
    console.log(`\n--- Avisos (${warnings.length}) — revisar a mano ---`);
    for (const w of warnings) console.log(`⚠️  ${w}`);
  }

  if (!DRY_RUN) {
    await prisma.setting.create({
      data: { key: MIGRATION_MARK_KEY, value: { completedAt: new Date().toISOString(), counts, warnings } },
    });
    console.log("\n✅ Migración real completada y marcada (Setting 'play.legacy_migration').");
  } else {
    console.log("\n(Modo prueba: no se escribió nada. Vuelve a correr con DRY_RUN=false para aplicar de verdad.)");
  }
}

main()
  .catch((err) => {
    console.error("\n❌ La migración falló:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await oldPool.end();
  });
