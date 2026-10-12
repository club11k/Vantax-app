-- Formación → Módulos → Capítulos. Cada "módulo" antiguo pasa a ser un
-- módulo nuevo con un único capítulo dentro (mismo vídeo, PDF y progreso).
CREATE TABLE "TrainingSection" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingSection_courseId_sortOrder_idx" ON "TrainingSection"("courseId", "sortOrder");
ALTER TABLE "TrainingSection" ADD CONSTRAINT "TrainingSection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingModule" ADD COLUMN "sectionId" TEXT;

INSERT INTO "TrainingSection" ("id", "courseId", "title", "sortOrder", "createdAt")
SELECT 'sec_' || "id", "courseId", "title", "sortOrder", "createdAt" FROM "TrainingModule";

UPDATE "TrainingModule" SET "sectionId" = 'sec_' || "id", "sortOrder" = 1;

ALTER TABLE "TrainingModule" ALTER COLUMN "sectionId" SET NOT NULL;
CREATE INDEX "TrainingModule_sectionId_sortOrder_idx" ON "TrainingModule"("sectionId", "sortOrder");
ALTER TABLE "TrainingModule" ADD CONSTRAINT "TrainingModule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TrainingSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
