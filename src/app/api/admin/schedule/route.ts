import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { logActivity } from "@/lib/activity-logger"

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
    absenceType: z.enum(["SICK", "VACATION"]).optional().nullable(),
}).refine(data => data.plannedStart !== data.plannedEnd, {
    message: "Start- und Endzeit dürfen nicht identisch sein"
})

// Schema für Schicht-Update
const updateShiftSchema = z.object({
    id: z.string().min(1, "Schicht-ID ist erforderlich"),
    plannedStart: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat").optional(),
    plannedEnd: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat").optional(),
    backupEmployeeId: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    absenceType: z.enum(["SICK", "VACATION"]).optional().nullable(),
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
    absenceType: z.enum(["SICK", "VACATION"]).optional().nullable(),
}).refine(data => data.plannedStart !== data.plannedEnd, {
    message: "Start- und Endzeit dürfen nicht identisch sein"
})

// GET - Alle Schichten für einen Zeitraum

export const maxDuration = 25
export async function GET(req: NextRequest) {
    const startTime = performance.now()

    const result = await requireAdmin()
    if (result instanceof NextResponse) return result

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "", 10)
    const year = parseInt(searchParams.get("year") || "", 10)
    const teamId = searchParams.get("teamId") || undefined

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2020 || year > 2100) {
        return NextResponse.json({ error: "Month and year required" }, { status: 400 })
    }

    try {
        const where: Prisma.TimesheetWhereInput = { month, year }
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
            // OPTIMIZED: Using select instead of include for better performance
            prisma.timesheet.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    plannedStart: true,
                    plannedEnd: true,
                    actualStart: true,
                    actualEnd: true,
                    breakMinutes: true,
                    note: true,
                    absenceType: true,
                    status: true,
                    employeeId: true,
                    teamId: true,
                    month: true,
                    year: true,
                    backupEmployeeId: true,
                    sheetFileName: true,
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            teamId: true
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
                    clientId: true,
                    client: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    _count: {
                        select: { members: true }
                    }
                },
                orderBy: { name: "asc" }
            })
        ])

        // Map für schnelle Mitarbeiter-Lookup
        const employeeMap = new Map(employees.map(e => [e.id, e]))

        // Map für schnelle Team-Lookup (für client info)
        const teamMap = new Map(teams.map(t => [t.id, t]))

        // Backup-Employee-Namen und Team/Client-Info hinzufügen
        const shifts = rawShifts.map(shift => {
            const team = shift.teamId ? teamMap.get(shift.teamId) : null
            return {
                ...shift,
                backupEmployee: shift.backupEmployeeId
                    ? employeeMap.get(shift.backupEmployeeId) || null
                    : null,
                // Enriched employee with team/client info from teamMap
                employee: {
                    ...shift.employee,
                    team: team ? {
                        id: team.id,
                        name: team.name,
                        client: team.client
                    } : null
                }
            }
        })

        return NextResponse.json({ shifts, employees, teams })
    } catch (error: unknown) {
        console.error("[GET /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Neue Schicht erstellen
export async function POST(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

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

            const { employeeId, startDate, endDate, plannedStart, plannedEnd, backupEmployeeId, note, teamId, repeatDays, absenceType } = validated.data

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

            // Generiere alle Kandidaten-Daten zwischen Start und Ende
            const start = new Date(startDate)
            const end = new Date(endDate)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return NextResponse.json({ error: "Ungültiges Datumsformat" }, { status: 400 })
            }
            if (end < start) {
                return NextResponse.json({ error: "Enddatum muss nach Startdatum liegen" }, { status: 400 })
            }
            const daySpan = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
            if (daySpan > 366) {
                return NextResponse.json({ error: "Zeitraum darf maximal 366 Tage umfassen" }, { status: 400 })
            }

            // Sammle alle Kandidaten-Daten, die auf einen gewählten Wochentag fallen
            const candidateDates: Date[] = []
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                if (!repeatDays.includes(d.getDay())) continue
                const dateStr = d.toISOString().split('T')[0]
                candidateDates.push(new Date(dateStr + "T00:00:00.000Z"))
            }

            if (candidateDates.length === 0) {
                return NextResponse.json({ created: 0, shifts: [] })
            }

            // BATCH: Alle existierenden Schichten für diesen Mitarbeiter im Datumsbereich laden (1 Query statt N)
            const existingShifts = await prisma.timesheet.findMany({
                where: {
                    employeeId,
                    date: { in: candidateDates }
                },
                select: { date: true }
            })

            // Set für O(1) Lookup: existierende Daten als ISO-String
            const existingDateSet = new Set(
                existingShifts.map(s => s.date.toISOString())
            )

            // Filtere Kandidaten: nur neue Daten behalten
            const newDates = candidateDates.filter(
                d => !existingDateSet.has(d.toISOString())
            )

            if (newDates.length === 0) {
                return NextResponse.json({ created: 0, shifts: [] })
            }

            // Bulk-Create Limit: max 90 Schichten pro Request
            if (newDates.length > 90) {
                return NextResponse.json({
                    error: `Maximal 90 Schichten pro Bulk-Erstellung erlaubt (${newDates.length} angefordert)`
                }, { status: 400 })
            }

            // BATCH: Alle Schichten in einem einzigen createMany-Aufruf erstellen (1 Query statt N)
            const shiftsToCreate = newDates.map(shiftDate => {
                const m = shiftDate.getUTCMonth() + 1
                const y = shiftDate.getUTCFullYear()
                const sheetFileName = employee.team
                    ? `Team_${employee.team.name.replace(/\s+/g, '_')}_${y}`
                    : null

                return {
                    employeeId,
                    date: shiftDate,
                    month: m,
                    year: y,
                    plannedStart,
                    plannedEnd,
                    backupEmployeeId: backupEmployeeId || null,
                    note: note || null,
                    teamId: employee.team?.id || null,
                    sheetFileName,
                    status: "PLANNED",
                    source: "APP",
                    syncVerified: true,
                    absenceType: absenceType || null,
                    actualStart: absenceType === "VACATION" ? plannedStart : null,
                    actualEnd: absenceType === "VACATION" ? plannedEnd : null,
                }
            })

            await prisma.timesheet.createMany({ data: shiftsToCreate })

            // Auto-create VacationRequests für VACATION-Schichten (Batch)
            if (absenceType === "VACATION" && newDates.length > 0) {
                // BATCH: Alle existierenden VacationRequests im Datumsbereich laden (1 Query statt N)
                const existingVacations = await prisma.vacationRequest.findMany({
                    where: {
                        employeeId,
                        startDate: { lte: newDates[newDates.length - 1] },
                        endDate: { gte: newDates[0] }
                    },
                    select: { startDate: true, endDate: true }
                })

                // Filtere Daten, die noch keinen VacationRequest haben
                const vacationDatesToCreate = newDates.filter(shiftDate => {
                    return !existingVacations.some(
                        v => v.startDate <= shiftDate && v.endDate >= shiftDate
                    )
                })

                if (vacationDatesToCreate.length > 0) {
                    // BATCH: Alle VacationRequests in einem createMany erstellen (1 Query statt N)
                    await prisma.vacationRequest.createMany({
                        data: vacationDatesToCreate.map(d => ({
                            employeeId,
                            startDate: d,
                            endDate: d,
                            status: "APPROVED",
                            reason: "Aus Dienstplan übernommen"
                        }))
                    })
                }
            }

            // Lade die erstellten Schichten für die Rückgabe
            const createdShifts = await prisma.timesheet.findMany({
                where: {
                    employeeId,
                    date: { in: newDates }
                },
                orderBy: { date: "asc" }
            })

            // Log activity
            await logActivity({
                type: "SUCCESS",
                category: "SHIFT",
                action: `${createdShifts.length} Schichten erstellt (Wiederholung)`,
                details: {
                    employeeId,
                    startDate,
                    endDate,
                    repeatDays,
                    count: createdShifts.length
                },
                userId: session.user.id,
                userName: session.user.name || session.user.email || "Admin",
                entityType: "Timesheet"
            })

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

        const { employeeId, date, plannedStart, plannedEnd, backupEmployeeId, note, teamId, absenceType } = validated.data

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
                syncVerified: true,
                absenceType: absenceType || null,
                // Wenn Urlaub, setze actualStart/End gleich wie planned
                actualStart: absenceType === "VACATION" ? plannedStart : null,
                actualEnd: absenceType === "VACATION" ? plannedEnd : null,
            },
            include: {
                employee: { select: { id: true, name: true } }
            }
        })

        // 🆕 Auto-create VacationRequest when absenceType is VACATION
        if (absenceType === "VACATION") {
            // Check if VacationRequest already exists for this date
            const existingVacation = await prisma.vacationRequest.findFirst({
                where: {
                    employeeId,
                    startDate: { lte: dateObj },
                    endDate: { gte: dateObj }
                }
            })

            if (!existingVacation) {
                await prisma.vacationRequest.create({
                    data: {
                        employeeId,
                        startDate: dateObj,
                        endDate: dateObj,
                        status: "APPROVED",
                        reason: "Aus Dienstplan übernommen"
                    }
                })
            }

        }

        // Backup-Employee-Info separat laden
        let backupEmployee = null
        if (backupEmployeeId) {
            const backup = await prisma.user.findUnique({
                where: { id: backupEmployeeId },
                select: { id: true, name: true }
            })
            backupEmployee = backup
        }

        // Log activity
        await logActivity({
            type: "SUCCESS",
            category: "SHIFT",
            action: `Schicht erstellt für ${rawShift.employee.name}`,
            details: {
                date,
                plannedStart,
                plannedEnd,
                absenceType: absenceType || null
            },
            userId: session.user.id,
            userName: session.user.name || session.user.email || "Admin",
            entityId: rawShift.id,
            entityType: "Timesheet"
        })

        return NextResponse.json({ ...rawShift, backupEmployee })
    } catch (error: unknown) {
        console.error("[POST /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Schicht bearbeiten
export async function PUT(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

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

        // Ensure sheetFileName exists (fix for legacy data with null sheetFileName)
        const existingShift = await prisma.timesheet.findUnique({
            where: { id },
            select: { sheetFileName: true, employeeId: true }
        })

        if (existingShift && !existingShift.sheetFileName) {
            const shiftEmployee = await prisma.user.findUnique({
                where: { id: existingShift.employeeId },
                select: {
                    team: {
                        select: { name: true }
                    }
                }
            })
            if (shiftEmployee?.team) {
                const existingDate = await prisma.timesheet.findUnique({
                    where: { id },
                    select: { year: true }
                })
                ;(cleanData as Record<string, unknown>).sheetFileName = `Team_${shiftEmployee.team.name.replace(/\s+/g, '_')}_${existingDate?.year || new Date().getFullYear()}`
            }
        }

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

        // Log activity
        await logActivity({
            type: "INFO",
            category: "SHIFT",
            action: `Schicht bearbeitet für ${rawShift.employee.name}`,
            details: cleanData,
            userId: session.user.id,
            userName: session.user.name || session.user.email || "Admin",
            entityId: rawShift.id,
            entityType: "Timesheet"
        })

        return NextResponse.json({ ...rawShift, backupEmployee })
    } catch (error: unknown) {
        console.error("[PUT /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE - Schicht löschen
export async function DELETE(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 })
    }

    try {
        // 1. Fetch timesheet info BEFORE deleting (for cleanup check + Firebase sync)
        const timesheet = await prisma.timesheet.findUnique({
            where: { id },
            select: {
                sheetFileName: true,
                month: true,
                year: true,
                date: true,
                absenceType: true,
                employeeId: true
            }
        })

        if (!timesheet) {
            return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 })
        }

        // 2. Delete the timesheet and cleanup in a transaction
        await prisma.$transaction(async (tx) => {
            // Delete the timesheet
            await tx.timesheet.delete({
                where: { id }
            })

            // 3. CLEANUP: Check if this was the last timesheet for this submission
            if (timesheet.sheetFileName) {
                const remainingCount = await tx.timesheet.count({
                    where: {
                        sheetFileName: timesheet.sheetFileName,
                        month: timesheet.month,
                        year: timesheet.year
                    }
                })

                if (remainingCount === 0) {
                    // Last timesheet deleted -> Delete orphaned TeamSubmission
                    try {
                        await tx.teamSubmission.delete({
                            where: {
                                sheetFileName_month_year: {
                                    sheetFileName: timesheet.sheetFileName,
                                    month: timesheet.month,
                                    year: timesheet.year
                                }
                            }
                        })
                    } catch {
                        // Submission might not exist (not yet submitted) - ignore error
                    }
                }
            }
        })

        // Log activity
        await logActivity({
            type: "WARNING",
            category: "SHIFT",
            action: "Schicht gelöscht",
            details: {
                date: timesheet.date,
                month: timesheet.month,
                year: timesheet.year,
                employeeId: timesheet.employeeId
            },
            userId: session.user.id,
            userName: session.user.name || session.user.email || "Admin",
            entityId: id,
            entityType: "Timesheet"
        })

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error("[DELETE /api/admin/schedule] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
