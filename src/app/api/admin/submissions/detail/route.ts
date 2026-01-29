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

    if (!employeeId || !clientId || isNaN(month) || isNaN(year)) {
        return NextResponse.json({
            error: "employeeId, clientId, month und year sind erforderlich"
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

        // Klient laden
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
            }
        })

        if (!client) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        // Timesheets für diesen Mitarbeiter im Monat laden (inkl. PLANNED)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId,
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
            },
            orderBy: { date: "asc" },
            select: {
                id: true,
                date: true,
                plannedStart: true,
                plannedEnd: true,
                actualStart: true,
                actualEnd: true,
                breakMinutes: true,
                note: true,
                status: true,
                absenceType: true
            }
        })

        // TeamSubmission für diesen Klienten suchen
        const submission = await prisma.teamSubmission.findFirst({
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

        // Stunden berechnen
        let totalMinutes = 0
        let sickDays = 0
        let vacationDays = 0

        const timesheetsWithHours = timesheets.map(ts => {
            const start = ts.actualStart || ts.plannedStart
            const end = ts.actualEnd || ts.plannedEnd
            let hours = 0

            if (start && end && !ts.absenceType) {
                const minutes = calculateMinutesBetween(start, end)
                if (minutes !== null) {
                    const netMinutes = minutes - (ts.breakMinutes || 0)
                    totalMinutes += netMinutes
                    hours = Math.round(netMinutes / 60 * 10) / 10
                }
            }

            if (ts.absenceType === "SICK") sickDays++
            if (ts.absenceType === "VACATION") vacationDays++

            // Typ bestimmen (für die PDF-Spalte)
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
                type,
                weekday: new Date(ts.date).toLocaleDateString("de-DE", { weekday: "short" }),
                formattedDate: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
            }
        })

        // Signatur-Status
        const employeeSigned = submission?.employeeSignatures && submission.employeeSignatures.length > 0
        const employeeSignature = submission?.employeeSignatures?.[0] || null
        const clientSigned = submission?.status === "COMPLETED"

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
                totalHours: Math.round(totalMinutes / 60 * 10) / 10,
                totalMinutes,
                sickDays,
                vacationDays,
                workDays: timesheets.filter(ts => !ts.absenceType).length
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
