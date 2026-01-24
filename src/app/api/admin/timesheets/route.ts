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
    const sheetFileName = searchParams.get("sheetFileName")
    const employeeId = searchParams.get("employeeId")
    const teamId = searchParams.get("teamId")

    const where: any = {}
    if (!isNaN(month)) where.month = month
    if (!isNaN(year)) where.year = year
    if (source) where.source = source
    if (sheetFileName) where.sheetFileName = sheetFileName
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

        // Fetch unique sources, sheet file names, teams, and employees for the filter menu
        // SEQUENTIELL statt Promise.all um Connection Pool nicht zu erschöpfen
        const sourcesData = await prisma.timesheet.findMany({
            select: { source: true },
            distinct: ["source"],
            where: { source: { not: null } }
        })
        const sheetFileNamesData = await prisma.timesheet.findMany({
            select: { sheetFileName: true },
            distinct: ["sheetFileName"],
            where: { sheetFileName: { not: null } }
        })
        const teams = await prisma.team.findMany({
            select: { id: true, name: true }
        })
        const employees = await prisma.user.findMany({
            where: { role: "EMPLOYEE" },
            select: { id: true, name: true }
        })

        return NextResponse.json({
            timesheets,
            sources: sourcesData.map((s: { source: string | null }) => s.source || "").filter(Boolean),
            sheetFileNames: sheetFileNamesData.map((s: { sheetFileName: string | null }) => s.sheetFileName || "").filter(Boolean),
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
        // 1. Fetch shift details BEFORE delete
        const shift = await prisma.timesheet.findUnique({
            where: { id },
            include: { employee: true }
        })

        if (!shift) {
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        // 2. Google Sheets Sync ZUERST (mit await!) - KRITISCH für Daten-Konsistenz
        let sheetSyncError: string | null = null

        // FIX: Direkt das gespeicherte sheetId verwenden statt alle Sheets zu durchsuchen
        if (shift.source && shift.sheetId) {
            try {
                console.log(`[DELETE SYNC] Using stored sheetId: ${shift.sheetId.slice(0,8)}... for tab "${shift.source}"`)

                const gsClient = await getGoogleSheetsClient()

                // Verifiziere dass der Tab im richtigen Sheet existiert
                const res = await gsClient.spreadsheets.get({ spreadsheetId: shift.sheetId })
                const tabs = res.data.sheets?.map(s => s.properties?.title) || []

                if (tabs.includes(shift.source)) {
                    console.log(`[DELETE SYNC] Tab "${shift.source}" found, clearing...`)
                    await clearShiftInSheet(
                        shift.sheetId,
                        shift.source as string,
                        shift.date,
                        (shift.employee?.name || "Unknown") as string
                    )
                    console.log(`[DELETE SYNC] Clear completed successfully!`)
                } else {
                    console.warn(`[DELETE SYNC WARNING] Tab "${shift.source}" NOT FOUND in sheet ${shift.sheetId.slice(0,8)}...`)
                }
            } catch (error: any) {
                console.error("[DELETE SYNC] Google Sheets sync failed:", error)
                sheetSyncError = error.message || "Google Sheets Synchronisation fehlgeschlagen"
            }
        } else {
            console.log(`[DELETE SYNC] No source/sheetId - skipping Google Sheets sync`)
        }

        // 3. Wenn Google Sync fehlgeschlagen ist: NICHT aus DB löschen!
        if (sheetSyncError) {
            return NextResponse.json({
                error: "Konnte nicht mit Google Sheets synchronisieren. Bitte erneut versuchen.",
                details: sheetSyncError,
                syncFailed: true
            }, { status: 503 })
        }

        // 4. Erst JETZT aus Datenbank löschen (nach erfolgreichem Sheet-Sync)
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
        // 1. Update in DB mit employee relation für Response
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
            },
            include: {
                employee: { select: { name: true, email: true } },
                team: { select: { name: true } }
            }
        })

        // 2. Google Sheets Sync SYNCHRON (mit await!) - für Daten-Konsistenz
        let sheetSyncError: string | null = null

        // FIX: Direkt das gespeicherte sheetId verwenden statt alle Sheets zu durchsuchen
        if (updated.source && updated.sheetId) {
            try {
                console.log(`[PUT SYNC] Using stored sheetId: ${updated.sheetId.slice(0,8)}... for tab "${updated.source}"`)

                const gsClient = await getGoogleSheetsClient()

                // Verifiziere dass der Tab im richtigen Sheet existiert
                const res = await gsClient.spreadsheets.get({ spreadsheetId: updated.sheetId })
                const tabs = res.data.sheets?.map(s => s.properties?.title) || []

                if (tabs.includes(updated.source)) {
                    console.log(`[PUT SYNC] Tab "${updated.source}" found, syncing...`)
                    await appendShiftToSheet(updated.sheetId, updated.source as string, {
                        date: updated.date,
                        name: updated.employee?.name || "Unknown",
                        start: updated.actualStart || updated.plannedStart || "",
                        end: updated.actualEnd || updated.plannedEnd || "",
                        note: updated.note || ""
                    }, 'partial')
                    console.log(`[PUT SYNC] Sync completed successfully!`)
                } else {
                    console.warn(`[PUT SYNC WARNING] Tab "${updated.source}" NOT FOUND in sheet ${updated.sheetId.slice(0,8)}...`)
                }
            } catch (error: any) {
                console.error("[PUT SYNC] Google Sheets sync failed:", error)
                sheetSyncError = error.message || "Google Sheets Synchronisation fehlgeschlagen"
            }
        } else {
            console.log(`[PUT SYNC] No source/sheetId - skipping Google Sheets sync`)
        }

        // 3. Bei Sync-Fehler: Warnung zurückgeben aber DB-Update ist OK
        if (sheetSyncError) {
            return NextResponse.json({
                ...updated,
                _syncWarning: "Änderung gespeichert, aber Google Sheets Sync fehlgeschlagen."
            })
        }

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
        console.error("[POST /api/admin/timesheets] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
