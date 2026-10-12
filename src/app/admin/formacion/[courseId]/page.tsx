import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TrainingCourseEditor } from "@/components/admin/training/TrainingCourseEditor";
import { formatPrice } from "@/lib/training";

export const dynamic = "force-dynamic";

export default async function AdminFormacionCoursePage({ params }: { params: { courseId: string } }) {
  const course = await prisma.trainingCourse.findUnique({
    where: { id: params.courseId },
    include: {
      sections: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          lessons: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: { pdfFile: { select: { id: true, filename: true } } },
          },
        },
      },
      purchases: { orderBy: { createdAt: "desc" }, include: { user: { select: { email: true, name: true } } } },
    },
  });
  if (!course) notFound();

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Formación · {course.title}</h2>
      <TrainingCourseEditor
        course={{
          id: course.id,
          title: course.title,
          description: course.description,
          coverUrl: course.coverUrl,
          published: course.published,
          priceCents: course.priceCents,
        }}
        buyers={course.purchases.map((p) => ({
          id: p.id,
          email: p.user.email,
          name: p.user.name,
          source: p.source,
          amount: p.source === "STRIPE" ? formatPrice(p.amountCents, p.currency) : null,
          date: p.createdAt.toISOString(),
        }))}
        sections={course.sections.map((sec) => ({
          id: sec.id,
          title: sec.title,
          description: sec.description ?? "",
          lessons: sec.lessons.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description ?? "",
            videoUrl: m.videoUrl ?? "",
            pdfUrl: m.pdfUrl ?? "",
            pdfFileId: m.pdfFileId,
            bunnyVideoId: m.bunnyVideoId,
            pdfFileName: m.pdfFile?.filename ?? null,
          })),
        }))}
      />
    </div>
  );
}
