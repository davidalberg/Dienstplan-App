import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { calculateMinutesBetween } from "@/lib/time-utils"

// GET - Stundennachweise gruppiert nach Klienten
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))

    try {
        // 1. Alle aktiven Klienten mit ihren Teams laden
        const clients = await prisma.client.findMany({
            where: { isActive: true },
            include: {
                // Many-to-Many: Direkt zugeordnete Mitarbeiter
                employees: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                // Teams die diesem Klienten zugeordnet sind
                teams: {
                    select: {
                        id: true,
                        name: true,
                        members: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { displayOrder: "asc" },
                { lastName: "asc" },
                { firstName: "asc" }
            ]
        })

        // 2. Alle Timesheets für den Monat laden (inkl. PLANNED) - MIT Team- und Employee-Relation
        const timesheets = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
            },
            select: {
                id: true,
                employeeId: true,
                teamId: true,
                date: true,
                plannedStart: true,
                plannedEnd: true,
                actualStart: true,
                actualEnd: true,
                breakMinutes: true,
                status: true,
                absenceType: true,
                // Team mit Client-Zuordnung laden
                team: {
                    select: {
                        id: true,
                        clientId: true
                    }
                },
                // Employee-Daten für Mitarbeiter die nur über Timesheets zugeordnet sind
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        })

        // 3. Alle TeamSubmissions für den Monat laden
        const submissions = await prisma.teamSubmission.findMany({
            where: {
                month,
                year
            },
            include: {
                employeeSignatures: {
                    select: {
                        employeeId: true,
                        signedAt: true
                    }
                }
            }
        })

        // 4. Mapping: Employee -> Clients (via Many-to-Many Relation)
        // Fuer Timesheets ohne Team-Zuordnung brauchen wir diese Info
        const clientsByEmployee = new Map<string, string[]>()
        for (const client of clients) {
            for (const emp of client.employees) {
                const existing = clientsByEmployee.get(emp.id) || []
                existing.push(client.id)
                clientsByEmployee.set(emp.id, existing)
            }
            for (const team of client.teams) {
                for (const member of team.members) {
                    const existing = clientsByEmployee.get(member.id) || []
                    if (!existing.includes(client.id)) {
                        existing.push(client.id)
                        clientsByEmployee.set(member.id, existing)
                    }
                }
            }
        }

        // 5. Timesheets nach Employee UND Client gruppieren (Key: "employeeId:clientId")
        // Ein Timesheet gehört zu einem Client über:
        //   A) Timesheet.teamId -> Team.clientId (direkte Team-Zuordnung)
        //   B) Timesheet.employeeId -> User.clients (Many-to-Many, wenn kein Team)
        const timesheetsByEmployeeAndClient = new Map<string, typeof timesheets>()
        for (const ts of timesheets) {
            // A) ClientId aus Team-Relation
            const teamClientId = ts.team?.clientId
            if (teamClientId) {
                const key = `${ts.employeeId}:${teamClientId}`
                const existing = timesheetsByEmployeeAndClient.get(key) || []
                existing.push(ts)
                timesheetsByEmployeeAndClient.set(key, existing)
            } else {
                // B) Kein Team -> Clients aus Many-to-Many Relation des Employees
                const employeeClientIds = clientsByEmployee.get(ts.employeeId) || []
                for (const clientId of employeeClientIds) {
                    const key = `${ts.employeeId}:${clientId}`
                    const existing = timesheetsByEmployeeAndClient.get(key) || []
                    existing.push(ts)
                    timesheetsByEmployeeAndClient.set(key, existing)
                }
            }
        }

        // 6. Submissions nach ClientId gruppieren
        const submissionsByClient = new Map<string, typeof submissions[0]>()
        for (const sub of submissions) {
            if (sub.clientId) {
                submissionsByClient.set(sub.clientId, sub)
            }
        }

        // 7. Daten für jeden Klienten aufbereiten
        const clientsWithData = clients.map(client => {
            const submission = submissionsByClient.get(client.id)

            // Mitarbeiter sammeln: aus Many-to-Many UND aus Teams
            const employeeMap = new Map<string, { id: string; name: string | null; email: string }>()

            // 1. Direkt zugeordnete Mitarbeiter (Many-to-Many)
            for (const emp of client.employees) {
                employeeMap.set(emp.id, emp)
            }

            // 2. Mitarbeiter aus Teams
            for (const team of client.teams) {
                for (const member of team.members) {
                    if (!employeeMap.has(member.id)) {
                        employeeMap.set(member.id, member)
                    }
                }
            }

            // 3. Mitarbeiter die Timesheets für diesen Client haben (über Team)
            for (const ts of timesheets) {
                if (ts.team?.clientId === client.id && ts.employee) {
                    // Dieser Timesheet gehört zu diesem Client
                    if (!employeeMap.has(ts.employeeId)) {
                        employeeMap.set(ts.employeeId, {
                            id: ts.employee.id,
                            name: ts.employee.name,
                            email: ts.employee.email
                        })
                    }
                }
            }

            const employeesWithData = Array.from(employeeMap.values()).map(emp => {
                // Timesheets für diesen Mitarbeiter UND diesen Client
                const key = `${emp.id}:${client.id}`
                const empTimesheets = timesheetsByEmployeeAndClient.get(key) || []

                // Stunden berechnen
                let totalMinutes = 0
                let lastActivityDate: Date | null = null

                for (const ts of empTimesheets) {
                    const start = ts.actualStart || ts.plannedStart
                    const end = ts.actualEnd || ts.plannedEnd

                    if (start && end && !ts.absenceType) {
                        const minutes = calculateMinutesBetween(start, end)
                        if (minutes !== null) {
                            totalMinutes += minutes - (ts.breakMinutes || 0)
                        }
                    }

                    // Letzte Aktivität tracken
                    if (!lastActivityDate || ts.date > lastActivityDate) {
                        lastActivityDate = ts.date
                    }
                }

                // Signatur-Status prüfen
                const employeeSigned = submission?.employeeSignatures.some(
                    sig => sig.employeeId === emp.id
                ) || false

                const clientSigned = submission?.status === "COMPLETED"

                // Dominanter Timesheet-Status ermitteln (PLANNED < CONFIRMED < CHANGED < SUBMITTED)
                const statusPriority: Record<string, number> = {
                    PLANNED: 1,
                    CONFIRMED: 2,
                    CHANGED: 3,
                    SUBMITTED: 4
                }
                let dominantStatus: string | null = null
                for (const ts of empTimesheets) {
                    if (!dominantStatus || (statusPriority[ts.status] || 0) > (statusPriority[dominantStatus] || 0)) {
                        dominantStatus = ts.status
                    }
                }

                return {
                    id: emp.id,
                    name: emp.name,
                    email: emp.email,
                    totalHours: Math.round(totalMinutes / 60 * 10) / 10, // Eine Dezimalstelle
                    totalMinutes,
                    employeeSigned,
                    clientSigned,
                    submissionId: submission?.id || null,
                    submissionStatus: submission?.status || null,
                    lastActivity: lastActivityDate?.toISOString().split("T")[0] || null,
                    timesheetCount: empTimesheets.length,
                    timesheetStatus: dominantStatus
                }
            })

            // Nur Mitarbeiter mit Stunden oder Timesheets anzeigen
            const activeEmployees = employeesWithData.filter(
                emp => emp.timesheetCount > 0 || emp.totalMinutes > 0
            )

            return {
                id: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                email: client.email,
                displayOrder: client.displayOrder,
                submissionId: submission?.id || null,
                submissionStatus: submission?.status || null,
                employees: activeEmployees,
                // Aggregierte Werte für den Klienten
                totalEmployees: activeEmployees.length,
                allEmployeesSigned: activeEmployees.length > 0 &&
                    activeEmployees.every(emp => emp.employeeSigned),
                clientSigned: submission?.status === "COMPLETED"
            }
        })

        // Nur Klienten mit aktiven Mitarbeitern (die Stunden haben)
        const activeClients = clientsWithData.filter(c => c.employees.length > 0)

        return NextResponse.json({
            clients: activeClients,
            month,
            year
        })
    } catch (error: any) {
        console.error("[GET /api/admin/submissions/overview] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
