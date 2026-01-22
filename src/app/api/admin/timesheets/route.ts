import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { appendShiftToSheet, clearShiftInSheet, getGoogleSheetsClient } from "@/lib/google-sheets"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")
    const source = searchParams.get("source")
    const employeeId = searchParams.get("employeeId")
    const teamId = searchParams.get("teamId")

    const where: any = {}
    if (!isNaN(month)) where.month = month
    if (!isNaN(year)) where.year = year
    if (source) where.source = source
    if (employeeId) where.employeeId = employeeId
    if (teamId) where.teamId = teamId

    try {
        const timesheets = await prisma.timesheet.findMany({
            where,
            include: {
                employee: {
                    select: { name: true, email: true }
                },
                team: {
                    select: { name: true }
                }
            },
            orderBy: [{ date: "asc" }, { employee: { name: "asc" } }]
        })

        // Fetch unique sources, teams, and employees for the filter menu
        const [sourcesData, teams, employees, gsClient] = await Promise.all([
            prisma.timesheet.findMany({
                select: { source: true },
                distinct: ["source"],
                where: { source: { not: null } }
            }),
            prisma.team.findMany({
                select: { id: true, name: true }
            }),
            prisma.user.findMany({
                where: { role: "EMPLOYEE" },
                select: { id: true, name: true }
            }),
            getGoogleSheetsClient()
        ])

        // Fetch actual tab names from all configured sheets
        const sheetIds = (process.env.GOOGLE_SHEET_IDS || process.env.GOOGLE_SHEET_ID || "").split(",").filter(Boolean)
        let allTabs: { sheetId: string, tab: string }[] = []
        for (const sid of sheetIds) {
            try {
                const res = await gsClient.spreadsheets.get({ spreadsheetId: sid })
                const tabs = res.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[]
                allTabs.push(...tabs.map(t => ({ sheetId: sid, tab: t })))
            } catch (e) {
                console.error(`Error fetching tabs for ${sid}:`, e)
            }
        }

        return NextResponse.json({
            timesheets,
            sources: sourcesData.map((s: { source: string | null }) => s.source || "").filter(Boolean),
            teams,
            employees,
            availableTabs: allTabs
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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
        // 1. Fetch shift details for sync
        const shift = await prisma.timesheet.findUnique({
            where: { id },
            include: { employee: true }
        })

        if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

        if (shift.source) {
            const sheetIds = (process.env.GOOGLE_SHEET_IDS || process.env.GOOGLE_SHEET_ID || "").split(",").map(id => id.trim()).filter(Boolean)
            const gsClient = await getGoogleSheetsClient()

            // Try to find which sheet contains this tab
            for (const sid of sheetIds) {
                try {
                    const res = await gsClient.spreadsheets.get({ spreadsheetId: sid })
                    const tabs = res.data.sheets?.map(s => s.properties?.title)
                    if (tabs?.includes(shift.source)) {
                        await clearShiftInSheet(sid, shift.source, shift.date, shift.employee.name || "")
                        break
                    }
                } catch (e) {
                    console.error(`Error searching tab ${shift.source} in ${sid}:`, e)
                }
            }
        }

        // 2. Delete from DB
        await prisma.timesheet.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("Error in refined delete:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
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
                lastUpdatedBy: session.user.email
            }
        })

        // Sync zu Google Sheets
        if (updated.source) {
            try {
                const sheetIds = (process.env.GOOGLE_SHEET_IDS || process.env.GOOGLE_SHEET_ID || "").split(",").filter(Boolean)
                const gsClient = await getGoogleSheetsClient()

                const employee = await prisma.user.findUnique({
                    where: { id: updated.employeeId },
                    select: { name: true }
                })

                // Finde Sheet mit diesem Tab
                for (const sid of sheetIds) {
                    const res = await gsClient.spreadsheets.get({ spreadsheetId: sid })
                    const tabs = res.data.sheets?.map(s => s.properties?.title)

                    if (tabs?.includes(updated.source)) {
                        await appendShiftToSheet(sid, updated.source, {
                            date: updated.date,
                            name: employee?.name || "Unknown",
                            start: updated.actualStart || updated.plannedStart || "",
                            end: updated.actualEnd || updated.plannedEnd || "",
                            note: updated.note || ""
                        }, 'partial') // Only update C, D, E when editing
                        break
                    }
                }
            } catch (error) {
                console.error("Fehler beim Sync zu Google Sheets:", error)
                // Fehler nicht werfen - DB-Update ist wichtiger
            }
        }

        return NextResponse.json(updated)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { employeeId, date, plannedStart, plannedEnd, note, targetTab } = body

    if (!employeeId || !date || !plannedStart || !plannedEnd || !targetTab) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { name: true, teamId: true }
        })

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

        const shiftDate = new Date(date)
        const [sheetId, tabName] = targetTab.split("|") // Format: "sheetId|tabName"

        // 1. Create in DB
        const shift = await prisma.timesheet.create({
            data: {
                employeeId,
                date: shiftDate,
                plannedStart,
                plannedEnd,
                status: "PLANNED",
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                teamId: user.teamId,
                note: note || "",
                // @ts-ignore
                source: tabName,
                lastUpdatedBy: session.user.email
            }
        })

        // 2. Write-back to Google Sheet
        await appendShiftToSheet(sheetId, tabName, {
            date: shiftDate,
            name: user.name || "Unbekannt",
            start: plannedStart,
            end: plannedEnd,
            note: note || ""
        })

        return NextResponse.json(shift)
    } catch (error: any) {
        console.error("Error creating manual shift:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
