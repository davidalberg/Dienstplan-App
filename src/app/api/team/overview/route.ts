import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = session.user as any
    if (user.role !== "TEAMLEAD" && user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    // Get all employees in the team
    const members = await prisma.user.findMany({
        where: {
            teamId: user.role === "ADMIN" ? undefined : user.teamId,
            role: "EMPLOYEE"
        },
        include: {
            timesheets: {
                where: { month, year },
            }
        }
    })

    // Format response
    const report = members.map(m => {
        const totalShifts = m.timesheets.length
        const submitted = m.timesheets.every(ts => ts.status === "SUBMITTED") && totalShifts > 0
        const pending = m.timesheets.some(ts => ts.status === "PLANNED")

        return {
            id: m.id,
            name: m.name,
            employeeId: m.employeeId,
            status: submitted ? "SUBMITTED" : (pending ? "DRAFT" : "READY"),
            shiftCount: totalShifts,
            lastUpdate: m.timesheets.length > 0 ? m.timesheets[0].lastUpdatedAt : null
        }
    })

    return NextResponse.json(report)
}
