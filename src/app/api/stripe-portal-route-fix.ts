import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// El Customer Portal de Stripe permite al usuario cambiar de plan, actualizar
// su tarjeta o cancelar la suscripción sin que tengamos que construir nada
// de eso nosotros mismos.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "Todavía no tienes una suscripción." }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
