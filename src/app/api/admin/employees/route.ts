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

// GET - Liste aller Mitarbeiter
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.user.findMany({
            where: { role: "EMPLOYEE" },
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
                _count: {
                    select: { timesheets: true }
                }
            },
            orderBy: { name: "asc" }
        })

        return NextResponse.json({ employees })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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
            teamId
        } = body

        // Validierung
        if (!email || !password || !name) {
            return NextResponse.json(
                { error: "Email, Passwort und Name sind erforderlich" },
                { status: 400 }
            )
        }

        // Prüfen ob Email bereits existiert
        const existingUser = await prisma.user.findUnique({
            where: { email }
        })

        if (existingUser) {
            return NextResponse.json(
                { error: "Email bereits vergeben" },
                { status: 400 }
            )
        }

        // Prüfen ob Mitarbeiter-ID bereits existiert
        if (employeeId) {
            const existingEmployeeId = await prisma.user.findUnique({
                where: { employeeId }
            })

            if (existingEmployeeId) {
                return NextResponse.json(
                    { error: "Mitarbeiter-ID bereits vergeben" },
                    { status: 400 }
                )
            }
        }

        // Passwort hashen
        const hashedPassword = await bcrypt.hash(password, 10)

        // Mitarbeiter erstellen
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
                teamId: teamId || null
            }
        })

        return NextResponse.json({ employee })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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
            teamId
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
        if (teamId !== undefined) updateData.teamId = teamId || null

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
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE - Mitarbeiter löschen
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
        // Prüfen ob Mitarbeiter Timesheets hat
        const timesheetCount = await prisma.timesheet.count({
            where: { employeeId: id }
        })

        // Prüfen ob Mitarbeiter AuditLogs hat
        const auditLogCount = await prisma.auditLog.count({
            where: { employeeId: id }
        })

        // Timesheets können nicht gelöscht werden
        if (timesheetCount > 0) {
            return NextResponse.json(
                { error: `Mitarbeiter kann nicht gelöscht werden. Es existieren noch ${timesheetCount} Stundeneinträge.` },
                { status: 400 }
            )
        }

        // AuditLogs können mit force gelöscht werden
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

        // Wenn force=true, AuditLogs zuerst löschen
        if (auditLogCount > 0 && force) {
            await prisma.auditLog.deleteMany({
                where: { employeeId: id }
            })
        }

        // Mitarbeiter löschen
        await prisma.user.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
