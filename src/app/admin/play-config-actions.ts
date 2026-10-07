"use server";

// Acciones de administrador para la configuración de Vantax Play (todo lo
// que en el mockup original ("vcoin.html") vivía en la sección ADMIN del
// panel arcade: tasa de V-COIN, umbrales de tramo, cofres y sus premios,
// catálogo de artículos, y pagos pendientes en cripto). Sigue el mismo
// patrón que src/app/admin/actions.ts (requireAdmin + logAction +
// revalidatePath) — se separa en su propio archivo para no dejar ese
// archivo enorme.

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    throw new Error("No autorizado.");
  }
  return session.user as any as { id: string; email: string };
}

async function logAction(adminId: string, action: string, detail?: unknown) {
  await prisma.adminAuditLog.create({ data: { adminId, action, detail: detail as any } });
}

const PATH = "/admin/play-config";

// --- Tasa de V-COIN por lote ---
//
// El cálculo real (src/lib/play/vcoin-engine.ts) usa una tasa FIJA por lote,
// no una escala por tramos de lotaje como tenía el mockup original (la
// tabla PlayVCoinScale existe en el esquema pero no está conectada, ni lo
// estaba en el proyecto original) — así que esto edita las claves de
// Setting que sí usa el cálculo de verdad, para no mostrar un panel que no
// tenga ningún efecto.
export async function updateVCoinRate(vcoinRatePerLot: number, centFactor: number) {
  const admin = await requireAdmin();
  await prisma.setting.upsert({
    where: { key: "play.vcoin_rate_per_lot" },
    update: { value: { value: String(vcoinRatePerLot) } },
    create: { key: "play.vcoin_rate_per_lot", value: { value: String(vcoinRatePerLot) } },
  });
  await prisma.setting.upsert({
    where: { key: "play.cent_factor" },
    update: { value: { value: String(centFactor) } },
    create: { key: "play.cent_factor", value: { value: String(centFactor) } },
  });
  await logAction(admin.id, "update_play_vcoin_rate", { vcoinRatePerLot, centFactor });
  revalidatePath(PATH);
}

// --- Umbrales de tramo (lotes objetivo + días de ciclo por tramo) ---

export async function updateTierGoal(tier: "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO", lotsTarget: number, daysLimit: number) {
  const admin = await requireAdmin();
  await prisma.playTierGoal.upsert({
    where: { tier },
    update: { lotsTarget, daysLimit },
    create: { tier, lotsTarget, daysLimit },
  });
  await logAction(admin.id, "update_play_tier_goal", { tier, lotsTarget, daysLimit });
  revalidatePath(PATH);
}

// --- Cofres (uno por tramo) ---

export async function updateChest(params: {
  tier: "BASICO" | "INTERMEDIO" | "EPICO" | "LEGENDARIO";
  label: string;
  unlockCondition: string;
  vcoinReward: number;
  extraReward: string;
  active: boolean;
}) {
  const admin = await requireAdmin();
  const { tier, label, unlockCondition, vcoinReward, extraReward, active } = params;
  await prisma.playChest.upsert({
    where: { tier },
    update: { label, unlockCondition, vcoinReward, extraReward: extraReward || null, active },
    create: { tier, label, unlockCondition, vcoinReward, extraReward: extraReward || null, active },
  });
  await logAction(admin.id, "update_play_chest", params);
  revalidatePath(PATH);
}

// --- Probabilidad de artículo como premio de un cofre concreto ---

export async function upsertChestLoot(chestId: string, articleId: string, probability: number) {
  const admin = await requireAdmin();
  const existing = await prisma.playChestLoot.findFirst({ where: { chestId, articleId } });
  if (existing) {
    await prisma.playChestLoot.update({ where: { id: existing.id }, data: { probability } });
  } else {
    await prisma.playChestLoot.create({ data: { chestId, articleId, probability } });
  }
  await logAction(admin.id, "upsert_play_chest_loot", { chestId, articleId, probability });
  revalidatePath(PATH);
}

export async function deleteChestLoot(id: string) {
  const admin = await requireAdmin();
  await prisma.playChestLoot.delete({ where: { id } });
  await logAction(admin.id, "delete_play_chest_loot", { id });
  revalidatePath(PATH);
}

// --- Catálogo de artículos ---

export async function createArticle(data: {
  name: string;
  category: "MERCH" | "MENTORIA" | "CASHBACK";
  price: number;
  imageUrl: string;
}) {
  const admin = await requireAdmin();
  const article = await prisma.playCatalogArticle.create({
    data: { name: data.name, category: data.category, price: data.price, imageUrl: data.imageUrl || null },
  });
  await logAction(admin.id, "create_play_article", { articleId: article.id });
  revalidatePath(PATH);
}

// Editar un artículo ya creado (07/10/2026): nombre, categoría, precio e
// imagen. La imagen puede ser una URL o una foto subida desde el ordenador
// (llega ya reducida desde el navegador como data URL JPEG).
export async function updateArticle(
  articleId: string,
  data: { name: string; category: "MERCH" | "MENTORIA" | "CASHBACK"; price: number; imageUrl: string }
) {
  const admin = await requireAdmin();
  const name = data.name.trim();
  if (!name || !(data.price >= 0)) throw new Error("Nombre y precio son obligatorios.");
  if (data.imageUrl.length > 900_000) throw new Error("La imagen es demasiado grande.");
  await prisma.playCatalogArticle.update({
    where: { id: articleId },
    data: { name, category: data.category, price: data.price, imageUrl: data.imageUrl.trim() || null },
  });
  await logAction(admin.id, "update_play_article", { articleId });
  revalidatePath(PATH);
}

export async function toggleArticleActive(articleId: string, active: boolean) {
  const admin = await requireAdmin();
  await prisma.playCatalogArticle.update({ where: { id: articleId }, data: { active } });
  await logAction(admin.id, "toggle_play_article_active", { articleId, active });
  revalidatePath(PATH);
}

// --- Pagos pendientes (USDT TRC20/BEP20) ---

export async function markPayoutPaid(payoutId: string, txHash: string) {
  const admin = await requireAdmin();
  await prisma.playPayout.update({
    where: { id: payoutId },
    data: { status: "PAGADO", txHash: txHash || null, paidAt: new Date() },
  });
  await logAction(admin.id, "mark_play_payout_paid", { payoutId, txHash });
  revalidatePath(PATH);
}

// --- Pedidos de la Tienda (merch / mentoría) ---
export async function markShopOrderDelivered(orderId: string) {
  const admin = await requireAdmin();
  await prisma.playShopOrder.update({
    where: { id: orderId },
    data: { status: "ENTREGADO", deliveredAt: new Date() },
  });
  await logAction(admin.id, "mark_play_shop_order_delivered", { orderId });
  revalidatePath(PATH);
}
