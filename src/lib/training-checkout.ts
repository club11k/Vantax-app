import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

// Da acceso a una formación a partir de una sesión de Stripe Checkout pagada.
// Lo usan el webhook de Stripe y la página de vuelta tras pagar (lo que
// llegue antes); es idempotente, así que no pasa nada si se ejecuta dos veces.
export async function fulfillTrainingSession(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.kind !== "training") return false;
  if (session.payment_status !== "paid") return false;
  const userId = session.metadata.userId;
  const courseId = session.metadata.courseId;
  if (!userId || !courseId) return false;

  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, stripeCustomerId: true } }),
    prisma.trainingCourse.findUnique({ where: { id: courseId }, select: { id: true } }),
  ]);
  if (!user || !course) return false;

  await prisma.trainingPurchase.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: {
      userId,
      courseId,
      source: "STRIPE",
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? "eur",
      stripeSessionId: session.id,
    },
    // Si ya tenía acceso manual y luego paga, se guarda el pago.
    update: { source: "STRIPE", amountCents: session.amount_total ?? 0, currency: session.currency ?? "eur", stripeSessionId: session.id },
  });

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId && !user.stripeCustomerId) {
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } }).catch(() => {
      /* el customer ya está asociado a otro usuario: no es crítico */
    });
  }
  return true;
}
