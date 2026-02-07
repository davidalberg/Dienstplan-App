import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/admin/teams
 * Liste aller Teams mit zugehörigen Mitarbeitern und Clients
 */
export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const teams = await prisma.team.findMany({
            include: {
                members: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true,
                    }
                },
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    }
                }
            },
            orderBy: { name: 'asc' }
        })

        // Auch Mitarbeiter ohne Team holen
        const unassignedEmployees = await prisma.user.findMany({
            where: {
                role: "EMPLOYEE",
                teamId: null
            },
            select: {
                id: true,
                name: true,
                email: true,
                employeeId: true,
            }
        })

        return NextResponse.json({ teams, unassignedEmployees })
    } catch (error: any) {
        console.error("[GET /api/admin/teams] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/admin/teams
 * Neues Team erstellen
 */
export async function POST(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const body = await req.json()
        const { name, clientId } = body

        if (!name) {
            return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 })
        }

        // Prüfen ob Team mit diesem Namen bereits existiert
        const existing = await prisma.team.findUnique({ where: { name } })
        if (existing) {
            return NextResponse.json({ error: "Team mit diesem Namen existiert bereits" }, { status: 400 })
        }

        const team = await prisma.team.create({
            data: {
                name,
                clientId: clientId || null,
            },
            include: {
                client: true
            }
        })

        return NextResponse.json({ team })
    } catch (error: any) {
        console.error("[POST /api/admin/teams] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * PUT /api/admin/teams
 * Team aktualisieren oder Mitarbeiter zuweisen
 */
export async function PUT(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const body = await req.json()
        const { action, teamId, employeeId, name, clientId } = body

        // Mitarbeiter zu Team zuweisen
        if (action === "assignEmployee") {
            if (!employeeId) {
                return NextResponse.json({ error: "employeeId ist erforderlich" }, { status: 400 })
            }

            const user = await prisma.user.update({
                where: { id: employeeId },
                data: { teamId: teamId || null }
            })

            return NextResponse.json({ success: true, user })
        }

        // Team umbenennen / Client zuweisen
        if (teamId) {
            const updateData: any = {}
            if (name !== undefined) updateData.name = name
            if (clientId !== undefined) updateData.clientId = clientId || null

            const team = await prisma.team.update({
                where: { id: teamId },
                data: updateData,
                include: { client: true }
            })

            return NextResponse.json({ team })
        }

        return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 })
    } catch (error: any) {
        console.error("[PUT /api/admin/teams] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/teams
 * Team löschen (nur wenn keine Mitarbeiter zugewiesen)
 */
export async function DELETE(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get("id")
        const force = searchParams.get("force") === "true"

        if (!id) {
            return NextResponse.json({ error: "Team-ID erforderlich" }, { status: 400 })
        }

        // Prüfen ob Mitarbeiter zugewiesen sind
        const team = await prisma.team.findUnique({
            where: { id },
            include: { _count: { select: { members: true, timesheets: true } } }
        })

        if (!team) {
            return NextResponse.json({ error: "Team nicht gefunden" }, { status: 404 })
        }

        if (team._count.members > 0 && !force) {
            return NextResponse.json({
                error: `Team hat ${team._count.members} Mitarbeiter. Mitarbeiter zuerst entfernen oder force=true verwenden.`,
                needsConfirmation: true
            }, { status: 400 })
        }

        // Bei force: Mitarbeiter aus Team entfernen
        if (force && team._count.members > 0) {
            await prisma.user.updateMany({
                where: { teamId: id },
                data: { teamId: null }
            })
        }

        // Team löschen
        await prisma.team.delete({ where: { id } })

        return NextResponse.json({ success: true, deletedTeam: team.name })
    } catch (error: any) {
        console.error("[DELETE /api/admin/teams] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
