import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const source = searchParams.get("source")
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

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
                    plannedMinutes += diff
                }

                // Calculate actual hours (exclude sick leave and vacation)
                if (ts.actualStart && ts.actualEnd && !ts.absenceType) {
                    const [startH, startM] = ts.actualStart.split(":").map(Number)
                    const [endH, endM] = ts.actualEnd.split(":").map(Number)
                    let diff = (endH * 60 + endM) - (startH * 60 + startM)
                    if (diff < 0) diff += 24 * 60
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
                    actualMinutes += diff
                }

                // Check for discrepancies
                if (ts.plannedStart && ts.plannedEnd && ts.actualStart && ts.actualEnd) {
                    if (ts.plannedStart !== ts.actualStart || ts.plannedEnd !== ts.actualEnd) {
                        const plannedTime = `${ts.plannedStart}-${ts.plannedEnd}`
                        const actualTime = `${ts.actualStart}-${ts.actualEnd}`

                        // Calculate difference in hours
                        const [pStartH, pStartM] = ts.plannedStart.split(":").map(Number)
                        const [pEndH, pEndM] = ts.plannedEnd.split(":").map(Number)
                        let plannedDiff = (pEndH * 60 + pEndM) - (pStartH * 60 + pStartM)
                        if (plannedDiff < 0) plannedDiff += 24 * 60

                        const [aStartH, aStartM] = ts.actualStart.split(":").map(Number)
                        const [aEndH, aEndM] = ts.actualEnd.split(":").map(Number)
                        let actualDiff = (aEndH * 60 + aEndM) - (aStartH * 60 + aStartM)
                        if (actualDiff < 0) actualDiff += 24 * 60

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
