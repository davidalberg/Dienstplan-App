import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { timingSafeEqual } from "crypto"

/**
 * DELETE /api/admin/activity/cleanup
 * Loescht ActivityLog Eintraege aelter als 90 Tage
 * Kann via Vercel Cron-Job aufgerufen werden
 */
export async function DELETE(req: NextRequest) {
    // Authentifizierung: Entweder Admin-Session oder Cron-Secret
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    function safeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false
        return timingSafeEqual(Buffer.from(a), Buffer.from(b))
    }
    if (cronSecret && authHeader && safeCompare(authHeader, `Bearer ${cronSecret}`)) {
        // Cron-Job authentifiziert
    } else {
        // Pruefe Admin-Session
        const result = await requireAdmin()
        if (result instanceof NextResponse) return result
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
