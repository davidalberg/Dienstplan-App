import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { ALL_TIMESHEET_STATUSES } from "@/lib/constants"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

/**
 * Query parameter validation
 */
const QueryParamsSchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2030)
})

/**
 * GET /api/admin/payroll/export
 *
 * Exports payroll data as Excel file with 16 columns.
 */
export async function GET(req: NextRequest) {
    // Auth check: Require ADMIN role
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

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
        // Fetch employees and timesheets in parallel
        const [employees, timesheets] = await Promise.all([
            prisma.user.findMany({
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
            }),
            prisma.timesheet.findMany({
                where: {
                    month,
                    year,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                orderBy: { date: "asc" }
            })
        ])

        // O(n) Gruppierung statt O(n²) Filter in der Schleife
        const timesheetsByEmployee = new Map<string, typeof timesheets>()
        const backupDaysByEmployee = new Map<string, number>()

        for (const ts of timesheets) {
            const existing = timesheetsByEmployee.get(ts.employeeId) || []
            existing.push(ts)
            timesheetsByEmployee.set(ts.employeeId, existing)

            if (ts.backupEmployeeId) {
                backupDaysByEmployee.set(
                    ts.backupEmployeeId,
                    (backupDaysByEmployee.get(ts.backupEmployeeId) || 0) + 1
                )
            }
        }

        // Process each employee's payroll data
        const excelData: any[] = []

        for (const employee of employees) {
            // O(1) Lookup statt O(n) Filter
            const employeeTimesheets = timesheetsByEmployee.get(employee.id) || []

            // Skip employees with no activity
            if (employeeTimesheets.length === 0) {
                const hasBackup = (backupDaysByEmployee.get(employee.id) || 0) > 0
                if (!hasBackup) continue
            }

            // Nutze aggregateMonthlyData für konsistente Berechnung (inkl. Backup-Stunden)
            const aggregated = aggregateMonthlyData(
                employeeTimesheets,
                {
                    id: employee.id,
                    hourlyWage: employee.hourlyWage || 0,
                    nightPremiumEnabled: employee.nightPremiumEnabled,
                    nightPremiumPercent: employee.nightPremiumPercent || 25,
                    sundayPremiumEnabled: employee.sundayPremiumEnabled,
                    sundayPremiumPercent: employee.sundayPremiumPercent || 30,
                    holidayPremiumEnabled: employee.holidayPremiumEnabled,
                    holidayPremiumPercent: employee.holidayPremiumPercent || 125
                },
                timesheets  // ALLE Timesheets für Backup-Suche
            )

            // O(1) Lookup für Backup-Tage
            const backupDays = backupDaysByEmployee.get(employee.id) || 0

            // Skip if no activity at all
            if (aggregated.totalHours === 0 && aggregated.sickHours === 0 && aggregated.vacationHours === 0 && backupDays === 0) {
                continue
            }

            // Krankheitszeiträume formatieren
            const sickDates = employeeTimesheets
                .filter(ts => ts.absenceType === "SICK")
                .map(ts => new Date(ts.date))
            const sickPeriods = formatDatePeriods(sickDates)

            // Get client name via team
            const clientName = employee.team?.client
                ? `${employee.team.client.firstName} ${employee.team.client.lastName}`
                : ""

            // Map travelCostType
            const travelCostDisplay = mapTravelCostType(employee.travelCostType)

            // Format dates
            const entryDateStr = employee.entryDate
                ? format(employee.entryDate, "dd.MM.yyyy", { locale: de })
                : ""
            const exitDateStr = employee.exitDate
                ? format(employee.exitDate, "dd.MM.yyyy", { locale: de })
                : ""

            // Build row with 17 columns (A-Q) - neue Spalte für Backup-Stunden
            excelData.push({
                "ID": employee.id,
                "Klientname": clientName,
                "Assistenzkraft": employee.name || "Unbekannt",
                "Eintrittsdatum": entryDateStr,
                "Austrittsdatum": exitDateStr,
                "Stundenlohn": employee.hourlyWage || 0,
                "Gesamtstunden": aggregated.totalHours,      // INKL. Backup-Stunden!
                "Nachtzuschlag-Std": aggregated.nightHours,  // INKL. Backup-Nachtstunden!
                "Sonntagszuschlag-Std": aggregated.sundayHours,   // INKL. Backup-Sonntagsstunden!
                "Feiertagszuschlag-Std": aggregated.holidayHours, // INKL. Backup-Feiertagsstunden!
                "Bereitschaftstage": backupDays,              // Alle Bereitschaftstage
                "Eingesprungen-Std": aggregated.backupHours,  // NEU: Eingesprungene Stunden
                "Krank von-bis": sickPeriods,
                "Krankstunden": aggregated.sickHours,
                "Urlaubstage": aggregated.vacationDays,
                "Urlaubsstunden": aggregated.vacationHours,
                "Fahrtkosten": travelCostDisplay
            })
        }

        // Create Excel workbook
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(excelData)

        // Set column widths (17 columns A-Q)
        ws['!cols'] = [
            { wch: 28 },  // A: ID
            { wch: 20 },  // B: Klientname
            { wch: 22 },  // C: Assistenzkraft
            { wch: 14 },  // D: Eintrittsdatum
            { wch: 14 },  // E: Austrittsdatum
            { wch: 12 },  // F: Stundenlohn
            { wch: 14 },  // G: Gesamtstunden
            { wch: 18 },  // H: Nachtzuschlag-Std
            { wch: 20 },  // I: Sonntagszuschlag-Std
            { wch: 20 },  // J: Feiertagszuschlag-Std
            { wch: 16 },  // K: Bereitschaftstage
            { wch: 16 },  // L: Eingesprungen-Std (NEU)
            { wch: 28 },  // M: Krank von-bis
            { wch: 14 },  // N: Krankstunden
            { wch: 12 },  // O: Urlaubstage
            { wch: 14 },  // P: Urlaubsstunden
            { wch: 12 }   // Q: Fahrtkosten
        ]

        // German month name for filename
        const monthNames = [
            "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
            "Juli", "August", "September", "Oktober", "November", "Dezember"
        ]

        const sheetName = `Lohnliste_${monthNames[month - 1]}_${year}`
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)) // Sheet name max 31 chars

        const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

        const filename = `Lohnliste_${monthNames[month - 1]}_${year}.xlsx`

        return new NextResponse(excelBuffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        })

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[GET /api/admin/payroll/export] Error:", errorMessage, error)
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
