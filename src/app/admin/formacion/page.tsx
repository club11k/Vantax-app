import { prisma } from "@/lib/prisma";
import { TrainingAdminList } from "@/components/admin/training/TrainingAdminList";

// Formación (09/10/2026): crear formaciones, publicarlas y ordenarlas. Los
// módulos se editan dentro de cada formación.
export const dynamic = "force-dynamic";

export default async function AdminFormacionPage() {
  const [courses, usersWithAccess] = await Promise.all([
    prisma.trainingCourse.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, coverUrl: true, published: true, _count: { select: { modules: true } } },
    }),
    prisma.user.count({ where: { trainingAccess: true } }),
  ]);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Formación</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        Formaciones por módulos (vídeo y/o PDF). Los usuarios nuevos la tienen bloqueada: se abre a cada uno desde{" "}
        <a href="/admin/users">Usuarios</a> con el botón «Formación». Ahora mismo tienen acceso {usersWithAccess}{" "}
        {usersWithAccess === 1 ? "usuario" : "usuarios"}.
      </p>
      <TrainingAdminList
        courses={courses.map((c) => ({ id: c.id, title: c.title, coverUrl: c.coverUrl, published: c.published, modules: c._count.modules }))}
      />
    </div>
  );
}
