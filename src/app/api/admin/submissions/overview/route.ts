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
        // 1. Alle aktiven Klienten mit ihren Mitarbeitern laden
        const clients = await prisma.client.findMany({
            where: { isActive: true },
            include: {
                employees: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: [
                { displayOrder: "asc" },
                { lastName: "asc" },
                { firstName: "asc" }
            ]
        })

        // 2. Alle Timesheets für den Monat laden (inkl. PLANNED)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
            },
            select: {
                id: true,
                employeeId: true,
                date: true,
                plannedStart: true,
                plannedEnd: true,
                actualStart: true,
                actualEnd: true,
                breakMinutes: true,
                status: true,
                absenceType: true
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

        // 4. Timesheets nach Employee gruppieren
        const timesheetsByEmployee = new Map<string, typeof timesheets>()
        for (const ts of timesheets) {
            const existing = timesheetsByEmployee.get(ts.employeeId) || []
            existing.push(ts)
            timesheetsByEmployee.set(ts.employeeId, existing)
        }

        // 5. Submissions nach ClientId gruppieren
        const submissionsByClient = new Map<string, typeof submissions[0]>()
        for (const sub of submissions) {
            if (sub.clientId) {
                submissionsByClient.set(sub.clientId, sub)
            }
        }

        // 6. Daten für jeden Klienten aufbereiten
        const clientsWithData = clients.map(client => {
            const submission = submissionsByClient.get(client.id)

            const employeesWithData = client.employees.map(emp => {
                const empTimesheets = timesheetsByEmployee.get(emp.id) || []

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
                    timesheetCount: empTimesheets.length
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
