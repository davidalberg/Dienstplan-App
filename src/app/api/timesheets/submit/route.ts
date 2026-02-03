import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        const { month, year } = body
        const user = session.user as any

        if (user.role !== "EMPLOYEE") {
            return NextResponse.json({ error: "Only employees can submit their month" }, { status: 403 })
        }

        // Validate month/year
        if (!month || !year || isNaN(month) || isNaN(year) || month < 1 || month > 12) {
            return NextResponse.json({ error: "Invalid month or year" }, { status: 400 })
        }

    // 1. Check if all planned days are processed (CONFIRMED or CHANGED)
    const unprocessed = await prisma.timesheet.findMany({
        where: {
            employeeId: user.id,
            month,
            year,
            status: "PLANNED",
            plannedStart: { not: null }
        }
    })

    if (unprocessed.length > 0) {
        return NextResponse.json({
            error: "Cannot submit. Some planned shifts are not yet confirmed or changed.",
            unprocessedCount: unprocessed.length
        }, { status: 400 })
    }

    // 2. Update all to SUBMITTED and create audit log (transactional)
    await prisma.$transaction(async (tx) => {
        await tx.timesheet.updateMany({
            where: {
                employeeId: user.id,
                month,
                year,
            },
            data: {
                status: "SUBMITTED",
                lastUpdatedBy: user.email
            }
        })

        // 3. Audit Log
        await tx.auditLog.create({
            data: {
                employeeId: user.id,
                date: new Date(), // Using current date for submission event log
                changedBy: user.email,
                field: "MONTHLY_SUBMIT",
                newValue: `Submitted month ${month}/${year}`
            }
        })
    })

    return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[POST /api/timesheets/submit] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
