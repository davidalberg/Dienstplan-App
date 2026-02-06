import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")
    const employeeId = searchParams.get("employeeId")
    const teamId = searchParams.get("teamId")

    const where: any = {}
    if (!isNaN(month)) where.month = month
    if (!isNaN(year)) where.year = year
    if (employeeId) where.employeeId = employeeId
    if (teamId) where.teamId = teamId

    try {
        // Parallele Abfragen für bessere Performance
        const [timesheets, teams, employees] = await Promise.all([
            prisma.timesheet.findMany({
                where,
                include: {
                    employee: {
                        select: { name: true, email: true }
                    },
                    team: {
                        select: {
                            name: true,
                            client: {
                                select: { id: true, firstName: true, lastName: true }
                            }
                        }
                    }
                },
                orderBy: [{ date: "asc" }, { plannedStart: "asc" }]
            }),
            prisma.team.findMany({
                select: { id: true, name: true }
            }),
            prisma.user.findMany({
                where: { role: "EMPLOYEE" },
                select: { id: true, name: true }
            })
        ])

        return NextResponse.json({
            timesheets,
            teams,
            employees
        })
    } catch (error: any) {
        console.error("[GET /api/admin/timesheets] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    try {
        const shift = await prisma.timesheet.findUnique({
            where: { id }
        })

        if (!shift) {
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        await prisma.timesheet.delete({ where: { id } })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[DELETE /api/admin/timesheets] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function PUT(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { id, ...data } = body

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    try {
        const updated = await prisma.timesheet.update({
            where: { id },
            data: {
                plannedStart: data.plannedStart,
                plannedEnd: data.plannedEnd,
                actualStart: data.actualStart,
                actualEnd: data.actualEnd,
                note: data.note,
                status: data.status,
                absenceType: data.absenceType === "" ? null : data.absenceType,
                lastUpdatedBy: session.user.email
            },
            include: {
                employee: { select: { name: true, email: true } },
                team: { select: { name: true, client: { select: { id: true, firstName: true, lastName: true } } } }
            }
        })

        return NextResponse.json(updated)
    } catch (error: any) {
        console.error("[PUT /api/admin/timesheets] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { employeeId, date, plannedStart, plannedEnd, note, teamId } = body

    if (!employeeId || !date || !plannedStart || !plannedEnd) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { name: true, teamId: true }
        })

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

        const shiftDate = new Date(date)

        const shift = await prisma.timesheet.create({
            data: {
                employeeId,
                date: shiftDate,
                plannedStart,
                plannedEnd,
                status: "PLANNED",
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                teamId: teamId || user.teamId,
                note: note || "",
                lastUpdatedBy: session.user.email
            }
        })

        return NextResponse.json(shift)
    } catch (error: any) {
        console.error("[POST /api/admin/timesheets] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
