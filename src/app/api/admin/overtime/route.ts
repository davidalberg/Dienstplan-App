import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { calculateOvertime } from "@/lib/overtime-calculator"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as unknown as { role: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))
    const employeeId = searchParams.get("employeeId") || undefined

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
        return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    try {
        const results = await calculateOvertime(month, year, employeeId)

        const totals = {
            totalTarget: results.reduce((sum, r) => sum + r.targetHours, 0),
            totalActual: results.reduce((sum, r) => sum + r.actualHours, 0),
            totalOvertime: results.reduce((sum, r) => sum + r.overtime, 0),
            totalSick: results.reduce((sum, r) => sum + r.sickHours, 0),
            totalVacation: results.reduce((sum, r) => sum + r.vacationHours, 0)
        }

        return NextResponse.json({
            overtime: results,
            totals: {
                ...totals,
                totalTarget: Math.round(totals.totalTarget * 100) / 100,
                totalActual: Math.round(totals.totalActual * 100) / 100,
                totalOvertime: Math.round(totals.totalOvertime * 100) / 100,
                totalSick: Math.round(totals.totalSick * 100) / 100,
                totalVacation: Math.round(totals.totalVacation * 100) / 100
            },
            month,
            year,
            employeeCount: results.length
        })
    } catch (error: unknown) {
        console.error("[GET /api/admin/overtime] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
