import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Helper function to safely parse float values
function safeParseFloat(value: any, defaultValue: number, fieldName: string): number {
    if (value === undefined || value === null) {
        return defaultValue
    }
    const parsed = parseFloat(value)
    if (isNaN(parsed)) {
        throw new Error(`Invalid ${fieldName}: must be a valid number`)
    }
    return parsed
}

// GET - Liste aller Mitarbeiter (mit optionaler Pagination)
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)

    // ✅ PERFORMANCE: Optionale Pagination für große Datensätze
    // Wenn limit nicht gesetzt → alle Daten (Rückwärtskompatibilität)
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const usePagination = limitParam !== null

    // Limit: Default 50, Max 100 (nur wenn Pagination aktiviert)
    const limit = usePagination
        ? Math.min(parseInt(limitParam || "50"), 100)
        : undefined
    const offset = usePagination
        ? parseInt(offsetParam || "0")
        : undefined

    try {
        const where = { role: "EMPLOYEE" }

        const employees = await prisma.user.findMany({
            where,
            ...(limit !== undefined && { take: limit }),
            ...(offset !== undefined && { skip: offset }),
            select: {
                id: true,
                email: true,
                name: true,
                employeeId: true,
                entryDate: true,
                exitDate: true,
                hourlyWage: true,
                travelCostType: true,
                nightPremiumEnabled: true,
                nightPremiumPercent: true,
                sundayPremiumEnabled: true,
                sundayPremiumPercent: true,
                holidayPremiumEnabled: true,
                holidayPremiumPercent: true,
                assignedSheetId: true,
                assignedPlanTab: true,
                teamId: true,
                team: {
                    select: { name: true }
                },
                clients: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                },
                _count: {
                    select: { timesheets: true }
                },
                // ✅ PERFORMANCE FIX: Only fetch absence timesheets (much smaller subset)
                timesheets: {
                    select: {
                        absenceType: true
                    },
                    where: {
                        absenceType: { not: null }  // Only fetch SICK/VACATION (10-20% of data)
                    }
                }
            },
            orderBy: { name: "asc" }
        })

        // Calculate vacation and sick days for each employee
        const employeesWithAbsenceCounts = employees.map(emp => {
            const vacationDays = emp.timesheets.filter(ts => ts.absenceType === "VACATION").length
            const sickDays = emp.timesheets.filter(ts => ts.absenceType === "SICK").length

            // Remove timesheets from response (we only needed them for counting)
            // Keep clients for the Assistenten page
            const { timesheets, ...employeeData } = emp

            return {
                ...employeeData,
                vacationDays,
                sickDays,
                clients: emp.clients || []
            }
        })

        // ✅ PERFORMANCE: Pagination-Metadaten nur wenn aktiviert
        if (usePagination) {
            const total = await prisma.user.count({ where })
            return NextResponse.json({
                employees: employeesWithAbsenceCounts,
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: (offset || 0) + employeesWithAbsenceCounts.length < total
                }
            })
        }

        return NextResponse.json({ employees: employeesWithAbsenceCounts })
    } catch (error: any) {
        console.error("[GET /api/admin/employees] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Neuen Mitarbeiter erstellen
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            email,
            password,
            name,
            employeeId,
            entryDate,
            exitDate,
            hourlyWage,
            travelCostType,
            nightPremiumEnabled,
            nightPremiumPercent,
            sundayPremiumEnabled,
            sundayPremiumPercent,
            holidayPremiumEnabled,
            holidayPremiumPercent,
            assignedSheetId,
            assignedPlanTab,
            teamId,
            team // NEW: sheetFileName string from frontend
        } = body

        // Validierung
        if (!email || !password || !name) {
            return NextResponse.json(
                { error: "Email, Passwort und Name sind erforderlich" },
                { status: 400 }
            )
        }

        // Lookup teamId from team name (sheetFileName) if provided
        let resolvedTeamId = teamId || null
        if (team && !teamId) {
            const foundTeam = await prisma.team.findFirst({
                where: { name: team }
            })
            if (foundTeam) {
                resolvedTeamId = foundTeam.id
            }
        }

        // Passwort hashen
        const hashedPassword = await bcrypt.hash(password, 10)

        // ✅ RACE CONDITION FIX: Direkt create() versuchen und P2002 abfangen
        // Statt findUnique + create (Race Condition möglich), nutzen wir
        // die unique constraint des DB als Schutz
        try {
            const employee = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    role: "EMPLOYEE",
                    employeeId: employeeId || null,
                    entryDate: entryDate ? new Date(entryDate) : null,
                    exitDate: exitDate ? new Date(exitDate) : null,
                    hourlyWage: safeParseFloat(hourlyWage, 0, "hourlyWage"),
                    travelCostType: travelCostType || "NONE",
                    nightPremiumEnabled: nightPremiumEnabled !== undefined ? nightPremiumEnabled : true,
                    nightPremiumPercent: safeParseFloat(nightPremiumPercent, 25, "nightPremiumPercent"),
                    sundayPremiumEnabled: sundayPremiumEnabled !== undefined ? sundayPremiumEnabled : true,
                    sundayPremiumPercent: safeParseFloat(sundayPremiumPercent, 30, "sundayPremiumPercent"),
                    holidayPremiumEnabled: holidayPremiumEnabled !== undefined ? holidayPremiumEnabled : true,
                    holidayPremiumPercent: safeParseFloat(holidayPremiumPercent, 125, "holidayPremiumPercent"),
                    assignedSheetId: assignedSheetId || null,
                    assignedPlanTab: assignedPlanTab || null,
                    teamId: resolvedTeamId
                }
            })

            return NextResponse.json({ employee })
        } catch (createError: any) {
            // Prisma P2002: Unique constraint violation
            if (createError.code === "P2002") {
                const target = createError.meta?.target as string[] | undefined
                if (target?.includes("email")) {
                    return NextResponse.json(
                        { error: "Email bereits vergeben" },
                        { status: 409 }
                    )
                }
                if (target?.includes("employeeId")) {
                    return NextResponse.json(
                        { error: "Mitarbeiter-ID bereits vergeben" },
                        { status: 409 }
                    )
                }
                return NextResponse.json(
                    { error: "Eindeutigkeits-Konflikt" },
                    { status: 409 }
                )
            }
            throw createError
        }
    } catch (error: any) {
        console.error("[POST /api/admin/employees] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Mitarbeiter bearbeiten
export async function PUT(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            id,
            email,
            password,
            name,
            employeeId,
            entryDate,
            exitDate,
            hourlyWage,
            travelCostType,
            nightPremiumEnabled,
            nightPremiumPercent,
            sundayPremiumEnabled,
            sundayPremiumPercent,
            holidayPremiumEnabled,
            holidayPremiumPercent,
            assignedSheetId,
            assignedPlanTab,
            teamId,
            team // NEW: sheetFileName string from frontend
        } = body

        if (!id) {
            return NextResponse.json({ error: "ID erforderlich" }, { status: 400 })
        }

        // Prüfen ob Email bereits von anderem Benutzer verwendet wird
        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email,
                    id: { not: id }
                }
            })

            if (existingUser) {
                return NextResponse.json(
                    { error: "Email bereits vergeben" },
                    { status: 400 }
                )
            }
        }

        // Prüfen ob Mitarbeiter-ID bereits von anderem Benutzer verwendet wird
        if (employeeId) {
            const existingEmployeeId = await prisma.user.findFirst({
                where: {
                    employeeId,
                    id: { not: id }
                }
            })

            if (existingEmployeeId) {
                return NextResponse.json(
                    { error: "Mitarbeiter-ID bereits vergeben" },
                    { status: 400 }
                )
            }
        }

        // Lookup teamId from team name (sheetFileName) if provided
        let resolvedTeamId = teamId
        if (team !== undefined && !teamId) {
            if (team === "") {
                resolvedTeamId = null
            } else {
                const foundTeam = await prisma.team.findFirst({
                    where: { name: team }
                })
                if (foundTeam) {
                    resolvedTeamId = foundTeam.id
                } else {
                    resolvedTeamId = null
                }
            }
        }

        // Daten vorbereiten
        const updateData: any = {}
        if (email !== undefined) updateData.email = email
        if (name !== undefined) updateData.name = name
        if (employeeId !== undefined) updateData.employeeId = employeeId || null
        if (entryDate !== undefined) updateData.entryDate = entryDate ? new Date(entryDate) : null
        if (exitDate !== undefined) updateData.exitDate = exitDate ? new Date(exitDate) : null
        if (hourlyWage !== undefined) {
            updateData.hourlyWage = safeParseFloat(hourlyWage, 0, "hourlyWage")
        }
        if (travelCostType !== undefined) updateData.travelCostType = travelCostType
        if (nightPremiumEnabled !== undefined) updateData.nightPremiumEnabled = nightPremiumEnabled
        if (nightPremiumPercent !== undefined) {
            updateData.nightPremiumPercent = safeParseFloat(nightPremiumPercent, 25, "nightPremiumPercent")
        }
        if (sundayPremiumEnabled !== undefined) updateData.sundayPremiumEnabled = sundayPremiumEnabled
        if (sundayPremiumPercent !== undefined) {
            updateData.sundayPremiumPercent = safeParseFloat(sundayPremiumPercent, 30, "sundayPremiumPercent")
        }
        if (holidayPremiumEnabled !== undefined) updateData.holidayPremiumEnabled = holidayPremiumEnabled
        if (holidayPremiumPercent !== undefined) {
            updateData.holidayPremiumPercent = safeParseFloat(holidayPremiumPercent, 125, "holidayPremiumPercent")
        }
        if (assignedSheetId !== undefined) updateData.assignedSheetId = assignedSheetId || null
        if (assignedPlanTab !== undefined) updateData.assignedPlanTab = assignedPlanTab || null
        if (teamId !== undefined || team !== undefined) updateData.teamId = resolvedTeamId

        // Passwort nur aktualisieren wenn angegeben
        if (password) {
            updateData.password = await bcrypt.hash(password, 10)
        }

        const employee = await prisma.user.update({
            where: { id },
            data: updateData
        })

        return NextResponse.json({ employee })
    } catch (error: any) {
        console.error("[PUT /api/admin/employees] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE - Mitarbeiter löschen (mit Transaction gegen Race Conditions)
export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    const force = searchParams.get("force") === "true"

    if (!id) {
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 })
    }

    try {
        // Erste Prüfung außerhalb der Transaction (für User-Feedback)
        const timesheetCount = await prisma.timesheet.count({
            where: { employeeId: id }
        })

        if (timesheetCount > 0) {
            return NextResponse.json(
                { error: `Mitarbeiter kann nicht gelöscht werden. Es existieren noch ${timesheetCount} Stundeneinträge.` },
                { status: 400 }
            )
        }

        const auditLogCount = await prisma.auditLog.count({
            where: { employeeId: id }
        })

        if (auditLogCount > 0 && !force) {
            return NextResponse.json(
                {
                    error: `Mitarbeiter hat noch ${auditLogCount} Audit-Logs. Möchten Sie diese mit löschen?`,
                    needsConfirmation: true,
                    auditLogCount
                },
                { status: 400 }
            )
        }

        // Atomare Transaction: Prüfung + Löschung in einer Operation
        // Verhindert Race Condition zwischen Check und Delete
        await prisma.$transaction(async (tx) => {
            // Erneute Prüfung innerhalb der Transaction (atomar)
            const currentTimesheetCount = await tx.timesheet.count({
                where: { employeeId: id }
            })

            if (currentTimesheetCount > 0) {
                throw new Error(`Race Condition: Inzwischen wurden ${currentTimesheetCount} Stundeneinträge erstellt.`)
            }

            // AuditLogs löschen wenn force=true
            if (force) {
                await tx.auditLog.deleteMany({
                    where: { employeeId: id }
                })
            }

            // Mitarbeiter löschen
            await tx.user.delete({
                where: { id }
            })
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[DELETE /api/admin/employees] Error:", error)
        // Spezifische Fehlermeldung für Race Condition (interner Fehler, ok zu zeigen)
        if (error.message?.includes("Race Condition")) {
            return NextResponse.json({ error: "Konflikt: Daten wurden zwischenzeitlich geändert" }, { status: 409 })
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
