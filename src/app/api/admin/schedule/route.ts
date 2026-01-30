import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

// Hilfsfunktion: Zod-Fehler in lesbare Meldung umwandeln
function formatZodError(error: z.ZodError<unknown>): string {
    const messages = error.issues.map((issue: z.ZodIssue) => {
        const path = issue.path.join(".")
        return path ? `${path}: ${issue.message}` : issue.message
    })
    return messages.join(", ")
}

// Schema für neue Schicht mit verbesserter Validierung
const createShiftSchema = z.object({
    employeeId: z.string().min(1, "Mitarbeiter-ID ist erforderlich"),
    date: z.string()
        .min(1, "Datum ist erforderlich")
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein"),
    plannedStart: z.string()
        .min(1, "Startzeit ist erforderlich")
        .regex(/^\d{2}:\d{2}$/, "Startzeit muss im Format HH:MM sein"),
    plannedEnd: z.string()
        .min(1, "Endzeit ist erforderlich")
        .regex(/^\d{2}:\d{2}$/, "Endzeit muss im Format HH:MM sein"),
    backupEmployeeId: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    teamId: z.string().optional().nullable(),
})

// Schema für Schicht-Update
const updateShiftSchema = z.object({
    id: z.string().min(1, "Schicht-ID ist erforderlich"),
    plannedStart: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat").optional(),
    plannedEnd: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat").optional(),
    backupEmployeeId: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
})

// Schema für Bulk-Erstellung (Wiederholung)
const bulkCreateSchema = z.object({
    employeeId: z.string().min(1, "Mitarbeiter-ID ist erforderlich"),
    startDate: z.string()
        .min(1, "Startdatum ist erforderlich")
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum muss im Format YYYY-MM-DD sein"),
    endDate: z.string()
        .min(1, "Enddatum ist erforderlich")
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Enddatum muss im Format YYYY-MM-DD sein"),
    plannedStart: z.string()
        .min(1, "Startzeit ist erforderlich")
        .regex(/^\d{2}:\d{2}$/, "Startzeit muss im Format HH:MM sein"),
    plannedEnd: z.string()
        .min(1, "Endzeit ist erforderlich")
        .regex(/^\d{2}:\d{2}$/, "Endzeit muss im Format HH:MM sein"),
    backupEmployeeId: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    teamId: z.string().optional().nullable(),
    repeatDays: z.array(z.number().min(0).max(6)).min(1, "Mindestens ein Wochentag muss ausgewählt sein"),
})

