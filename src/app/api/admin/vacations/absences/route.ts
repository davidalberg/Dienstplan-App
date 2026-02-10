import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { calculateMinutesBetween } from "@/lib/time-utils"

/**
 * GET /api/admin/vacations/absences
 * Fetch all absence entries (VACATION/SICK) from timesheets for a given month
 */
export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "", 10)
    const year = parseInt(searchParams.get("year") || "", 10)

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Month and year required" }, { status: 400 })
    }

    try {
        // Fetch all timesheets with absenceType set
        const timesheets = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                absenceType: {
                    in: ["VACATION", "SICK"]
                }
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: [
                { employee: { name: "asc" } },
                { date: "asc" }
            ]
        })

        // Calculate hours for each entry
        const absences = timesheets.map(ts => {
            let hours = 8 // Default

            const start = ts.actualStart || ts.plannedStart
            const end = ts.actualEnd || ts.plannedEnd
            if (start && end) {
                const minutes = calculateMinutesBetween(start, end)
                hours = minutes ? Math.round(minutes / 60 * 100) / 100 : 8
            }

            return {
                id: ts.id,
                date: ts.date.toISOString(),
                type: ts.absenceType as "VACATION" | "SICK",
                hours,
                employee: {
                    id: ts.employee.id,
                    name: ts.employee.name
                },
                note: ts.note
            }
        })

        return NextResponse.json({ absences })

    } catch (error: any) {
        console.error("[GET /api/admin/vacations/absences] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
