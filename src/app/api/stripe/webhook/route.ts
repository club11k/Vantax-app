import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { fulfillTrainingSession } from "@/lib/training-checkout";

// Webhook de Stripe. En Stripe → Developers → Webhooks se crea un endpoint a
// https://<tu-web>/api/stripe/webhook con los eventos
// checkout.session.completed y checkout.session.async_payment_succeeded, y su
// "Signing secret" (whsec_…) se pone en Render como STRIPE_WEBHOOK_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET no está definida.");
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 500 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Falta la firma." }, { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err: any) {
    console.error("Firma de webhook de Stripe no válida:", err?.message);
    return NextResponse.json({ error: "Firma no válida." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfillTrainingSession(event.data.object as Stripe.Checkout.Session);
    }
  } catch (err) {
    console.error("Error procesando el webhook de Stripe:", err);
    // 500 → Stripe lo reintenta más tarde.
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
