-- CHARTS: diseño guardado del gráfico de cada usuario
CREATE TABLE "ChartLayout" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChartLayout_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "ChartLayout" ADD CONSTRAINT "ChartLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
