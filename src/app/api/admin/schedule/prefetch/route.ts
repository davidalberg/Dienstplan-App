import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { calculateMinutesBetween } from "@/lib/time-utils"
import { ALL_TIMESHEET_STATUSES } from "@/lib/constants"

/**
 * GET /api/admin/schedule/prefetch
 *
 * Lädt ALLE Stundennachweise für ALLE Mitarbeiter eines Monats in EINEM Request.
 * Skalierbar für 200+ Mitarbeiter - nur 1 API-Call statt 200.
 *
 * Response: Map von "employeeId-clientId" -> DetailData
 */
export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "", 10)
    const year = parseInt(searchParams.get("year") || "", 10)

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({
            error: "month und year sind erforderlich"
        }, { status: 400 })
    }

    try {
        // 1. Alle relevanten Daten in parallelen Queries laden
        const [employees, clients, allTimesheets, allSubmissions] = await Promise.all([
            // Alle Mitarbeiter mit Team/Client-Zuordnung
            prisma.user.findMany({
                where: { role: "EMPLOYEE" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    team: {
                        select: {
                            id: true,
                            name: true,
                            clientId: true
                        }
                    }
                }
            }),
            // Alle Klienten
            prisma.client.findMany({
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                }
            }),
            // Alle Timesheets für diesen Monat
            prisma.timesheet.findMany({
                where: {
                    month,
                    year,
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
                },
                orderBy: { date: "asc" },
                select: {
                    id: true,
                    employeeId: true,
                    date: true,
                    plannedStart: true,
                    plannedEnd: true,
                    actualStart: true,
                    actualEnd: true,
                    note: true,
                    status: true,
                    absenceType: true,
                    sheetFileName: true,
                    team: {
                        select: {
                            clientId: true
                        }
                    }
                }
            }),
            // Alle TeamSubmissions für diesen Monat mit Signaturen
            prisma.teamSubmission.findMany({
                where: { month, year },
                include: {
                    employeeSignatures: {
                        select: {
                            employeeId: true,
                            signature: true,
                            signedAt: true
                        }
                    }
                }
            })
        ])

        // 2. Lookup-Maps erstellen für O(1) Zugriff
        const employeeMap = new Map(employees.map(e => [e.id, e]))
        const clientMap = new Map(clients.map(c => [c.id, c]))
        const submissionByClientId = new Map(allSubmissions.map(s => [s.clientId, s]))

        // 3. Timesheets nach employeeId gruppieren
        const timesheetsByEmployee = new Map<string, typeof allTimesheets>()
        for (const ts of allTimesheets) {
            const existing = timesheetsByEmployee.get(ts.employeeId) || []
            existing.push(ts)
            timesheetsByEmployee.set(ts.employeeId, existing)
        }

        // 4. Für jeden Employee mit Timesheets die Detail-Daten berechnen
        const detailsMap: Record<string, any> = {}

        for (const [employeeId, timesheets] of timesheetsByEmployee) {
            const employee = employeeMap.get(employeeId)
            if (!employee) continue

            // ClientId aus Team oder Timesheet ermitteln
            const clientId = employee.team?.clientId || timesheets[0]?.team?.clientId
            if (!clientId) continue

            const client = clientMap.get(clientId)
            if (!client) continue

            const key = `${employeeId}-${clientId}`

            // Submission für diesen Client finden
            const submission = submissionByClientId.get(clientId)
            const employeeSignature = submission?.employeeSignatures?.find(
                sig => sig.employeeId === employeeId
            )

            // Stunden berechnen
            let totalMinutes = 0
            let plannedMinutes = 0
            let sickDays = 0
            let vacationDays = 0

            const timesheetsWithHours = timesheets.map(ts => {
                let hours = 0
                let plannedHoursForEntry = 0
                const isConfirmed = ts.status !== "PLANNED"

                // Geplante Stunden
                if (ts.plannedStart && ts.plannedEnd && !ts.absenceType) {
                    const minutes = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                    if (minutes !== null) {
                        plannedMinutes += minutes
                        plannedHoursForEntry = Math.round(minutes / 60 * 10) / 10
                    }
                }

                // Tatsächliche Stunden (nur CONFIRMED+)
                if (!ts.absenceType && isConfirmed) {
                    const start = ts.actualStart || ts.plannedStart
                    const end = ts.actualEnd || ts.plannedEnd
                    if (start && end) {
                        const minutes = calculateMinutesBetween(start, end)
                        if (minutes !== null) {
                            totalMinutes += minutes
                            hours = Math.round(minutes / 60 * 10) / 10
                        }
                    }
                }

                if (ts.absenceType === "SICK") sickDays++
                if (ts.absenceType === "VACATION") vacationDays++

                // Typ bestimmen
                let type = ""
                if (ts.absenceType === "SICK") type = "K"
                else if (ts.absenceType === "VACATION") type = "U"
                else if (ts.status === "PLANNED") type = "G"
                else if (ts.note?.includes("Feiertag")) type = "F"
                else if (ts.note?.includes("Fahrt")) type = "FZ"
                else if (ts.note?.includes("Bereitschaft")) type = "BD"
                else if (ts.note?.includes("Büro")) type = "B"

                return {
                    id: ts.id,
                    date: ts.date,
                    plannedStart: ts.plannedStart,
                    plannedEnd: ts.plannedEnd,
                    actualStart: ts.actualStart,
                    actualEnd: ts.actualEnd,
                    note: ts.note,
                    status: ts.status,
                    absenceType: ts.absenceType,
                    hours,
                    plannedHours: plannedHoursForEntry,
                    type,
                    weekday: new Date(ts.date).toLocaleDateString("de-DE", { weekday: "short" }),
                    formattedDate: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
                }
            })

            const employeeSigned = !!employeeSignature?.signature
            const clientSigned = !!submission?.recipientSignature

            detailsMap[key] = {
                employee: {
                    id: employee.id,
                    name: employee.name,
                    email: employee.email
                },
                client: {
                    id: client.id,
                    firstName: client.firstName,
                    lastName: client.lastName,
                    email: client.email,
                    fullName: `${client.firstName} ${client.lastName}`
                },
                month,
                year,
                timesheets: timesheetsWithHours,
                stats: {
                    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
                    plannedHours: Math.round(plannedMinutes / 60 * 10) / 10,
                    totalMinutes,
                    plannedMinutes,
                    sickDays,
                    vacationDays,
                    workDays: timesheets.filter(ts => !ts.absenceType).length,
                    confirmedDays: timesheets.filter(ts => !ts.absenceType && ts.status !== "PLANNED").length
                },
                submission: submission ? {
                    id: submission.id,
                    status: submission.status,
                    signatureToken: submission.signatureToken,
                    recipientSignedAt: submission.recipientSignedAt
                } : null,
                signatures: {
                    employee: {
                        signed: employeeSigned,
                        signedAt: employeeSignature?.signedAt || null,
                        signature: employeeSignature?.signature || null
                    },
                    client: {
                        signed: clientSigned,
                        signedAt: submission?.recipientSignedAt || null,
                        signature: submission?.recipientSignature || null
                    }
                }
            }
        }

        return NextResponse.json({
            details: detailsMap,
            count: Object.keys(detailsMap).length,
            month,
            year
        })

    } catch (error: any) {
        console.error("[GET /api/admin/schedule/prefetch] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
