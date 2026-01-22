import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { format } from "date-fns"
import { de } from "date-fns/locale"

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
        const timesheets = await prisma.timesheet.findMany({
            where: {
                source,
                month,
                year
            },
            include: {
                employee: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { date: "asc" }
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

                // Calculate actual hours
                if (ts.actualStart && ts.actualEnd) {
                    const [startH, startM] = ts.actualStart.split(":").map(Number)
                    const [endH, endM] = ts.actualEnd.split(":").map(Number)
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
            emp.stats = {
                plannedHours: plannedMinutes / 60,
                actualHours: actualMinutes / 60,
                difference: (actualMinutes - plannedMinutes) / 60,
                discrepancies
            }

            return emp
        })

        // Sort by name
        employees.sort((a, b) => a.name.localeCompare(b.name))

        return NextResponse.json({ employees })
    } catch (error: any) {
        console.error("Team details error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
