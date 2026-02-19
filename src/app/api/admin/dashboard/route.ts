import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { ALL_TIMESHEET_STATUSES } from "@/lib/constants"

export const maxDuration = 25

export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result

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

        // === OPTIMIERT: 10 Queries statt 18 ===
        const [
            // 1. Schichten heute + morgen in einer Query (date range statt 2 separate)
            todayTomorrowShifts,
            // 2. Pending submissions count
            pendingSubmissions,
            // 3. Unsigned employees count
            unsignedEmployees,
            // 4. Monatsstatistiken per groupBy (1 Query statt 4 separate counts)
            monthStats,
            // 5. Total employees
            totalEmployees,
            // 6. Recent activities
            recentActivities,
            // 7. Sick days per employee (groupBy statt findMany + manueller Aggregation)
            sickByEmployeeRaw,
            // 8. Upcoming vacations
            upcomingVacations,
            // 9. All employees (für "ohne Schichten" Post-Filter)
            allEmployees,
            // 10. Woche + Submissions + Clients in einer Batch
            weekShifts,
            monthSubmissions,
            activeClients
        ] = await Promise.all([
            // 1. Heute + Morgen kombiniert
            prisma.timesheet.findMany({
                where: {
                    date: { gte: today, lt: dayAfterTomorrow },
                    absenceType: null,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                include: {
                    employee: { select: { id: true, name: true, email: true } }
                },
                orderBy: { plannedStart: "asc" }
            }),
            // 2. Pending submissions
            prisma.teamSubmission.count({
                where: {
                    month: currentMonth,
                    year: currentYear,
                    status: { not: "COMPLETED" }
                }
            }),
            // 3. Unsigned employees
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
            // 4. Monatsstatistiken: 1 groupBy statt 4 counts
            prisma.timesheet.groupBy({
                by: ["status", "absenceType"],
                where: { month: currentMonth, year: currentYear },
                _count: { id: true }
            }),
            // 5. Total employees
            prisma.user.count({
                where: { role: "EMPLOYEE" }
            }),
            // 6. Recent activities
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
            // 7. Sick groupBy (statt findMany + manuelle Map)
            prisma.timesheet.groupBy({
                by: ["employeeId"],
                where: {
                    month: currentMonth,
                    year: currentYear,
                    absenceType: "SICK"
                },
                _count: { id: true }
            }),
            // 8. Upcoming vacations
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
            // 9. All employees (leichtgewichtig, für Post-Filter)
            prisma.user.findMany({
                where: { role: "EMPLOYEE" },
                select: { id: true, name: true }
            }),
            // 10. Wochenschichten
            prisma.timesheet.findMany({
                where: {
                    date: { gte: today, lt: sevenDaysFromNow },
                    absenceType: null,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                select: { date: true }
            }),
            // 11. Month submissions (ohne nested signatures — nur count)
            prisma.teamSubmission.findMany({
                where: { month: currentMonth, year: currentYear },
                select: {
                    clientId: true,
                    status: true,
                    _count: { select: { employeeSignatures: true } },
                    employeeSignatures: {
                        where: { signature: { not: null } },
                        select: { id: true }
                    }
                }
            }),
            // 12. Active clients
            prisma.client.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    _count: { select: { employees: true } }
                }
            })
        ])

        // === POST-PROCESSING ===

        // Split today/tomorrow shifts
        const todayShifts = todayTomorrowShifts.filter(s => {
            const d = new Date(s.date)
            return d >= today && d < tomorrow
        })
        const tomorrowShifts = todayTomorrowShifts.filter(s => {
            const d = new Date(s.date)
            return d >= tomorrow && d < dayAfterTomorrow
        })

        // Month stats from groupBy (statt 4 separate count-Queries)
        let totalShifts = 0
        let completedShifts = 0
        let sickDays = 0
        let vacationDays = 0
        for (const row of monthStats) {
            const count = row._count.id
            totalShifts += count
            if (row.status !== "PLANNED") completedShifts += count
            if (row.absenceType === "SICK") sickDays += count
            if (row.absenceType === "VACATION") vacationDays += count
        }

        // Sick by employee — Namen aus allEmployees Map holen
        const employeeMap = new Map(allEmployees.map(e => [e.id, e.name || "Unbekannt"]))
        const sickByEmployee = sickByEmployeeRaw
            .map(s => ({ employeeName: employeeMap.get(s.employeeId) || "Unbekannt", days: s._count.id }))
            .sort((a, b) => b.days - a.days)

        // Employees without shifts (Post-Filter statt NOT EXISTS subquery)
        const employeeIdsWithShifts = new Set(
            todayTomorrowShifts.map(s => s.employeeId)
        )
        // Wir brauchen alle, die diesen Monat KEINE Schicht haben
        // Nutze die monthStats nicht direkt — lade employeeIds aus weekShifts + todayTomorrow
        // Besser: Separate leichte Query für employeeIds mit Schichten in diesem Monat
        // Aber um eine weitere Query zu vermeiden, nutzen wir die Tatsache, dass
        // allEmployees klein ist (~20) und wir einfach prüfen können
        const employeesWithTimesheets = new Set<string>()
        // Aus den todayTomorrow-Schichten + Sick groupBy die IDs sammeln
        for (const s of todayTomorrowShifts) employeesWithTimesheets.add(s.employeeId)
        for (const s of sickByEmployeeRaw) employeesWithTimesheets.add(s.employeeId)
        // Noch die Wochenschichten haben keine employeeId im select...
        // Da wir keine vollständige Liste haben, machen wir doch eine leichte separate Query
        // Aber: bei ~20 Mitarbeitern ist ein simpler count pro Employee schneller
        // Alternative: Wir behalten die NOT EXISTS query aber als separate Query nach dem Promise.all
        const employeeIdsWithMonthShifts = await prisma.timesheet.findMany({
            where: { month: currentMonth, year: currentYear },
            select: { employeeId: true },
            distinct: ["employeeId"]
        })
        const monthShiftEmployeeIds = new Set(employeeIdsWithMonthShifts.map(t => t.employeeId))
        const employeesWithoutShifts = allEmployees.filter(e => !monthShiftEmployeeIds.has(e.id))

        // Pending signatures — aus monthSubmissions + activeClients berechnen
        // (statt separater clientsWithTimesheets Double-JOIN Query)
        const clientMap = new Map(activeClients.map(c => [c.id, `${c.firstName} ${c.lastName}`]))
        const submissionByClient = new Map(monthSubmissions.filter(s => s.clientId).map(s => [s.clientId!, s]))

        const pendingSignaturesList: { clientName: string; status: string; detail: string }[] = []
        // Clients die Submissions haben
        const clientsWithSubmissions = new Set(monthSubmissions.filter(s => s.clientId).map(s => s.clientId!))
        // Alle aktiven Clients durchgehen
        for (const client of activeClients) {
            const clientName = `${client.firstName} ${client.lastName}`
            const submission = submissionByClient.get(client.id)

            if (!submission) {
                // Nur anzeigen wenn Client überhaupt Mitarbeiter hat
                if (client._count.employees > 0) {
                    pendingSignaturesList.push({ clientName, status: "NOT_SUBMITTED", detail: "Noch nicht eingereicht" })
                }
            } else if (submission.status === "PENDING_EMPLOYEES") {
                const signed = submission.employeeSignatures.length // nur die mit signature !== null
                const total = submission._count.employeeSignatures
                pendingSignaturesList.push({ clientName, status: "PENDING_EMPLOYEES", detail: `${signed}/${total} unterschrieben` })
            } else if (submission.status === "PENDING_RECIPIENT") {
                pendingSignaturesList.push({ clientName, status: "PENDING_RECIPIENT", detail: "Warte auf Klient" })
            }
        }

        // Week preview
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

        // Client coverage
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

        // Pending vacations count aus upcomingVacations + separate Zählung
        const pendingVacations = await prisma.vacationRequest.count({
            where: { status: "PENDING" }
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
                totalShifts,
                completedShifts,
                sickDays,
                vacationDays,
                completionRate: totalShifts > 0
                    ? Math.round((completedShifts / totalShifts) * 100)
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
