import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    // Nur Mitarbeiter können ihre Einreichungen abbrechen
    if (user.role !== "EMPLOYEE") {
        return NextResponse.json(
            { error: "Nur Mitarbeiter können Einreichungen abbrechen" },
            { status: 403 }
        )
    }

    try {
        const body = await req.json()
        const { month, year } = body

        if (!month || !year) {
            return NextResponse.json(
                { error: "Monat und Jahr sind erforderlich" },
                { status: 400 }
            )
        }

        // Validate and parse month/year
        const parsedMonth = parseInt(month, 10)
        const parsedYear = parseInt(year, 10)

        if (isNaN(parsedMonth) || isNaN(parsedYear) || parsedMonth < 1 || parsedMonth > 12) {
            return NextResponse.json(
                { error: "Ungültiger Monat oder Jahr" },
                { status: 400 }
            )
        }

        // Finde alle SUBMITTED Timesheets für diesen Mitarbeiter und Monat
        const submittedShifts = await prisma.timesheet.findMany({
            where: {
                employeeId: user.id,
                month: parsedMonth,
                year: parsedYear,
                status: "SUBMITTED"
            }
        })

        if (submittedShifts.length === 0) {
            return NextResponse.json(
                { error: "Keine eingereichten Schichten für diesen Monat gefunden" },
                { status: 404 }
            )
        }

        // Atomically reset status and create audit logs
        const updatedCount = await prisma.$transaction(async (tx) => {
            // Split shifts into confirmed (has actual times) and changed (no actual times)
            const confirmedIds = submittedShifts
                .filter(s => s.actualStart && s.actualEnd)
                .map(s => s.id)
            const changedIds = submittedShifts
                .filter(s => !(s.actualStart && s.actualEnd))
                .map(s => s.id)

            const results = await Promise.all([
                confirmedIds.length > 0
                    ? tx.timesheet.updateMany({
                        where: { id: { in: confirmedIds } },
                        data: { status: "CONFIRMED", lastUpdatedBy: user.email }
                    })
                    : { count: 0 },
                changedIds.length > 0
                    ? tx.timesheet.updateMany({
                        where: { id: { in: changedIds } },
                        data: { status: "CHANGED", lastUpdatedBy: user.email }
                    })
                    : { count: 0 },
            ])

            // Create audit log entries
            await tx.auditLog.createMany({
                data: submittedShifts.map(shift => ({
                    employeeId: user.id,
                    date: shift.date,
                    changedBy: user.email || user.name || "System",
                    field: "status",
                    oldValue: "SUBMITTED",
                    newValue: shift.actualStart && shift.actualEnd ? "CONFIRMED" : "CHANGED"
                }))
            })

            return results[0].count + results[1].count
        })

        return NextResponse.json({
            success: true,
            count: updatedCount,
            message: `${updatedCount} Schichten wurden zurückgesetzt`
        })
    } catch (error: any) {
        console.error("[POST /api/timesheets/cancel-submit] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
