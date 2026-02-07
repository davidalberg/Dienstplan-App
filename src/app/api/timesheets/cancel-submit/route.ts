import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const session = authResult

    const user = session.user as any

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

        // Setze Status zurück
        const updatedShifts = await Promise.all(
            submittedShifts.map(shift =>
                prisma.timesheet.update({
                    where: { id: shift.id },
                    data: {
                        status: shift.actualStart && shift.actualEnd ? "CONFIRMED" : "CHANGED",
                        lastUpdatedBy: user.email
                    }
                })
            )
        )

        // Erstelle Audit Log Einträge
        await Promise.all(
            submittedShifts.map(shift =>
                prisma.auditLog.create({
                    data: {
                        employeeId: user.id,
                        date: shift.date,
                        changedBy: user.email || user.name || "System",
                        field: "status",
                        oldValue: "SUBMITTED",
                        newValue: shift.actualStart && shift.actualEnd ? "CONFIRMED" : "CHANGED"
                    }
                })
            )
        )

        return NextResponse.json({
            success: true,
            count: updatedShifts.length,
            message: `${updatedShifts.length} Schichten wurden zurückgesetzt`
        })
    } catch (error: any) {
        console.error("[POST /api/timesheets/cancel-submit] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
