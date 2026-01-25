import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

const timesheetUpdateSchema = z.object({
    id: z.string(), // Required - must have an ID to update
    date: z.string().optional(),
    actualStart: z.string().nullable().optional(),
    actualEnd: z.string().nullable().optional(),
    breakMinutes: z.number().int().min(0).max(240).optional(), // Added .int() validation
    note: z.string().max(500).optional(),
    absenceType: z.union([
        z.enum(["SICK", "VACATION"]),
        z.literal(""),
        z.null()
    ]).optional().transform(val => val === "" ? null : val), // Accept empty string and convert to null
    action: z.enum(["CONFIRM", "UPDATE", "UNCONFIRM"]).optional(),
})

export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { searchParams } = new URL(req.url)
        const getAvailableMonths = searchParams.get("getAvailableMonths") === "true"

        // If requesting available months, return distinct month/year combinations
        if (getAvailableMonths) {
        const user = session.user as any
        const where: any = {}

        if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
            where.employeeId = user.id
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
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        })

        return NextResponse.json(timesheets)
    }

    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    // Role based filtering
    const where: any = { month, year }
    const user = session.user as any

    if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
        where.employeeId = user.id
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
        orderBy: { date: "asc" },
    })

    return NextResponse.json(timesheets)
    } catch (error: any) {
        console.error("[GET /api/timesheets] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        const validated = timesheetUpdateSchema.safeParse(body)
        if (!validated.success) return NextResponse.json({ error: validated.error }, { status: 400 })

        const { id, actualStart, actualEnd, breakMinutes, note, absenceType, action } = validated.data
        const user = session.user as any

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

    let updateData: any = {
        actualStart,
        actualEnd,
        breakMinutes,
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
            console.log(`[BACKUP SUBSTITUTION] Employee ${existing.employeeId} is ${absenceType}, activating backup ${existing.backupEmployeeId}`)

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
                // Erstelle oder aktualisiere Timesheet für Backup-Person
                // WICHTIG: Nicht automatisch bestätigen - Backup muss selbst bestätigen
                const backupData = {
                    actualStart: null, // Keine Ist-Zeiten - Mitarbeiter muss selbst bestätigen
                    actualEnd: null,
                    breakMinutes: existing.breakMinutes || 0,
                    status: "PLANNED", // PLANNED statt CHANGED - Backup muss selbst bestätigen
                    absenceType: null, // They're working, not absent
                    note: `Eingesprungen für ${absenceType === "SICK" ? "Krankheit" : "Urlaub"}`,
                    lastUpdatedBy: "SYSTEM_BACKUP_ACTIVATION",
                    teamId: backupEmployee.teamId,
                    source: existing.source,
                    sheetFileName: existing.sheetFileName,
                    sheetId: existing.sheetId,
                    syncVerified: true
                }

                if (backupExisting) {
                    // Update existing backup timesheet
                    await prisma.timesheet.update({
                        where: { id: backupExisting.id },
                        data: backupData
                    })
                    console.log(`[BACKUP SUBSTITUTION] Updated existing timesheet for backup employee`)
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
                    console.log(`[BACKUP SUBSTITUTION] Created new timesheet for backup employee`)
                }

                // Sync zu Google Sheets: Schreibe Backup-Name in Spalte I der GLEICHEN Zeile
                // (NICHT als neue Zeile anhängen!)
                if (existing.source && existing.sheetId) {
                    try {
                        const { updateBackupInSameRow } = await import("@/lib/google-sheets")

                        // Hole den Namen des abwesenden Mitarbeiters
                        const absentEmployee = await prisma.user.findUnique({
                            where: { id: existing.employeeId },
                            select: { name: true }
                        })

                        await updateBackupInSameRow(
                            existing.sheetId,
                            existing.source,
                            existing.date,
                            absentEmployee?.name || "Unknown",
                            backupEmployee.name || "Unknown",
                            absenceType as "SICK" | "VACATION"
                        )
                    } catch (error) {
                        console.error("[BACKUP SUBSTITUTION] Google Sheets sync failed (non-critical):", error)
                    }
                }
            }
        } catch (error) {
            console.error("[BACKUP SUBSTITUTION] Failed to activate backup (non-critical):", error)
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

    // Sync zu Google Sheets - nur bei wichtigen Änderungen (nicht bei CONFIRM)
    // Synchron ausführen um Connection Pool nicht zu erschöpfen
    if (updated.source && updated.sheetId && action !== "CONFIRM") {
        try {
            const { appendShiftToSheet } = await import("@/lib/google-sheets")

            const employee = await prisma.user.findUnique({
                where: { id: updated.employeeId },
                select: { name: true }
            })

            await appendShiftToSheet(updated.sheetId, updated.source, {
                date: updated.date,
                name: employee?.name || "Unknown",
                start: updated.actualStart || updated.plannedStart || "",
                end: updated.actualEnd || updated.plannedEnd || "",
                note: updated.note || ""
            })
        } catch (error) {
            // Google Sheets Sync Fehler loggen aber Response nicht blockieren
            console.error("Fehler beim Sync zu Google Sheets:", error)
        }
    }

    return NextResponse.json(updated)
    } catch (error: any) {
        console.error("[POST /api/timesheets] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
