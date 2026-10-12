import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { canAccessCourse, getTrainingViewer } from "@/lib/training";

// Inicia el pago único de una formación con Stripe Checkout. El acceso se da
// al confirmarse el pago (webhook o vuelta a la página de la formación).
export async function POST(req: Request) {
  const viewer = await getTrainingViewer();
  if (!viewer) return NextResponse.json({ error: "Inicia sesión para comprar." }, { status: 401 });
  if (viewer.suspended) return NextResponse.json({ error: "Tu cuenta está suspendida." }, { status: 403 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Los pagos todavía no están configurados. Avisa al equipo." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as any;
  const courseId = typeof body?.courseId === "string" ? body.courseId : "";
  const course = courseId
    ? await prisma.trainingCourse.findUnique({ where: { id: courseId }, select: { id: true, title: true, description: true, priceCents: true, published: true } })
    : null;
  if (!course || !course.published) return NextResponse.json({ error: "Esta formación no está disponible." }, { status: 404 });
  if (!course.priceCents || course.priceCents < 50) {
    return NextResponse.json({ error: "Esta formación no está a la venta." }, { status: 400 });
  }
  if (await canAccessCourse(viewer, course)) {
    return NextResponse.json({ error: "Ya tienes acceso a esta formación." }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { email: true, stripeCustomerId: true } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || req.headers.get("origin") || new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: course.priceCents,
            product_data: {
              name: `Formación · ${course.title}`.slice(0, 250),
              ...(course.description ? { description: course.description.slice(0, 500) } : {}),
            },
          },
        },
      ],
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email, customer_creation: "always" as const }),
      invoice_creation: { enabled: true },
      client_reference_id: viewer.userId,
      metadata: { kind: "training", userId: viewer.userId, courseId: course.id },
      payment_intent_data: { metadata: { kind: "training", userId: viewer.userId, courseId: course.id } },
      success_url: `${origin}/formacion/${course.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/formacion/${course.id}?cancelado=1`,
      locale: "es",
    });
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creando el pago de Formación:", err?.message ?? err);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Prueba de nuevo en un momento." }, { status: 500 });
  }
}
