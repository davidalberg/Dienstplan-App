import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import {
    calculateTotalHours,
    calculateNightHours,
    isSundayDate,
    isNRWHoliday
} from "@/lib/premium-calculator"

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
        const excelData: any[] = []

        for (const employee of employees) {
            // Get employee's timesheets
            const employeeTimesheets = timesheets.filter(ts => ts.employeeId === employee.id)

            // Skip employees with no activity
            if (employeeTimesheets.length === 0) {
                // Also check if they appear as backup
                const asBackup = timesheets.filter(ts =>
                    ts.backupEmployeeId === employee.id &&
                    (ts.absenceType === "SICK" || ts.absenceType === "VACATION")
                )
                if (asBackup.length === 0) continue
            }

            // Calculate worked hours and premiums
            let totalHours = 0
            let nightHours = 0
            let sundayHours = 0
            let holidayHours = 0

            // Track sick periods
            const sickDates: Date[] = []
            let sickHours = 0

            // Track vacation
            const vacationDates: Date[] = []
            let vacationHours = 0

            employeeTimesheets.forEach(ts => {
                const date = new Date(ts.date)
                const start = ts.actualStart || ts.plannedStart
                const end = ts.actualEnd || ts.plannedEnd

                if (ts.absenceType === "SICK") {
                    sickDates.push(date)
                    if (start && end) {
                        sickHours += calculateTotalHours(start, end)
                    }
                } else if (ts.absenceType === "VACATION") {
                    vacationDates.push(date)
                    if (start && end) {
                        vacationHours += calculateTotalHours(start, end)
                    }
                } else if (start && end) {
                    // Regular work
                    const hours = calculateTotalHours(start, end)
                    totalHours += hours

                    // Night premium (23:00-06:00)
                    if (employee.nightPremiumEnabled) {
                        nightHours += calculateNightHours(start, end, date)
                    }

                    // Sunday premium
                    if (employee.sundayPremiumEnabled && isSundayDate(date)) {
                        sundayHours += hours
                    }

                    // Holiday premium
                    if (employee.holidayPremiumEnabled && isNRWHoliday(date)) {
                        holidayHours += hours
                    }
                }
            })

            // Count backup days
            const backupDays = timesheets.filter(ts =>
                ts.backupEmployeeId === employee.id &&
                (ts.absenceType === "SICK" || ts.absenceType === "VACATION")
            ).length

            // Skip if no activity at all
            if (totalHours === 0 && sickHours === 0 && vacationHours === 0 && backupDays === 0) {
                continue
            }

            // Format sick periods
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

            // Build row with 16 columns (A-P)
            excelData.push({
                "ID": employee.id,
                "Klientname": clientName,
                "Assistenzkraft": employee.name || "Unbekannt",
                "Eintrittsdatum": entryDateStr,
                "Austrittsdatum": exitDateStr,
                "Stundenlohn": employee.hourlyWage || 0,
                "Gesamtstunden": Math.round(totalHours * 100) / 100,
                "Nachtzuschlag-Std": Math.round(nightHours * 100) / 100,
                "Sonntagszuschlag-Std": Math.round(sundayHours * 100) / 100,
                "Feiertagszuschlag-Std": Math.round(holidayHours * 100) / 100,
                "Bereitschaftstage": backupDays,
                "Krank von-bis": sickPeriods,
                "Krankstunden": Math.round(sickHours * 100) / 100,
                "Urlaubstage": vacationDates.length,
                "Urlaubsstunden": Math.round(vacationHours * 100) / 100,
                "Fahrtkosten": travelCostDisplay
            })
        }

        // Create Excel workbook
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(excelData)

        // Set column widths
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
            { wch: 28 },  // L: Krank von-bis
            { wch: 14 },  // M: Krankstunden
            { wch: 12 },  // N: Urlaubstage
            { wch: 14 },  // O: Urlaubsstunden
            { wch: 12 }   // P: Fahrtkosten
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
