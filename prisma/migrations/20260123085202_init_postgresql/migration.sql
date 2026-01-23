-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "employeeId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "entryDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "hourlyWage" DOUBLE PRECISION DEFAULT 0,
    "travelCostType" TEXT NOT NULL DEFAULT 'NONE',
    "nightPremiumEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nightPremiumPercent" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "sundayPremiumEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sundayPremiumPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "holidayPremiumEnabled" BOOLEAN NOT NULL DEFAULT true,
    "holidayPremiumPercent" DOUBLE PRECISION NOT NULL DEFAULT 125,
    "assignedSheetId" TEXT,
    "assignedPlanTab" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "plannedStart" TEXT,
    "plannedEnd" TEXT,
    "actualStart" TEXT,
    "actualEnd" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "absenceType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "employeeId" TEXT NOT NULL,
    "teamId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedBy" TEXT,
    "source" TEXT,
    "sheetFileName" TEXT,
    "sheetId" TEXT,
    "syncVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "message" TEXT,
    "rowsProcessed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE INDEX "Timesheet_source_syncVerified_idx" ON "Timesheet"("source", "syncVerified");

-- CreateIndex
CREATE INDEX "Timesheet_month_year_employeeId_idx" ON "Timesheet"("month", "year", "employeeId");

-- CreateIndex
CREATE INDEX "Timesheet_date_status_idx" ON "Timesheet"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_employeeId_date_key" ON "Timesheet"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
