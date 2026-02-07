import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/admin/teams/orphaned
 * Liste aller Teams ohne Mitglieder
 */
export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const [orphanedTeams, totalTeams, teamsWithMembers] = await Promise.all([
            // Teams ohne Mitglieder
            prisma.team.findMany({
                where: {
                    members: {
                        none: {}
                    }
                },
                include: {
                    client: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    },
                    _count: {
                        select: {
                            members: true,
                            timesheets: true
                        }
                    }
                },
                orderBy: { name: 'asc' }
            }),
            // Gesamt-Anzahl
            prisma.team.count(),
            // Teams mit Mitgliedern
            prisma.team.count({
                where: {
                    members: {
                        some: {}
                    }
                }
            })
        ])

        const stats = {
            totalTeams,
            teamsWithMembers,
            orphanedTeams: orphanedTeams.length
        }

        return NextResponse.json({ orphanedTeams, stats })
    } catch (error: any) {
        console.error("[GET /api/admin/teams/orphaned] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/teams/orphaned
 * Löscht alle Teams ohne Mitglieder
 */
export async function DELETE(req: NextRequest) {
    const adminResult = await requireAdmin()
    if (adminResult instanceof NextResponse) return adminResult
    const session = adminResult

    try {
        // Finde alle verwaisten Teams
        const orphanedTeams = await prisma.team.findMany({
            where: {
                members: {
                    none: {}
                }
            },
            select: { id: true, name: true }
        })

        if (orphanedTeams.length === 0) {
            return NextResponse.json({ deletedCount: 0 })
        }

        // Lösche alle verwaisten Teams
        const result = await prisma.team.deleteMany({
            where: {
                id: {
                    in: orphanedTeams.map(t => t.id)
                }
            }
        })

        console.log(`[Cleanup] Deleted ${result.count} orphaned teams:`, orphanedTeams.map(t => t.name))

        return NextResponse.json({ deletedCount: result.count, deletedTeams: orphanedTeams })
    } catch (error: any) {
        console.error("[DELETE /api/admin/teams/orphaned] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
