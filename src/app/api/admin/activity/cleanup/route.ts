import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

/**
 * DELETE /api/admin/activity/cleanup
 * Loescht ActivityLog Eintraege aelter als 90 Tage
 * Kann via Vercel Cron-Job aufgerufen werden
 */
export async function DELETE(req: NextRequest) {
    // Authentifizierung: Entweder Admin-Session oder Cron-Secret
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        // Cron-Job authentifiziert
    } else {
        // Pruefe Admin-Session
        const { auth } = await import("@/lib/auth")
        const session = await auth()
        if (!session?.user || (session.user as unknown as { role: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
    }

    try {
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

        const result = await prisma.activityLog.deleteMany({
            where: {
                createdAt: {
                    lt: ninetyDaysAgo
                }
            }
        })

        return NextResponse.json({
            success: true,
            deleted: result.count,
            message: `${result.count} Aktivitaetslog-Eintraege aelter als 90 Tage geloescht`
        })
    } catch (error: unknown) {
        console.error("[DELETE /api/admin/activity/cleanup] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
