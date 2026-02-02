import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Helper: Berechne Urlaubstage zwischen zwei Daten (inklusive)
function calculateVacationDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate)
    const end = new Date(endDate)
    // Differenz in Millisekunden, umrechnen in Tage + 1 (inklusive)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
}

// GET - Liste aller Urlaubsantraege (mit Filter month/year/status/employeeId)
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const month = searchParams.get("month")
        const year = searchParams.get("year")
        const status = searchParams.get("status")
        const employeeId = searchParams.get("employeeId")

        // Filter aufbauen
        const where: any = {}

        // Status-Filter
        if (status) {
            where.status = status
        }

        // Employee-Filter
        if (employeeId) {
            where.employeeId = employeeId
        }

        // Zeitraum-Filter: Antraege die im angegebenen Monat/Jahr liegen
        if (month && year) {
            const monthNum = parseInt(month)
            const yearNum = parseInt(year)

            if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
                return NextResponse.json({ error: "Ungueltige Monat/Jahr Werte" }, { status: 400 })
            }

            // Erster und letzter Tag des Monats
            const firstDay = new Date(yearNum, monthNum - 1, 1)
            const lastDay = new Date(yearNum, monthNum, 0) // Letzter Tag des Monats

            // Antraege die den Monat ueberlappen
            where.OR = [
                // Start liegt im Monat
                {
                    startDate: {
                        gte: firstDay,
                        lte: lastDay
                    }
                },
                // Ende liegt im Monat
                {
                    endDate: {
                        gte: firstDay,
                        lte: lastDay
                    }
                },
                // Zeitraum umschliesst den ganzen Monat
                {
                    AND: [
                        { startDate: { lte: firstDay } },
                        { endDate: { gte: lastDay } }
                    ]
                }
            ]
        } else if (year) {
            // Nur Jahr-Filter
            const yearNum = parseInt(year)
            if (isNaN(yearNum)) {
                return NextResponse.json({ error: "Ungueltiges Jahr" }, { status: 400 })
            }

            const firstDay = new Date(yearNum, 0, 1)
            const lastDay = new Date(yearNum, 11, 31)

            where.OR = [
                { startDate: { gte: firstDay, lte: lastDay } },
                { endDate: { gte: firstDay, lte: lastDay } },
                {
                    AND: [
                        { startDate: { lte: firstDay } },
                        { endDate: { gte: lastDay } }
                    ]
                }
            ]
        }

        // Fetch formal VacationRequests
        const vacationRequests = await prisma.vacationRequest.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true
                    }
                },
                approver: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: [
                { startDate: "desc" },
                { createdAt: "desc" }
            ]
        })

        // Berechne Urlaubstage fuer jeden Antrag
        const requestsWithDays = vacationRequests.map(request => ({
            ...request,
            days: calculateVacationDays(request.startDate, request.endDate),
            source: "vacation_request" as const  // Mark source for UI
        }))

        // Fetch vacation timesheets from Dienstplan (absenceType = "VACATION")
        // that are NOT already covered by VacationRequests
        let timesheetVacations: Array<{
            id: string
            employeeId: string
            employee: { id: string; name: string | null; email: string; employeeId: string | null }
            startDate: Date
            endDate: Date
            days: number
            status: "APPROVED"
            reason: string
            source: "dienstplan"
            createdAt: Date
        }> = []

        if (month && year) {
            const monthNum = parseInt(month)
            const yearNum = parseInt(year)

            // Get all vacation timesheets for this period
            const vacationTimesheets = await prisma.timesheet.findMany({
                where: {
                    absenceType: "VACATION",
                    month: monthNum,
                    year: yearNum,
                    ...(employeeId ? { employeeId } : {})
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            employeeId: true
                        }
                    }
                },
                orderBy: { date: "desc" }
            })

            // Filter out timesheets that are already covered by VacationRequests
            const existingRequestDates = new Set<string>()
            for (const req of requestsWithDays) {
                const start = new Date(req.startDate)
                const end = new Date(req.endDate)
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    existingRequestDates.add(`${req.employeeId}_${d.toISOString().split('T')[0]}`)
                }
            }

            // Convert timesheets to vacation-like format
            for (const ts of vacationTimesheets) {
                const dateKey = `${ts.employeeId}_${ts.date.toISOString().split('T')[0]}`
                if (!existingRequestDates.has(dateKey)) {
                    timesheetVacations.push({
                        id: `timesheet_${ts.id}`,
                        employeeId: ts.employeeId,
                        employee: ts.employee,
                        startDate: ts.date,
                        endDate: ts.date,
                        days: 1,
                        status: "APPROVED",
                        reason: "Aus Dienstplan",
                        source: "dienstplan",
                        createdAt: ts.lastUpdatedAt || new Date()
                    })
                }
            }
        }

        // Combine both sources
        const allVacations = [...requestsWithDays, ...timesheetVacations]

        // Sort by startDate descending
        allVacations.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

        return NextResponse.json({
            vacationRequests: requestsWithDays,  // Keep original for backward compatibility
            requests: allVacations  // New combined list
        })
    } catch (error: any) {
        console.error("[GET /api/admin/vacations] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Neuer Urlaubsantrag erstellen
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { employeeId, startDate, endDate, reason, firebaseId, status } = body

        // Validierung
        if (!employeeId) {
            return NextResponse.json({ error: "Mitarbeiter-ID ist erforderlich" }, { status: 400 })
        }

        if (!startDate || !endDate) {
            return NextResponse.json({ error: "Start- und Enddatum sind erforderlich" }, { status: 400 })
        }

        const start = new Date(startDate)
        const end = new Date(endDate)

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return NextResponse.json({ error: "Ungueltiges Datumsformat" }, { status: 400 })
        }

        if (start > end) {
            return NextResponse.json({ error: "Startdatum muss vor Enddatum liegen" }, { status: 400 })
        }

        // Pruefen ob Mitarbeiter existiert
        const employee = await prisma.user.findUnique({
            where: { id: employeeId }
        })

        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
        }

        // Pruefen auf ueberlappende Urlaubsantraege
        const overlapping = await prisma.vacationRequest.findFirst({
            where: {
                employeeId,
                status: { not: "REJECTED" },
                OR: [
                    {
                        AND: [
                            { startDate: { lte: end } },
                            { endDate: { gte: start } }
                        ]
                    }
                ]
            }
        })

        if (overlapping) {
            return NextResponse.json(
                { error: "Es existiert bereits ein Urlaubsantrag fuer diesen Zeitraum" },
                { status: 400 }
            )
        }

        // Urlaubsantrag erstellen
        const vacationRequest = await prisma.vacationRequest.create({
            data: {
                employeeId,
                startDate: start,
                endDate: end,
                reason: reason || null,
                firebaseId: firebaseId || null,
                status: status || "PENDING"
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true
                    }
                }
            }
        })

        const days = calculateVacationDays(start, end)

        return NextResponse.json({
            vacationRequest: {
                ...vacationRequest,
                days
            }
        })
    } catch (error: any) {
        console.error("[POST /api/admin/vacations] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
