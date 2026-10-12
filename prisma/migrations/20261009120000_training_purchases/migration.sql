-- Formación de pago: precio por formación y compras (Stripe o acceso manual)
ALTER TABLE "TrainingCourse" ADD COLUMN "priceCents" INTEGER;

CREATE TABLE "TrainingPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'STRIPE',
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrainingPurchase_stripeSessionId_key" ON "TrainingPurchase"("stripeSessionId");
CREATE UNIQUE INDEX "TrainingPurchase_userId_courseId_key" ON "TrainingPurchase"("userId", "courseId");
CREATE INDEX "TrainingPurchase_courseId_createdAt_idx" ON "TrainingPurchase"("courseId", "createdAt");
ALTER TABLE "TrainingPurchase" ADD CONSTRAINT "TrainingPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPurchase" ADD CONSTRAINT "TrainingPurchase_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
