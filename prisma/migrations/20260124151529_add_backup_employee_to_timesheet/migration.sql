-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "backupEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX "Timesheet_backupEmployeeId_month_year_idx" ON "Timesheet"("backupEmployeeId", "month", "year");
