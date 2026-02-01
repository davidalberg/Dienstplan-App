import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aggregateMonthlyData } from "@/lib/premium-calculator"
import { format } from "date-fns"
import { de } from "date-fns/locale"

/**
 * Query parameter validation
 */
const QueryParamsSchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2030)
})

/**
 * GET /api/admin/payroll
 *
 * Returns payroll data for all employees for a given month/year.
 * Includes hours, premiums, sick/vacation periods, and backup days.
 */
export async function GET(req: NextRequest) {
    // Auth check: Require ADMIN role
    const session = await auth()
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url)
    const rawParams = {
        month: searchParams.get("month") || "",
        year: searchParams.get("year") || ""
    }

    const validationResult = QueryParamsSchema.safeParse(rawParams)
    if (!validationResult.success) {
        return NextResponse.json({
            error: "Ungueltige Parameter",
            details: validationResult.error.flatten()
        }, { status: 400 })
    }

    const { month, year } = validationResult.data

    try {
        // Fetch all employees with their team/client relationships
        const employees = await prisma.user.findMany({
            where: {
                role: "EMPLOYEE"
            },
            include: {
                team: {
                    include: {
                        client: true
                    }
                }
            },
            orderBy: {
                name: "asc"
            }
        })

        // Fetch all timesheets for this month
        const timesheets = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
            },
            orderBy: { date: "asc" }
        })

        // Process each employee's payroll data
        const payrollData = employees.map(employee => {
            // Get employee's timesheets
            const employeeTimesheets = timesheets.filter(ts => ts.employeeId === employee.id)

            // Nutze aggregateMonthlyData für konsistente Berechnung (inkl. Backup-Stunden)
            const aggregated = aggregateMonthlyData(
                employeeTimesheets,
                {
                    id: employee.id,
                    hourlyWage: employee.hourlyWage || 0,
                    nightPremiumEnabled: employee.nightPremiumEnabled,
                    nightPremiumPercent: employee.nightPremiumPercent,
                    sundayPremiumEnabled: employee.sundayPremiumEnabled,
                    sundayPremiumPercent: employee.sundayPremiumPercent,
                    holidayPremiumEnabled: employee.holidayPremiumEnabled,
                    holidayPremiumPercent: employee.holidayPremiumPercent
                },
                timesheets  // ALLE Timesheets für Backup-Suche
            )

            // Backup-Tage separat zählen (ALLE Einträge, nicht nur bei Abwesenheit)
            const backupDays = timesheets.filter(ts =>
                ts.backupEmployeeId === employee.id
            ).length

            // Krankheitszeiträume formatieren
            const sickDates = employeeTimesheets
                .filter(ts => ts.absenceType === "SICK")
                .map(ts => new Date(ts.date))
            const sickPeriods = formatDatePeriods(sickDates)

            // Get client name via team
            const clientName = employee.team?.client
                ? `${employee.team.client.firstName} ${employee.team.client.lastName}`
                : null

            // Map travelCostType
            const travelCostDisplay = mapTravelCostType(employee.travelCostType)

            return {
                id: employee.id,
                clientName,
                employeeName: employee.name || "Unbekannt",
                entryDate: employee.entryDate,
                exitDate: employee.exitDate,
                hourlyWage: employee.hourlyWage || 0,
                totalHours: aggregated.totalHours,      // INKL. Backup-Stunden!
                nightHours: aggregated.nightHours,      // INKL. Backup-Nachtstunden!
                sundayHours: aggregated.sundayHours,    // INKL. Backup-Sonntagsstunden!
                holidayHours: aggregated.holidayHours,  // INKL. Backup-Feiertagsstunden!
                backupDays,                             // Alle Bereitschaftstage
                backupHours: aggregated.backupHours,    // NEU: Eingesprungene Stunden
                sickPeriods,
                sickHours: aggregated.sickHours,
                vacationDays: aggregated.vacationDays,
                vacationHours: aggregated.vacationHours,
                travelCostType: travelCostDisplay
            }
        })

        // Filter out employees with no hours and no sick/vacation
        const activePayroll = payrollData.filter(p =>
            p.totalHours > 0 ||
            p.sickHours > 0 ||
            p.vacationHours > 0 ||
            p.backupDays > 0
        )

        // Calculate totals
        const totals = {
            totalHours: Math.round(activePayroll.reduce((sum, p) => sum + p.totalHours, 0) * 100) / 100,
            nightHours: Math.round(activePayroll.reduce((sum, p) => sum + p.nightHours, 0) * 100) / 100,
            sundayHours: Math.round(activePayroll.reduce((sum, p) => sum + p.sundayHours, 0) * 100) / 100,
            holidayHours: Math.round(activePayroll.reduce((sum, p) => sum + p.holidayHours, 0) * 100) / 100,
            sickHours: Math.round(activePayroll.reduce((sum, p) => sum + p.sickHours, 0) * 100) / 100,
            vacationHours: Math.round(activePayroll.reduce((sum, p) => sum + p.vacationHours, 0) * 100) / 100
        }

        return NextResponse.json({
            payroll: activePayroll,
            totals,
            month,
            year,
            employeeCount: activePayroll.length
        })

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[GET /api/admin/payroll] Error:", errorMessage, error)
        return NextResponse.json({
            error: "Interner Serverfehler"
        }, { status: 500 })
    }
}

/**
 * Format consecutive dates into period strings
 * e.g., [Jan 5, Jan 6, Jan 7, Jan 20, Jan 21] -> "05.01.-07.01., 20.01.-21.01."
 */
function formatDatePeriods(dates: Date[]): string {
    if (dates.length === 0) return ""

    // Sort dates
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())

    const periods: string[] = []
    let periodStart = sorted[0]
    let periodEnd = sorted[0]

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i]
        const prev = sorted[i - 1]

        // Check if consecutive (1 day apart)
        const dayDiff = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))

        if (dayDiff === 1) {
            // Extend period
            periodEnd = current
        } else {
            // Close current period and start new one
            periods.push(formatPeriod(periodStart, periodEnd))
            periodStart = current
            periodEnd = current
        }
    }

    // Don't forget the last period
    periods.push(formatPeriod(periodStart, periodEnd))

    return periods.join(", ")
}

/**
 * Format a single period
 */
function formatPeriod(start: Date, end: Date): string {
    const formatDate = (d: Date) => format(d, "dd.MM.", { locale: de })

    if (start.getTime() === end.getTime()) {
        return formatDate(start)
    }

    return `${formatDate(start)}-${formatDate(end)}`
}

/**
 * Map travel cost type to display string
 */
function mapTravelCostType(type: string): string {
    switch (type) {
        case "CAR":
            return "Auto"
        case "DEUTSCHLANDTICKET":
            return "DB"
        case "NONE":
        default:
            return "-"
    }
}
