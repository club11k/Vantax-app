import { prisma } from "@/lib/prisma";
import { TrainingAdminList } from "@/components/admin/training/TrainingAdminList";
import { formatPrice } from "@/lib/training";

// Formación (09/10/2026): crear formaciones, publicarlas y ordenarlas. Los
// módulos se editan dentro de cada formación.
export const dynamic = "force-dynamic";

export default async function AdminFormacionPage() {
  const [courses, usersWithAccess] = await Promise.all([
    prisma.trainingCourse.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, coverUrl: true, published: true, priceCents: true, _count: { select: { modules: true, sections: true } } },
    }),
    prisma.user.count({ where: { trainingAccess: true } }),
  ]);
  const sales = await prisma.trainingPurchase.groupBy({ by: ["courseId"], where: { source: "STRIPE" }, _count: { _all: true } });
  const salesBy = new Map(sales.map((s) => [s.courseId, s._count._all]));

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Formación</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        Formaciones por módulos (vídeo y/o PDF), de pago único con Stripe. Para dar acceso gratis: a una formación
        concreta, desde dentro de cada formación; a todas, desde <a href="/admin/users">Usuarios</a> con el botón
        «Formación» (ahora lo tienen {usersWithAccess} {usersWithAccess === 1 ? "usuario" : "usuarios"}).
      </p>
      <TrainingAdminList
        courses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          coverUrl: c.coverUrl,
          published: c.published,
          modules: c._count.sections,
          lessons: c._count.modules,
          price: c.priceCents ? formatPrice(c.priceCents) : null,
          sales: salesBy.get(c.id) ?? 0,
        }))}
      />
    </div>
  );
}
