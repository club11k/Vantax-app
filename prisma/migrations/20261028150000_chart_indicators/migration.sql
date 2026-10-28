-- CHARTS: indicadores Pine creados por el admin
CREATE TYPE "ChartIndicatorVisibility" AS ENUM ('ALL', 'ADMIN', 'SELECTED');

CREATE TABLE "ChartIndicator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "visibility" "ChartIndicatorVisibility" NOT NULL DEFAULT 'ADMIN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChartIndicator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChartIndicatorAccess" (
    "indicatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChartIndicatorAccess_pkey" PRIMARY KEY ("indicatorId", "userId")
);
CREATE INDEX "ChartIndicatorAccess_userId_idx" ON "ChartIndicatorAccess"("userId");

ALTER TABLE "ChartIndicatorAccess" ADD CONSTRAINT "ChartIndicatorAccess_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "ChartIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChartIndicatorAccess" ADD CONSTRAINT "ChartIndicatorAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
