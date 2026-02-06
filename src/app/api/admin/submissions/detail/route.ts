import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { calculateMinutesBetween } from "@/lib/time-utils"

// GET - Detail-Daten für einen Stundennachweis (Mitarbeiter + Klient + Monat)
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")
    const clientId = searchParams.get("clientId")
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

    if (!employeeId || isNaN(month) || isNaN(year)) {
        return NextResponse.json({
            error: "employeeId, month und year sind erforderlich"
        }, { status: 400 })
    }

    try {
        // Mitarbeiter laden
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: {
                id: true,
                name: true,
                email: true
            }
        })

        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
        }

        // sheetFileName aus Timesheet ermitteln (fuer TeamSubmission-Lookup)
        const userTimesheet = await prisma.timesheet.findFirst({
            where: {
                employeeId,
                month,
                year,
                OR: [
                    { sheetFileName: { not: null } },
                    { teamId: { not: null } }
                ]
            },
            select: {
                sheetFileName: true,
                team: {
                    select: {
                        name: true,
                        client: {
                            select: { id: true, firstName: true, lastName: true, email: true }
                        }
                    }
                }
            }
        })

        // Generiere sheetFileName falls nicht vorhanden (Legacy-Support)
        let sheetFileName = userTimesheet?.sheetFileName
        if (!sheetFileName && userTimesheet?.team) {
            sheetFileName = `Team_${userTimesheet.team.name.replace(/\s+/g, '_')}_${year}`
        }

        // Klient laden - clientId ist jetzt optional, wird aus Team-Relation aufgeloest
        let resolvedClientId = clientId
        if (!resolvedClientId && userTimesheet?.team?.client) {
            resolvedClientId = userTimesheet.team.client.id
        }

        let client = null
        if (resolvedClientId) {
            client = await prisma.client.findUnique({
                where: { id: resolvedClientId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                }
            })
        }

        // Fallback: Client aus Team-Relation wenn DB-Lookup fehlschlaegt
        if (!client && userTimesheet?.team?.client) {
            client = userTimesheet.team.client
        }

        if (!client) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        // Timesheets für diesen Mitarbeiter im Monat laden (inkl. PLANNED)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId,
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
            },
            orderBy: { date: "asc" },
            select: {
                id: true,
                date: true,
                plannedStart: true,
                plannedEnd: true,
                actualStart: true,
                actualEnd: true,
                note: true,
                status: true,
                absenceType: true
            }
        })

        // TeamSubmission suchen - versuche zuerst ueber sheetFileName, dann ueber clientId
        let submission = sheetFileName ? await prisma.teamSubmission.findUnique({
            where: {
                sheetFileName_month_year: {
                    sheetFileName,
                    month,
                    year
                }
            },
            include: {
                employeeSignatures: {
                    where: { employeeId },
                    select: {
                        id: true,
                        signature: true,
                        signedAt: true
                    }
                }
            }
        }) : null

        // Fallback: Suche ueber clientId wenn sheetFileName-Suche fehlschlaegt
        if (!submission) {
            submission = await prisma.teamSubmission.findFirst({
                where: {
                    clientId,
                    month,
                    year
                },
                include: {
                    employeeSignatures: {
                        where: { employeeId },
                        select: {
                            id: true,
                            signature: true,
                            signedAt: true
                        }
                    }
                }
            })
        }

        // Stunden berechnen
        let totalMinutes = 0      // Tatsaechlich geleistete Stunden (nur CONFIRMED+)
        let plannedMinutes = 0    // Geplante Stunden (alle Schichten)
        let sickDays = 0
        let vacationDays = 0

        const timesheetsWithHours = timesheets.map(ts => {
            let hours = 0
            let plannedHoursForEntry = 0

            // Determine if this timesheet is CONFIRMED (not just PLANNED)
            // Only CONFIRMED, CHANGED, SUBMITTED, COMPLETED count as "actually worked"
            const isConfirmed = ts.status !== "PLANNED"

            // Calculate PLANNED hours for this entry (always, regardless of status)
            if (ts.plannedStart && ts.plannedEnd && !ts.absenceType) {
                const minutes = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                if (minutes !== null) {
                    plannedMinutes += minutes
                    plannedHoursForEntry = Math.round(minutes / 60 * 10) / 10
                }
            }

            // Calculate ACTUAL hours only for CONFIRMED entries (not PLANNED)
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

            // Typ bestimmen (fuer die PDF-Spalte)
            let type = ""
            if (ts.absenceType === "SICK") type = "K" // Krank
            else if (ts.absenceType === "VACATION") type = "U" // Urlaub
            else if (ts.status === "PLANNED") type = "G" // Geplant
            else if (ts.note?.includes("Feiertag")) type = "F"
            else if (ts.note?.includes("Fahrt")) type = "FZ"
            else if (ts.note?.includes("Bereitschaft")) type = "BD"
            else if (ts.note?.includes("Büro")) type = "B"

            return {
                ...ts,
                hours,
                plannedHours: plannedHoursForEntry,
                type,
                weekday: new Date(ts.date).toLocaleDateString("de-DE", { weekday: "short" }),
                formattedDate: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
            }
        })

        // Signatur-Status - pruefe ob Signatur tatsaechlich vorhanden ist (nicht nur Eintrag)
        const employeeSignature = submission?.employeeSignatures?.[0] || null
        const employeeSigned = !!employeeSignature?.signature // Signatur-Daten muessen vorhanden sein
        const clientSigned = !!submission?.recipientSignature

        return NextResponse.json({
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
                totalHours: Math.round(totalMinutes / 60 * 10) / 10,        // Tatsaechlich geleistet (nur CONFIRMED+)
                plannedHours: Math.round(plannedMinutes / 60 * 10) / 10,    // Geplante Stunden (alle)
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
        })
    } catch (error: any) {
        console.error("[GET /api/admin/submissions/detail] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
