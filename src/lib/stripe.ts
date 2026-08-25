import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  // No tiramos error en el import (rompería el build antes de tener las env vars
  // configuradas en Render); solo avisamos en consola. Las rutas que usan Stripe
  // fallan de forma controlada si falta la key.
  console.warn("STRIPE_SECRET_KEY no está definida — la pasarela de pago no va a funcionar hasta configurarla.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
});
