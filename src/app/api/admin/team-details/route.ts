import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    const { searchParams } = new URL(req.url)
    const source = searchParams.get("source")
    const month = parseInt(searchParams.get("month") || "", 10)
    const year = parseInt(searchParams.get("year") || "", 10)

    if (!source || isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 })
    }

    try {
        // Get all timesheets for this source/plan
        // Note: 'source' can be either the tab name OR the sheet file name
        // We need to search for both to support the new sheetFileName grouping
        const timesheets = await prisma.timesheet.findMany({
            where: {
                OR: [
                    { source }, // Tab name like "Januar"
                    { sheetFileName: source } // File name like "Dienstplan Sarah Erbach 2026"
                ],
                month,
                year
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        hourlyWage: true,
                        nightPremiumEnabled: true,
                        nightPremiumPercent: true,
                        sundayPremiumEnabled: true,
                        sundayPremiumPercent: true,
                        holidayPremiumEnabled: true,
                        holidayPremiumPercent: true
                    }
                }
            },
            orderBy: { date: "asc" }
        })

        // Alle Timesheets für Backup-Berechnung laden
        const allMonthTimesheets = await prisma.timesheet.findMany({
            where: { month, year },
            select: {
                backupEmployeeId: true,
                absenceType: true,
                actualStart: true,
                actualEnd: true,
                plannedStart: true,
                plannedEnd: true,
                date: true
            }
        })

        // Group by employee
        const employeeMap = new Map<string, any>()

        for (const ts of timesheets) {
            const empId = ts.employee.id
            if (!employeeMap.has(empId)) {
                employeeMap.set(empId, {
                    id: empId,
                    name: ts.employee.name,
                    email: ts.employee.email,
                    hourlyWage: ts.employee.hourlyWage,
                    nightPremiumEnabled: ts.employee.nightPremiumEnabled,
                    nightPremiumPercent: ts.employee.nightPremiumPercent,
                    sundayPremiumEnabled: ts.employee.sundayPremiumEnabled,
                    sundayPremiumPercent: ts.employee.sundayPremiumPercent,
                    holidayPremiumEnabled: ts.employee.holidayPremiumEnabled,
                    holidayPremiumPercent: ts.employee.holidayPremiumPercent,
                    timesheets: [],
                    hasSubmitted: false
                })
            }
            employeeMap.get(empId).timesheets.push(ts)
        }

        // Calculate stats for each employee
        const employees = Array.from(employeeMap.values()).map(emp => {
            let plannedMinutes = 0
            let actualMinutes = 0
            const discrepancies: any[] = []
            let allSubmitted = true

            for (const ts of emp.timesheets) {
                // Check submission status
                if (ts.status !== "SUBMITTED") {
                    allSubmitted = false
                }

                // Calculate planned hours
                if (ts.plannedStart && ts.plannedEnd) {
                    const [startH, startM] = ts.plannedStart.split(":").map(Number)
                    const [endH, endM] = ts.plannedEnd.split(":").map(Number)
                    let diff = (endH * 60 + endM) - (startH * 60 + startM)
                    if (diff < 0) diff += 24 * 60
                    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
                    if (diff === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
                        diff = 24 * 60
                    }
                    plannedMinutes += diff
                }

                // Calculate actual hours (exclude sick leave and vacation)
                if (ts.actualStart && ts.actualEnd && !ts.absenceType) {
                    const [startH, startM] = ts.actualStart.split(":").map(Number)
                    const [endH, endM] = ts.actualEnd.split(":").map(Number)
                    let diff = (endH * 60 + endM) - (startH * 60 + startM)
                    if (diff < 0) diff += 24 * 60
                    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
                    if (diff === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
                        diff = 24 * 60
                    }
                    actualMinutes += diff
                }
                // Fallback to planned times for confirmed shifts without absences
                else if (!ts.actualStart && !ts.actualEnd && !ts.absenceType &&
                         ['CONFIRMED', 'CHANGED', 'SUBMITTED'].includes(ts.status) &&
                         ts.plannedStart && ts.plannedEnd) {
                    const [startH, startM] = ts.plannedStart.split(":").map(Number)
                    const [endH, endM] = ts.plannedEnd.split(":").map(Number)
                    let diff = (endH * 60 + endM) - (startH * 60 + startM)
                    if (diff < 0) diff += 24 * 60
                    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
                    if (diff === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
                        diff = 24 * 60
                    }
                    actualMinutes += diff
                }

                // Check for discrepancies
                if (ts.plannedStart && ts.plannedEnd && ts.actualStart && ts.actualEnd) {
                    // Hilfsfunktion: Normalisiere Zeit für Vergleich (0:00 und 24:00 als gleich behandeln)
                    const normalizeTime = (time: string): string => {
                        if (time === "24:00") return "0:00"
                        return time
                    }

                    // Prüfe ob Zeiten wirklich unterschiedlich sind (unter Berücksichtigung von 0:00 = 24:00)
                    const plannedStartNorm = normalizeTime(ts.plannedStart)
                    const plannedEndNorm = normalizeTime(ts.plannedEnd)
                    const actualStartNorm = normalizeTime(ts.actualStart)
                    const actualEndNorm = normalizeTime(ts.actualEnd)

                    // Berechne tatsächliche Arbeitsminuten für beide
                    const [pStartH, pStartM] = ts.plannedStart.split(":").map(Number)
                    const [pEndH, pEndM] = ts.plannedEnd.split(":").map(Number)
                    let plannedDiff = (pEndH * 60 + pEndM) - (pStartH * 60 + pStartM)
                    if (plannedDiff < 0) plannedDiff += 24 * 60
                    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
                    if (plannedDiff === 0 && pStartH === 0 && pStartM === 0 && pEndH === 0 && pEndM === 0) {
                        plannedDiff = 24 * 60
                    }

                    const [aStartH, aStartM] = ts.actualStart.split(":").map(Number)
                    const [aEndH, aEndM] = ts.actualEnd.split(":").map(Number)
                    let actualDiff = (aEndH * 60 + aEndM) - (aStartH * 60 + aStartM)
                    if (actualDiff < 0) actualDiff += 24 * 60
                    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
                    if (actualDiff === 0 && aStartH === 0 && aStartM === 0 && aEndH === 0 && aEndM === 0) {
                        actualDiff = 24 * 60
                    }

                    // Nur als Abweichung zählen wenn:
                    // 1. Die normalisierten Zeiten unterschiedlich sind UND
                    // 2. Die tatsächliche Stundendifferenz nicht 0 ist
                    const timesAreDifferent = plannedStartNorm !== actualStartNorm || plannedEndNorm !== actualEndNorm
                    const hoursDiffer = Math.abs(actualDiff - plannedDiff) > 0

                    if (timesAreDifferent && hoursDiffer) {
                        const plannedTime = `${ts.plannedStart}-${ts.plannedEnd}`
                        const actualTime = `${ts.actualStart}-${ts.actualEnd}`
                        const diffHours = (actualDiff - plannedDiff) / 60

                        discrepancies.push({
                            date: format(new Date(ts.date), "dd.MM.yyyy (EEEE)", { locale: de }),
                            planned: plannedTime,
                            actual: actualTime,
                            diffText: diffHours >= 0 ? `+${diffHours.toFixed(2)}h` : `${diffHours.toFixed(2)}h`
                        })
                    }
                }
            }

            emp.hasSubmitted = allSubmitted && emp.timesheets.length > 0

            // Aggregierte Statistiken berechnen
            const aggregated = aggregateMonthlyData(
                emp.timesheets,
                {
                    id: emp.id,
                    hourlyWage: emp.hourlyWage || 0,
                    nightPremiumEnabled: emp.nightPremiumEnabled ?? true,
                    nightPremiumPercent: emp.nightPremiumPercent || 25,
                    sundayPremiumEnabled: emp.sundayPremiumEnabled ?? true,
                    sundayPremiumPercent: emp.sundayPremiumPercent || 30,
                    holidayPremiumEnabled: emp.holidayPremiumEnabled ?? true,
                    holidayPremiumPercent: emp.holidayPremiumPercent || 125
                },
                allMonthTimesheets
            )

            emp.stats = {
                plannedHours: plannedMinutes / 60,
                actualHours: actualMinutes / 60,
                difference: (actualMinutes - plannedMinutes) / 60,
                discrepancies,
                // Erweiterte Statistiken
                totalHours: aggregated.totalHours,
                nightHours: aggregated.nightHours,
                sundayHours: aggregated.sundayHours,
                holidayHours: aggregated.holidayHours,
                backupDays: aggregated.backupDays,
                sickDays: aggregated.sickDays,
                sickHours: aggregated.sickHours,
                vacationDays: aggregated.vacationDays,
                vacationHours: aggregated.vacationHours
            }

            return emp
        })

        // Sort by name
        employees.sort((a, b) => a.name.localeCompare(b.name))

        return NextResponse.json({ employees })
    } catch (error: any) {
        console.error("[GET /api/admin/team-details] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
