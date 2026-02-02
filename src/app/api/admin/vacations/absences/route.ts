import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/admin/vacations/absences
 * Fetch all absence entries (VACATION/SICK) from timesheets for a given month
 */
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

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

            if (ts.plannedStart && ts.plannedEnd) {
                const [startH, startM] = ts.plannedStart.split(':').map(Number)
                const [endH, endM] = ts.plannedEnd.split(':').map(Number)
                hours = (endH + endM / 60) - (startH + startM / 60)
                if (hours <= 0) hours = 8
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
