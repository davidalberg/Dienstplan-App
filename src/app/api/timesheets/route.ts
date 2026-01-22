import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

const timesheetUpdateSchema = z.object({
    id: z.string().optional(),
    date: z.string().optional(),
    actualStart: z.string().nullable().optional(),
    actualEnd: z.string().nullable().optional(),
    breakMinutes: z.number().min(0).max(240).optional(),
    note: z.string().max(500).optional(),
    absenceType: z.string().nullable().optional(),
    action: z.enum(["CONFIRM", "UPDATE", "UNCONFIRM"]).optional(),
})

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const getAvailableMonths = searchParams.get("getAvailableMonths") === "true"

    // If requesting available months, return distinct month/year combinations
    if (getAvailableMonths) {
        const user = session.user as any
        const where: any = {}

        if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
            where.employeeId = user.id
        } else if (user.role === "TEAMLEAD") {
            where.teamId = user.teamId
        }

        const timesheets = await prisma.timesheet.findMany({
            where,
            select: { month: true, year: true },
            distinct: ['month', 'year'],
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        })

        return NextResponse.json(timesheets)
    }

    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

    if (isNaN(month) || isNaN(year)) {
        return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    // Role based filtering
    const where: any = { month, year }
    const user = session.user as any

    if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
        where.employeeId = user.id
    } else if (user.role === "TEAMLEAD") {
        where.teamId = user.teamId
    }

    const timesheets = await prisma.timesheet.findMany({
        where,
        orderBy: { date: "asc" },
    })

    return NextResponse.json(timesheets)
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const validated = timesheetUpdateSchema.safeParse(body)
    if (!validated.success) return NextResponse.json({ error: validated.error }, { status: 400 })

    const { id, actualStart, actualEnd, breakMinutes, note, absenceType, action } = validated.data
    const user = session.user as any

    const existing = await prisma.timesheet.findUnique({
        where: { id },
    })

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Authorization check: Only owner or teamlead/admin
    if (user.role === "EMPLOYEE" && existing.employeeId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (existing.status === "SUBMITTED" && user.role !== "ADMIN") {
        return NextResponse.json({ error: "Cannot modify submitted timesheet" }, { status: 403 })
    }

    let updateData: any = {
        actualStart,
        actualEnd,
        breakMinutes,
        note,
        absenceType: absenceType || null,
        lastUpdatedBy: user.email,
    }

    if (action === "CONFIRM") {
        updateData.actualStart = existing.plannedStart
        updateData.actualEnd = existing.plannedEnd
        updateData.status = "CONFIRMED"
    } else if (action === "UNCONFIRM") {
        // Reset status back to PLANNED
        updateData.actualStart = null
        updateData.actualEnd = null
        updateData.status = "PLANNED"
    } else {
        // Check if changed
        const isChanged =
            (actualStart && actualStart !== existing.plannedStart) ||
            (actualEnd && actualEnd !== existing.plannedEnd)

        updateData.status = isChanged ? "CHANGED" : "CONFIRMED"
    }

    // Audit Log Entry
    await prisma.auditLog.create({
        data: {
            employeeId: existing.employeeId,
            date: existing.date,
            changedBy: user.email,
            field: "TIMESHEET_UPDATE",
            oldValue: JSON.stringify({
                actualStart: existing.actualStart,
                actualEnd: existing.actualEnd,
                status: existing.status
            }),
            newValue: JSON.stringify({
                actualStart: updateData.actualStart,
                actualEnd: updateData.actualEnd,
                status: updateData.status
            }),
        }
    })

    const updated = await prisma.timesheet.update({
        where: { id },
        data: updateData,
    })

    // Sync zu Google Sheets - nur wenn sheetId vorhanden ist (Performance-Optimierung)
    if (updated.source && updated.sheetId) {
        try {
            const { appendShiftToSheet } = await import("@/lib/google-sheets")

            const employee = await prisma.user.findUnique({
                where: { id: updated.employeeId },
                select: { name: true }
            })

            // Verwende die gespeicherte sheetId direkt, ohne alle Sheets zu durchsuchen
            await appendShiftToSheet(updated.sheetId, updated.source, {
                date: updated.date,
                name: employee?.name || "Unknown",
                start: updated.actualStart || updated.plannedStart || "",
                end: updated.actualEnd || updated.plannedEnd || "",
                note: updated.note || ""
            })
        } catch (error) {
            console.error("Fehler beim Sync zu Google Sheets:", error)
            // Fehler nicht werfen - DB-Update ist wichtiger
        }
    }

    return NextResponse.json(updated)
}