// GET - Alle Schichten für einen Zeitraum
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")
    const teamId = searchParams.get("teamId") || undefined

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Month and year required" }, { status: 400 })
    }

    try {
        const where: any = { month, year }
        if (teamId) {
            where.teamId = teamId
        }

        // Parallele Abfragen für bessere Performance
        const [employees, rawShifts, teams] = await Promise.all([
            prisma.user.findMany({
                where: { role: "EMPLOYEE" },
                select: { id: true, name: true, email: true, teamId: true },
                orderBy: { name: "asc" }
            }),
            prisma.timesheet.findMany({
                where,
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            team: {
                                select: {
                                    id: true,
                                    name: true,
                                    client: {
                                        select: {
                                            id: true,
                                            firstName: true,
                                            lastName: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: [{ date: "asc" }, { plannedStart: "asc" }]
            }),
            prisma.team.findMany({
                where: {
                    members: {
                        some: {}  // Mindestens 1 Mitglied
                    }
                },
                select: {
                    id: true,
                    name: true,
                    _count: {
                        select: { members: true }
                    }
                },
                orderBy: { name: "asc" }
            })
        ])

        // Map für schnelle Mitarbeiter-Lookup
        const employeeMap = new Map(employees.map(e => [e.id, e]))

        // Backup-Employee-Namen hinzufügen
        const shifts = rawShifts.map(shift => ({
            ...shift,
            backupEmployee: shift.backupEmployeeId
                ? employeeMap.get(shift.backupEmployeeId) || null
                : null
        }))

        return NextResponse.json({ shifts, employees, teams })
    } catch (error: any) {
        console.error("[GET /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Neue Schicht erstellen
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        let body: unknown
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 })
        }

        // Grundlegende Typprüfung
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Request-Body muss ein Objekt sein" }, { status: 400 })
        }

        // Prüfe ob es eine Bulk-Operation ist
        if ((body as Record<string, unknown>).bulk) {
            const validated = bulkCreateSchema.safeParse(body)
            if (!validated.success) {
                return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
            }

            const { employeeId, startDate, endDate, plannedStart, plannedEnd, backupEmployeeId, note, teamId, repeatDays } = validated.data

            // Lade Mitarbeiter + Team für sheetFileName
            const employee = await prisma.user.findUnique({
                where: { id: employeeId },
                select: {
                    id: true,
                    team: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            })

            if (!employee) {
                return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 400 })
            }

            // Generiere alle Daten zwischen Start und Ende
            const start = new Date(startDate)
            const end = new Date(endDate)
            const createdShifts = []

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay()

                // Nur an ausgewählten Wochentagen erstellen
                if (!repeatDays.includes(dayOfWeek)) continue

                const dateStr = d.toISOString().split('T')[0]
                const month = d.getMonth() + 1
                const year = d.getFullYear()

                // Prüfe ob bereits eine Schicht existiert
                const existing = await prisma.timesheet.findUnique({
                    where: {
                        employeeId_date: { employeeId, date: new Date(dateStr) }
                    }
                })

                if (existing) continue // Überspringe existierende

                // Generiere sheetFileName für diese Schicht
                const sheetFileName = employee.team
                    ? `Team_${employee.team.name.replace(/\s+/g, '_')}_${year}`
                    : null

                const shift = await prisma.timesheet.create({
                    data: {
                        employeeId,
                        date: new Date(dateStr),
                        month,
                        year,
                        plannedStart,
                        plannedEnd,
                        backupEmployeeId: backupEmployeeId || null,
                        note: note || null,
                        teamId: employee.team?.id || null,
                        sheetFileName,
                        status: "PLANNED",
                        source: "APP",
                        syncVerified: true
                    }
                })
                createdShifts.push(shift)
            }

            return NextResponse.json({
                created: createdShifts.length,
                shifts: createdShifts
            })
        }

        // Einzelne Schicht erstellen
        const validated = createShiftSchema.safeParse(body)
        if (!validated.success) {
            return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
        }

        const { employeeId, date, plannedStart, plannedEnd, backupEmployeeId, note, teamId } = validated.data

        // Robustes Date-Parsing
        const dateObj = new Date(date + "T00:00:00Z")
        if (isNaN(dateObj.getTime())) {
            return NextResponse.json({ error: "Ungültiges Datumsformat" }, { status: 400 })
        }

        const month = dateObj.getUTCMonth() + 1
        const year = dateObj.getUTCFullYear()

        // Prüfe, ob der Mitarbeiter existiert UND lade Team-Info für sheetFileName
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: {
                id: true,
                team: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        })
        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 400 })
        }

        // Generiere sheetFileName (CRITICAL für Submission-System!)
        const sheetFileName = employee.team
            ? `Team_${employee.team.name.replace(/\s+/g, '_')}_${year}`
            : null

        // Prüfe ob bereits eine Schicht existiert
        const existing = await prisma.timesheet.findUnique({
            where: {
                employeeId_date: { employeeId, date: dateObj }
            }
        })

        if (existing) {
            return NextResponse.json({ error: "Schicht existiert bereits für diesen Tag" }, { status: 400 })
        }

        const rawShift = await prisma.timesheet.create({
            data: {
                employeeId,
                date: dateObj,
                month,
                year,
                plannedStart,
                plannedEnd,
                backupEmployeeId: backupEmployeeId || null,
                note: note || null,
                teamId: employee.team?.id || null,
                sheetFileName,  // 🆕 CRITICAL FIX: sheetFileName setzen!
                status: "PLANNED",
                source: "APP",
                syncVerified: true
            },
            include: {
                employee: { select: { id: true, name: true } }
            }
        })

        // Backup-Employee-Info separat laden
        let backupEmployee = null
        if (backupEmployeeId) {
            const backup = await prisma.user.findUnique({
                where: { id: backupEmployeeId },
                select: { id: true, name: true }
            })
            backupEmployee = backup
        }

        return NextResponse.json({ ...rawShift, backupEmployee })
    } catch (error: any) {
        console.error("[POST /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Schicht bearbeiten
export async function PUT(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        let body: unknown
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 })
        }

        const validated = updateShiftSchema.safeParse(body)

        if (!validated.success) {
            return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
        }

        const { id, ...updateData } = validated.data

        // Entferne undefined Werte
        const cleanData = Object.fromEntries(
            Object.entries(updateData).filter(([_, v]) => v !== undefined)
        )

        const rawShift = await prisma.timesheet.update({
            where: { id },
            data: cleanData,
            include: {
                employee: { select: { id: true, name: true } }
            }
        })

        // Backup-Employee-Info separat laden
        let backupEmployee = null
        if (rawShift.backupEmployeeId) {
            const backup = await prisma.user.findUnique({
                where: { id: rawShift.backupEmployeeId },
                select: { id: true, name: true }
            })
            backupEmployee = backup
        }

        return NextResponse.json({ ...rawShift, backupEmployee })
    } catch (error: any) {
        console.error("[PUT /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE - Schicht löschen
export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 })
    }

    try {
        // 1. Fetch timesheet info BEFORE deleting (for cleanup check)
        const timesheet = await prisma.timesheet.findUnique({
            where: { id },
            select: { sheetFileName: true, month: true, year: true }
        })

        if (!timesheet) {
            return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 })
        }

        // 2. Delete the timesheet
        await prisma.timesheet.delete({
            where: { id }
        })

        // 3. CLEANUP: Check if this was the last timesheet for this submission
        if (timesheet.sheetFileName) {
            const remainingCount = await prisma.timesheet.count({
                where: {
                    sheetFileName: timesheet.sheetFileName,
                    month: timesheet.month,
                    year: timesheet.year
                }
            })

            if (remainingCount === 0) {
                // Last timesheet deleted → Delete orphaned TeamSubmission
                console.log(`[DELETE /api/admin/schedule] CLEANUP: Deleting orphaned TeamSubmission for ${timesheet.sheetFileName} ${timesheet.month}/${timesheet.year}`)
                await prisma.teamSubmission.delete({
                    where: {
                        sheetFileName_month_year: {
                            sheetFileName: timesheet.sheetFileName,
                            month: timesheet.month,
                            year: timesheet.year
                        }
                    }
                }).catch((err) => {
                    // Submission might not exist (not yet submitted) - ignore error
                    console.log("[DELETE /api/admin/schedule] No submission to delete (not yet submitted)")
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[DELETE /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
