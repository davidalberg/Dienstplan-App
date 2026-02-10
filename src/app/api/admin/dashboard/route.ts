import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { ALL_TIMESHEET_STATUSES } from "@/lib/constants"

export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const dayAfterTomorrow = new Date(tomorrow)
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)

        const currentMonth = today.getMonth() + 1
        const currentYear = today.getFullYear()

        const twoWeeksFromNow = new Date(today)
        twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)

        const sevenDaysFromNow = new Date(today)
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

        // All independent queries in parallel
        const [
            todayShifts,
            tomorrowShifts,
            pendingSubmissions,
            unsignedEmployees,
            pendingVacations,
            monthlyShifts,
            completedShifts,
            sickShifts,
            vacationShifts,
            totalEmployees,
            recentActivities,
            sickTimesheets,
            upcomingVacations,
            employeesWithoutShifts,
            clientsWithTimesheets,
            monthSubmissions,
            weekShifts,
            activeClients
        ] = await Promise.all([
            // 1. Today shifts
            prisma.timesheet.findMany({
                where: {
                    date: { gte: today, lt: tomorrow },
                    absenceType: null,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                include: {
                    employee: { select: { id: true, name: true, email: true } }
                },
                orderBy: { plannedStart: "asc" }
            }),
            // 1b. Tomorrow shifts
            prisma.timesheet.findMany({
                where: {
                    date: { gte: tomorrow, lt: dayAfterTomorrow },
                    absenceType: null,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                include: {
                    employee: { select: { id: true, name: true, email: true } }
                },
                orderBy: { plannedStart: "asc" }
            }),
            // 2a. Pending submissions
            prisma.teamSubmission.count({
                where: {
                    month: currentMonth,
                    year: currentYear,
                    status: { not: "COMPLETED" }
                }
            }),
            // 2b. Unsigned employees
            prisma.employeeSignature.count({
                where: {
                    teamSubmission: {
                        month: currentMonth,
                        year: currentYear,
                        status: "PENDING_EMPLOYEES"
                    },
                    signature: null
                }
            }),
            // 2c. Pending vacations
            prisma.vacationRequest.count({
                where: { status: "PENDING" }
            }),
            // 3. Monthly shifts count
            prisma.timesheet.count({
                where: { month: currentMonth, year: currentYear }
            }),
            // 3b. Completed shifts count
            prisma.timesheet.count({
                where: {
                    month: currentMonth,
                    year: currentYear,
                    status: { not: "PLANNED" }
                }
            }),
            // 3c. Sick shifts count
            prisma.timesheet.count({
                where: {
                    month: currentMonth,
                    year: currentYear,
                    absenceType: "SICK"
                }
            }),
            // 3d. Vacation shifts count
            prisma.timesheet.count({
                where: {
                    month: currentMonth,
                    year: currentYear,
                    absenceType: "VACATION"
                }
            }),
            // 4. Total employees
            prisma.user.count({
                where: { role: "EMPLOYEE" }
            }),
            // 5. Recent activities
            prisma.activityLog.findMany({
                take: 10,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    type: true,
                    category: true,
                    action: true,
                    userName: true,
                    createdAt: true
                }
            }),
            // 6. Sick timesheets this month
            prisma.timesheet.findMany({
                where: {
                    month: currentMonth,
                    year: currentYear,
                    absenceType: "SICK"
                },
                include: {
                    employee: { select: { id: true, name: true } }
                }
            }),
            // 7. Upcoming vacations
            prisma.vacationRequest.findMany({
                where: {
                    status: "APPROVED",
                    startDate: { gte: today, lte: twoWeeksFromNow }
                },
                include: {
                    employee: { select: { name: true } }
                },
                orderBy: { startDate: "asc" }
            }),
            // 8. Employees without shifts
            prisma.user.findMany({
                where: {
                    role: "EMPLOYEE",
                    timesheets: { none: { month: currentMonth, year: currentYear } }
                },
                select: { id: true, name: true }
            }),
            // 9a. Clients with timesheets
            prisma.client.findMany({
                where: {
                    isActive: true,
                    OR: [
                        { employees: { some: { timesheets: { some: { month: currentMonth, year: currentYear, status: { in: [...ALL_TIMESHEET_STATUSES] } } } } } },
                        { teams: { some: { timesheets: { some: { month: currentMonth, year: currentYear, status: { in: [...ALL_TIMESHEET_STATUSES] } } } } } }
                    ]
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            }),
            // 9b. Month submissions
            prisma.teamSubmission.findMany({
                where: { month: currentMonth, year: currentYear },
                select: {
                    clientId: true,
                    status: true,
                    employeeSignatures: {
                        select: { signature: true }
                    }
                }
            }),
            // 10. Week shifts
            prisma.timesheet.findMany({
                where: {
                    date: { gte: today, lt: sevenDaysFromNow },
                    absenceType: null,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                select: { date: true }
            }),
            // 11. Active clients
            prisma.client.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    _count: {
                        select: { employees: true }
                    }
                }
            })
        ])

        // Process sick employees
        const sickMap = new Map<string, { employeeName: string; days: number }>()
        for (const s of sickTimesheets) {
            const existing = sickMap.get(s.employeeId)
            if (existing) {
                existing.days++
            } else {
                sickMap.set(s.employeeId, { employeeName: s.employee.name || "Unbekannt", days: 1 })
            }
        }
        const sickByEmployee = Array.from(sickMap.values()).sort((a, b) => b.days - a.days)

        // Process pending signatures
        const submissionByClient = new Map(monthSubmissions.filter(s => s.clientId).map(s => [s.clientId!, s]))
        const pendingSignaturesList: { clientName: string; status: string; detail: string }[] = []
        for (const client of clientsWithTimesheets) {
            const submission = submissionByClient.get(client.id)
            const clientName = `${client.firstName} ${client.lastName}`

            if (!submission) {
                pendingSignaturesList.push({ clientName, status: "NOT_SUBMITTED", detail: "Noch nicht eingereicht" })
            } else if (submission.status === "PENDING_EMPLOYEES") {
                const signed = submission.employeeSignatures.filter(s => s.signature !== null).length
                const total = submission.employeeSignatures.length
                pendingSignaturesList.push({ clientName, status: "PENDING_EMPLOYEES", detail: `${signed}/${total} unterschrieben` })
            } else if (submission.status === "PENDING_RECIPIENT") {
                pendingSignaturesList.push({ clientName, status: "PENDING_RECIPIENT", detail: "Warte auf Klient" })
            }
        }

        // Process week preview
        const weekPlanMap = new Map<string, number>()
        for (let i = 0; i < 7; i++) {
            const d = new Date(today)
            d.setDate(d.getDate() + i)
            weekPlanMap.set(d.toISOString().split("T")[0], 0)
        }
        for (const s of weekShifts) {
            const key = new Date(s.date).toISOString().split("T")[0]
            weekPlanMap.set(key, (weekPlanMap.get(key) || 0) + 1)
        }
        const weekPreview = Array.from(weekPlanMap.entries()).map(([date, count]) => ({ date, shiftCount: count }))

        // Process client coverage
        const clientCoverage = activeClients.map(c => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`,
            employeeCount: c._count.employees
        }))

        const mapShift = (s: typeof todayShifts[number]) => ({
            id: s.id,
            employeeName: s.employee.name || s.employee.email,
            plannedStart: s.plannedStart,
            plannedEnd: s.plannedEnd,
            actualStart: s.actualStart,
            actualEnd: s.actualEnd,
            status: s.status
        })

        return NextResponse.json({
            todayShifts: todayShifts.map(mapShift),
            tomorrowShifts: tomorrowShifts.map(mapShift),
            tomorrowDate: tomorrow.toISOString(),
            pendingActions: {
                submissions: pendingSubmissions,
                unsignedEmployees,
                vacationRequests: pendingVacations
            },
            monthStats: {
                month: currentMonth,
                year: currentYear,
                totalShifts: monthlyShifts,
                completedShifts,
                sickDays: sickShifts,
                vacationDays: vacationShifts,
                completionRate: monthlyShifts > 0
                    ? Math.round((completedShifts / monthlyShifts) * 100)
                    : 0
            },
            totalEmployees,
            recentActivities,
            clientCoverage,
            sickByEmployee,
            upcomingVacations: upcomingVacations.map(v => ({
                employeeName: v.employee.name || "Unbekannt",
                startDate: v.startDate.toISOString(),
                endDate: v.endDate.toISOString()
            })),
            employeesWithoutShifts,
            pendingSignaturesList,
            weekPreview
        })
    } catch (error: unknown) {
        console.error("[GET /api/admin/dashboard] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
