import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/schedule/bulk-delete
 * Löscht mehrere Schichten gleichzeitig
 * Admin-only endpoint
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        const { shiftIds } = body

        // Validierung
        if (!shiftIds || !Array.isArray(shiftIds) || shiftIds.length === 0) {
            return NextResponse.json(
                { error: "shiftIds array erforderlich" },
                { status: 400 }
            )
        }

        // Prüfe, ob alle Schichten existieren
        const existingShifts = await prisma.timesheet.findMany({
            where: { id: { in: shiftIds } },
            select: { id: true }
        })

        if (existingShifts.length !== shiftIds.length) {
            const missingIds = shiftIds.filter(
                id => !existingShifts.find(shift => shift.id === id)
            )
            return NextResponse.json(
                { error: `Schichten nicht gefunden: ${missingIds.join(", ")}` },
                { status: 404 }
            )
        }

        // Lösche alle Schichten in einer Transaction
        const result = await prisma.timesheet.deleteMany({
            where: { id: { in: shiftIds } }
        })

        console.log(`[POST /api/admin/schedule/bulk-delete] Deleted ${result.count} shifts`)

        return NextResponse.json({
            success: true,
            deleted: result.count,
            message: `${result.count} Schichten gelöscht`
        })
    } catch (error: any) {
        console.error("[POST /api/admin/schedule/bulk-delete] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
