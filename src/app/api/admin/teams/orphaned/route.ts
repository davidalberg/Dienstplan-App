import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/admin/teams/orphaned
 * Liste aller Teams ohne Mitglieder
 */
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
