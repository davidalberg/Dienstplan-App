import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as unknown as { role: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const currentMonth = today.getMonth() + 1
        const currentYear = today.getFullYear()

        // 1. Heute im Dienst - Schichten fuer heute
        const todayShifts = await prisma.timesheet.findMany({
            where: {
                date: {
                    gte: today,
                    lt: tomorrow
                },
                absenceType: null,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
            },
            include: {
                employee: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { plannedStart: "asc" }
        })

        // 2. Ausstehende Aktionen
        // 2a. Offene TeamSubmissions (noch nicht COMPLETED)
        const pendingSubmissions = await prisma.teamSubmission.count({
            where: {
                month: currentMonth,
                year: currentYear,
                status: { not: "COMPLETED" }
            }
        })

        // 2b. Mitarbeiter die noch nicht unterschrieben haben
        const unsignedEmployees = await prisma.employeeSignature.count({
            where: {
                teamSubmission: {
                    month: currentMonth,
                    year: currentYear,
                    status: "PENDING_EMPLOYEES"
                },
                signature: null
            }
        })

        // 2c. Offene Urlaubsantraege
        const pendingVacations = await prisma.vacationRequest.count({
            where: { status: "PENDING" }
        })

        // 3. Monats-Statistiken
        const monthlyShifts = await prisma.timesheet.count({
            where: { month: currentMonth, year: currentYear }
        })

        const completedShifts = await prisma.timesheet.count({
            where: {
                month: currentMonth,
                year: currentYear,
                status: { in: ["CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
            }
        })

        const sickShifts = await prisma.timesheet.count({
            where: {
                month: currentMonth,
                year: currentYear,
                absenceType: "SICK"
            }
        })

        const vacationShifts = await prisma.timesheet.count({
            where: {
                month: currentMonth,
                year: currentYear,
                absenceType: "VACATION"
            }
        })

        // 4. Mitarbeiter-Statistik
        const totalEmployees = await prisma.user.count({
            where: { role: "EMPLOYEE" }
        })

        // 5. Neueste Aktivitaeten
        const recentActivities = await prisma.activityLog.findMany({
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
        })

        // 6. Klienten-Abdeckung
        const activeClients = await prisma.client.findMany({
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

        const clientCoverage = activeClients.map(c => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`,
            employeeCount: c._count.employees
        }))

        return NextResponse.json({
            todayShifts: todayShifts.map(s => ({
                id: s.id,
                employeeName: s.employee.name || s.employee.email,
                plannedStart: s.plannedStart,
                plannedEnd: s.plannedEnd,
                actualStart: s.actualStart,
                actualEnd: s.actualEnd,
                status: s.status
            })),
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
            clientCoverage
        })
    } catch (error: unknown) {
        console.error("[GET /api/admin/dashboard] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
