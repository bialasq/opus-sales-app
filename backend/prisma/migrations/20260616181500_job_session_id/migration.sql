-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT '';

-- Usuń domyślną wartość po dodaniu kolumny (tylko dla pustej / testowej bazy).
ALTER TABLE "analysis_jobs" ALTER COLUMN "sessionId" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_sessionId_key" ON "analysis_jobs"("sessionId");
