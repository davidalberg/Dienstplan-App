import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"

const TIME_FORMAT = /^\d{2}:\d{2}$/

const timesheetUpdateSchema = z.object({
    id: z.string(),
    date: z.string().optional(),
    actualStart: z.string().nullable().optional().refine(
        val => val === null || val === undefined || TIME_FORMAT.test(val),
        { message: "Ungültiges Zeitformat (erwartet HH:MM)" }
    ),
    actualEnd: z.string().nullable().optional().refine(
        val => val === null || val === undefined || TIME_FORMAT.test(val),
        { message: "Ungültiges Zeitformat (erwartet HH:MM)" }
    ),
    note: z.string().max(500).optional(),
    absenceType: z.union([
        z.enum(["SICK", "VACATION"]),
        z.literal(""),
        z.null()
    ]).optional().transform(val => val === "" ? null : val),
    action: z.enum(["CONFIRM", "UPDATE", "UNCONFIRM"]).optional(),
}).refine(data => {
    // Only validate duration when both times are provided
    if (!data.actualStart || !data.actualEnd) return true
    if (!TIME_FORMAT.test(data.actualStart) || !TIME_FORMAT.test(data.actualEnd)) return true

    const [startH, startM] = data.actualStart.split(":").map(Number)
    const [endH, endM] = data.actualEnd.split(":").map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    // Calculate duration (handle overnight shifts where end < start)
    let durationMinutes = endMinutes - startMinutes
    if (durationMinutes < 0) durationMinutes += 24 * 60

    // Duration must not exceed 24 hours
    if (durationMinutes > 24 * 60) return false

    // Duration must not be exactly 0 unless it's an absence
    if (durationMinutes === 0 && !data.absenceType) return false

    return true
}, {
    message: "Ungültige Schichtdauer",
})

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const session = authResult

        const { searchParams } = new URL(req.url)
        const getAvailableMonths = searchParams.get("getAvailableMonths") === "true"

        // If requesting available months, return distinct month/year combinations
        if (getAvailableMonths) {
        const user = session.user
        const where: Prisma.TimesheetWhereInput = {}

        if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
            // Include months where user has own shifts OR backup shifts
            where.OR = [
                { employeeId: user.id },
                { backupEmployeeId: user.id }
            ]
        } else if (user.role === "TEAMLEAD") {
            // Validate teamId from database to prevent token manipulation
            const dbUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: { teamId: true, role: true }
            })

            if (!dbUser || dbUser.role !== "TEAMLEAD" || !dbUser.teamId) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 })
            }

            where.teamId = dbUser.teamId
        }

        const timesheets = await prisma.timesheet.findMany({
            where,
            select: { month: true, year: true },
            distinct: ['month', 'year'],
            orderBy: [{ year: 'asc' }, { month: 'asc' }]  // Chronological: Feb, Mar, Apr
        })

        return NextResponse.json(timesheets)
    }

    const month = parseInt(searchParams.get("month") || "", 10)
    const year = parseInt(searchParams.get("year") || "", 10)

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    // Role based filtering
    const user = session.user

    if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
        // Kombinierte Query: Eigene Schichten + potenzielle Backup-Schichten in 1 DB-Call
        const allShifts = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                OR: [
                    { employeeId: user.id },
                    { backupEmployeeId: user.id, absenceType: null },
                ],
            },
            include: {
                team: { include: { client: true } },
                employee: { select: { name: true } }
            },
            orderBy: { date: "asc" },
        })

        // Aufteilen in eigene Schichten und Backup-Schichten
        const ownTimesheets = allShifts.filter(s => s.employeeId === user.id)
        const potentialBackupShifts = allShifts
            .filter(s => s.backupEmployeeId === user.id && s.employeeId !== user.id)
            .map(s => ({
                id: s.id,
                date: s.date,
                plannedStart: s.plannedStart,
                plannedEnd: s.plannedEnd,
                employeeName: s.employee?.name || "Unbekannt",
            }))

        return NextResponse.json({
            timesheets: ownTimesheets,
            potentialBackupShifts
        })
    } else if (user.role === "TEAMLEAD") {
        // Validate teamId from database to prevent token manipulation
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { teamId: true, role: true }
        })

        if (!dbUser || dbUser.role !== "TEAMLEAD" || !dbUser.teamId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const timesheets = await prisma.timesheet.findMany({
            where: { month, year, teamId: dbUser.teamId },
            include: { team: { include: { client: true } } },
            orderBy: { date: "asc" },
        })

        return NextResponse.json({ timesheets, potentialBackupShifts: [] })
    }

    // Fallback für unbekannte Rollen
    return NextResponse.json({ timesheets: [], potentialBackupShifts: [] })
    } catch (error: unknown) {
        console.error("[GET /api/timesheets] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const session = authResult

        const body = await req.json()
        const validated = timesheetUpdateSchema.safeParse(body)
        if (!validated.success) return NextResponse.json({ error: validated.error }, { status: 400 })

        const { id, actualStart, actualEnd, note, absenceType, action } = validated.data
        const user = session.user

    // Detaillierte Schichtdauer-Validierung (nur bei manueller Zeiteingabe, nicht bei CONFIRM/UNCONFIRM)
    if (actualStart && actualEnd && action !== "CONFIRM" && action !== "UNCONFIRM") {
        const [startH, startM] = actualStart.split(":").map(Number)
        const [endH, endM] = actualEnd.split(":").map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM

        // Dauer berechnen (Nachtschicht: Ende < Start → +24h)
        let durationMinutes = endMinutes - startMinutes
        if (durationMinutes < 0) durationMinutes += 24 * 60

        if (durationMinutes > 24 * 60) {
            return NextResponse.json(
                { error: "Schichtdauer darf maximal 24 Stunden betragen" },
                { status: 400 }
            )
        }

        if (durationMinutes === 0 && !absenceType) {
            return NextResponse.json(
                { error: "Schichtbeginn und -ende dürfen nicht identisch sein (außer bei Abwesenheit)" },
                { status: 400 }
            )
        }
    }

    const existing = await prisma.timesheet.findUnique({
        where: { id },
    })

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Authorization check: Only owner or teamlead/admin
    if (user.role === "EMPLOYEE" && existing.employeeId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // TEAMLEAD can only modify timesheets from their own team
    if (user.role === "TEAMLEAD") {
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { teamId: true, role: true }
        })

        if (!dbUser || dbUser.role !== "TEAMLEAD" || existing.teamId !== dbUser.teamId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
    }

    if (existing.status === "SUBMITTED" && user.role !== "ADMIN") {
        return NextResponse.json({ error: "Cannot modify submitted timesheet" }, { status: 403 })
    }

    // BUG-FIX: Wenn Backup-Person sich krank/Urlaub meldet → Backup-Schicht löschen
    // Die Backup-Person bekommt KEINE Krankheitsstunden für eine Schicht, die sie nur als Vertretung hatte
    if ((absenceType === "SICK" || absenceType === "VACATION") && existing.note?.includes("Backup-Schicht anfallend")) {
        // Lösche die Backup-Schicht komplett
        await prisma.timesheet.delete({
            where: { id }
        })

        return NextResponse.json({
            deleted: true,
            message: "Backup-Schicht wurde gelöscht da Vertretung selbst krank/Urlaub ist"
        })
    }

    const updateData: Prisma.TimesheetUpdateInput = {
        actualStart,
        actualEnd,
        note,
        absenceType: absenceType || null,
        lastUpdatedBy: user.email,
    }

    if (action === "CONFIRM") {
        updateData.actualStart = existing.plannedStart
        updateData.actualEnd = existing.plannedEnd
        updateData.status = "CONFIRMED"
    } else if (action === "UNCONFIRM") {
        // Reset status back to PLANNED
        updateData.actualStart = null
        updateData.actualEnd = null
        updateData.status = "PLANNED"
    } else {
        // Check if changed
        const isChanged =
            (actualStart && actualStart !== existing.plannedStart) ||
            (actualEnd && actualEnd !== existing.plannedEnd)

        updateData.status = isChanged ? "CHANGED" : "CONFIRMED"
    }

    const updated = await prisma.timesheet.update({
        where: { id },
        data: updateData,
    })

    // Automatische Backup-Einspringfunktion
    // Wenn jemand krank/Urlaub ist und es gibt einen Backup, springt dieser automatisch ein
    if ((absenceType === "SICK" || absenceType === "VACATION") && existing.backupEmployeeId) {
        try {
            // Prüfe ob Backup-Person bereits einen Eintrag für diesen Tag hat
            const backupExisting = await prisma.timesheet.findUnique({
                where: {
                    employeeId_date: {
                        employeeId: existing.backupEmployeeId,
                        date: existing.date
                    }
                }
            })

            // Hole Team-Info des Backup-Mitarbeiters
            const backupEmployee = await prisma.user.findUnique({
                where: { id: existing.backupEmployeeId },
                select: { teamId: true, name: true }
            })

            if (backupEmployee) {
                // Hole Original-Mitarbeiter-Namen für Note
                const originalEmployee = await prisma.user.findUnique({
                    where: { id: existing.employeeId },
                    select: { name: true }
                })

                // Erstelle oder aktualisiere Timesheet für Backup-Person
                // WICHTIG: Nicht automatisch bestätigen - Backup muss selbst bestätigen
                const backupData = {
                    actualStart: null, // Keine Ist-Zeiten - Mitarbeiter muss selbst bestätigen
                    actualEnd: null,
                    status: "PLANNED", // PLANNED statt CHANGED - Backup muss selbst bestätigen
                    absenceType: null, // They're working, not absent
                    note: `Backup-Schicht anfallend wegen ${absenceType === "SICK" ? "Krankheit" : "Urlaub"} von ${originalEmployee?.name || "Mitarbeiter"}`,
                    lastUpdatedBy: "SYSTEM_BACKUP_ACTIVATION",
                    teamId: existing.teamId,
                    sheetFileName: existing.sheetFileName
                }

                if (backupExisting) {
                    // Only overwrite if existing shift is a system-created backup shift
                    // Check BOTH note content AND lastUpdatedBy to prevent overwriting manually edited shifts
                    const isSystemBackup = backupExisting.note?.includes("Backup-Schicht anfallend")
                        && backupExisting.lastUpdatedBy === "SYSTEM_BACKUP_ACTIVATION"
                    if (isSystemBackup) {
                        await prisma.timesheet.update({
                            where: { id: backupExisting.id },
                            data: backupData
                        })
                    } else {
                        // Employee has their own shift or a manually edited backup shift - do NOT overwrite
                        console.error(`[BACKUP] Skipped: Employee has own shift for date ${backupExisting.date}`)
                    }
                } else {
                    // Create new backup timesheet
                    await prisma.timesheet.create({
                        data: {
                            ...backupData,
                            employeeId: existing.backupEmployeeId,
                            date: existing.date,
                            plannedStart: existing.plannedStart,
                            plannedEnd: existing.plannedEnd,
                            month: existing.month,
                            year: existing.year,
                        }
                    })
                }
            }
        } catch (error) {
            console.error("[BACKUP SUBSTITUTION] Failed to activate backup (non-critical):", error)
        }
    }

    // Wenn absenceType auf null gesetzt wird (Mitarbeiter ist wieder gesund),
    // lösche Backup-Schicht aus der Datenbank
    if (!absenceType && (existing.absenceType === "SICK" || existing.absenceType === "VACATION") && existing.backupEmployeeId) {
        try {
            // Lösche die Backup-Schicht in der Datenbank
            const backupShift = await prisma.timesheet.findUnique({
                where: {
                    employeeId_date: {
                        employeeId: existing.backupEmployeeId,
                        date: existing.date
                    }
                }
            })

            if (backupShift && backupShift.note?.includes("Backup-Schicht anfallend")) {
                if (backupShift.status === "PLANNED") {
                    await prisma.timesheet.delete({
                        where: { id: backupShift.id }
                    })
                } else {
                    // Backup shift already confirmed - do NOT delete
                }
            }
        } catch (error) {
            console.error("[BACKUP CLEAR] Failed to clear backup shift (non-critical):", error)
        }
    }

    // Audit Log Entry - immer synchron um Connection Pool nicht zu erschöpfen
    try {
        await prisma.auditLog.create({
            data: {
                employeeId: existing.employeeId,
                date: existing.date,
                changedBy: user.email,
                field: "TIMESHEET_UPDATE",
                oldValue: JSON.stringify({
                    actualStart: existing.actualStart,
                    actualEnd: existing.actualEnd,
                    status: existing.status
                }),
                newValue: JSON.stringify({
                    actualStart: updated.actualStart,
                    actualEnd: updated.actualEnd,
                    status: updated.status
                }),
            }
        })
    } catch (error) {
        // Audit Log Fehler sollten die Hauptoperation nicht blockieren
        console.error("Audit log failed (non-critical):", error)
    }

    return NextResponse.json(updated)
    } catch (error: unknown) {
        console.error("[POST /api/timesheets] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
