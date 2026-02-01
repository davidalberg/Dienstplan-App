import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { startOfWeek, endOfWeek, eachDayOfInterval, format } from "date-fns"
import { de } from "date-fns/locale"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const weekParam = searchParams.get("week") // Format: 2026-W05
    const teamId = searchParams.get("teamId") || undefined

    if (!weekParam) {
        return NextResponse.json({ error: "Week parameter required (format: YYYY-Wxx)" }, { status: 400 })
    }

    try {
        // Parse week parameter (e.g., "2026-W05")
        const [yearStr, weekStr] = weekParam.split("-W")
        const year = parseInt(yearStr)
        const week = parseInt(weekStr)

        if (isNaN(year) || isNaN(week)) {
            return NextResponse.json({ error: "Invalid week format" }, { status: 400 })
        }

        // Calculate week start and end dates
        // ISO week starts on Monday
        const firstDayOfYear = new Date(year, 0, 1)
        const daysOffset = (week - 1) * 7
        const weekStartDate = new Date(firstDayOfYear.getTime() + daysOffset * 24 * 60 * 60 * 1000)
        const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 }) // Monday
        const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: 1 }) // Sunday

        // Get all days of the week
        const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

        // Build where clause for employees
        const employeeWhere: any = { role: "EMPLOYEE" }
        if (teamId) {
            employeeWhere.teamId = teamId
        }

        // Fetch employees with their shifts for this week
        const employees = await prisma.user.findMany({
            where: employeeWhere,
            select: {
                id: true,
                name: true,
                teamId: true,
                team: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                timesheets: {
                    where: {
                        date: {
                            gte: weekStart,
                            lte: weekEnd
                        },
                        status: {
                            in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"]
                        }
                    },
                    select: {
                        id: true,
                        date: true,
                        plannedStart: true,
                        plannedEnd: true,
                        actualStart: true,
                        actualEnd: true,
                        status: true,
                        absenceType: true,
                        note: true
                    },
                    orderBy: { date: "asc" }
                }
            },
            orderBy: { name: "asc" }
        })

        // Fetch all teams for filter dropdown
        const teams = await prisma.team.findMany({
            where: {
                members: {
                    some: { role: "EMPLOYEE" }
                }
            },
            select: {
                id: true,
                name: true
            },
            orderBy: { name: "asc" }
        })

        // Format response
        const employeeOverview = employees.map((employee: any) => {
            // Map shifts by weekday (0 = Monday, 6 = Sunday)
            const shiftsByDay: Record<number, any> = {}

            employee.timesheets.forEach((shift: any) => {
                const shiftDate = new Date(shift.date)
                const dayOfWeek = (shiftDate.getDay() + 6) % 7 // Convert Sunday=0 to Sunday=6

                // Calculate hours for the shift
                const start = shift.actualStart || shift.plannedStart
                const end = shift.actualEnd || shift.plannedEnd

                let hours = 0
                if (start && end) {
                    const [startH, startM] = start.split(":").map(Number)
                    const [endH, endM] = end.split(":").map(Number)
                    let totalMinutes = endH * 60 + endM - startH * 60 - startM
                    // Handle overnight shifts
                    if (totalMinutes < 0) totalMinutes += 24 * 60
                    hours = Math.max(0, totalMinutes / 60)
                }

                shiftsByDay[dayOfWeek] = {
                    id: shift.id,
                    start: start || "-",
                    end: end || "-",
                    hours: hours || 0,
                    status: shift.status,
                    absenceType: shift.absenceType,
                    note: shift.note
                }
            })

            return {
                id: employee.id,
                name: employee.name,
                teamId: employee.teamId,
                teamName: employee.team?.name || "Ohne Team",
                shifts: shiftsByDay
            }
        })

        return NextResponse.json({
            weekStart: format(weekStart, "yyyy-MM-dd"),
            weekEnd: format(weekEnd, "yyyy-MM-dd"),
            weekLabel: format(weekStart, "dd.MM.", { locale: de }) + " - " + format(weekEnd, "dd.MM.yyyy", { locale: de }),
            employees: employeeOverview,
            teams
        })
    } catch (error: any) {
        console.error("[GET /api/admin/team-overview] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
