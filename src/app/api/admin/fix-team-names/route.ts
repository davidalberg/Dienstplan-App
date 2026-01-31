import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/fix-team-names
 * Fixes team names by removing "Team " prefix
 * Admin only
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Get all teams
        const teams = await prisma.team.findMany()

        const results = {
            total: teams.length,
            fixed: 0,
            skipped: 0,
            teams: [] as Array<{ old: string; new: string }>
        }

        for (const team of teams) {
            const hasTeamPrefix = team.name.toLowerCase().startsWith('team ')

            if (hasTeamPrefix) {
                const correctedName = team.name.replace(/^Team\s+/i, '').trim()

                await prisma.team.update({
                    where: { id: team.id },
                    data: { name: correctedName }
                })

                results.fixed++
                results.teams.push({
                    old: team.name,
                    new: correctedName
                })
            } else {
                results.skipped++
            }
        }

        // Also clean up bad DienstplanConfigs
        const badConfigs = await prisma.dienstplanConfig.findMany({
            where: {
                OR: [
                    { sheetFileName: { contains: 'Team_Team_' } },
                    { sheetFileName: { contains: '_2026_2026' } }
                ]
            }
        })

        for (const config of badConfigs) {
            await prisma.dienstplanConfig.delete({
                where: { id: config.id }
            })
        }

        results.total += badConfigs.length

        return NextResponse.json({
            message: "Team names fixed successfully",
            results,
            badConfigsDeleted: badConfigs.length
        })
    } catch (error) {
        console.error("[POST /api/admin/fix-team-names] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
