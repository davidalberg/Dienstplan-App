import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { importPlannedShifts, exportConfirmedShifts, getGoogleSheetsClient } from "@/lib/google-sheets"

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action } = await req.json()
    const sheetIds = (process.env.GOOGLE_SHEET_IDS || process.env.GOOGLE_SHEET_ID || "").split(",").map(id => id.trim()).filter(Boolean)

    if (sheetIds.length === 0) {
        return NextResponse.json({ error: "GOOGLE_SHEET_IDS not configured" }, { status: 500 })
    }

    if (action === "IMPORT") {
        const syncLog = await prisma.syncLog.create({
            data: { status: "RUNNING", message: `Starting import from ${sheetIds.length} files...` }
        })

        try {
            const sheets = await getGoogleSheetsClient()
            let totalImported = 0
            let totalDeleted = 0
            let totalTabs = 0

            for (const specificSheetId of sheetIds) {
                const spreadsheet = await sheets.spreadsheets.get({
                    spreadsheetId: specificSheetId
                })

                const sheetFileName = spreadsheet.data.properties?.title || "Unbekannt"
                const sheetTitles = (spreadsheet.data.sheets || [])
                    .map((s: any) => s.properties?.title)
                    .filter(Boolean) as string[]

                console.log(`[SYNC DEBUG] Discovered tabs in "${sheetFileName}" (${specificSheetId}): ${JSON.stringify(sheetTitles)}`)
                totalTabs += sheetTitles.length

                for (const title of sheetTitles) {
                    try {
                        console.log(`[SYNC DEBUG] Starting import for tab: "${title}" from sheet: "${sheetFileName}"`)
                        const result = await importPlannedShifts(specificSheetId, title, sheetFileName)
                        totalImported += result.imported
                        totalDeleted += result.deleted
                        console.log(`[SYNC DEBUG] Finished tab: "${title}". Imported ${result.imported}, Deleted ${result.deleted}.`)
                    } catch (e: any) {
                        console.error(`[SYNC DEBUG] Failed to import from ${specificSheetId} / ${title}: ${e.message}`)
                    }
                }
            }

            await prisma.syncLog.update({
                where: { id: syncLog.id },
                data: {
                    status: "SUCCESS",
                    message: `Imported ${totalImported} shifts, deleted ${totalDeleted} shifts from ${sheetIds.length} files (${totalTabs} tabs)`,
                    rowsProcessed: totalImported,
                    endedAt: new Date()
                }
            })
            return NextResponse.json({
                success: true,
                message: `Imported ${totalImported} shifts, deleted ${totalDeleted} shifts`
            })
        } catch (error: any) {
            await prisma.syncLog.update({
                where: { id: syncLog.id },
                data: { status: "ERROR", message: error.message, endedAt: new Date() }
            })
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
    }

    if (action === "EXPORT") {
        const syncLog = await prisma.syncLog.create({
            data: { status: "RUNNING", message: "Starting Monthly Export..." }
        })

        try {
            // Use the first ID for export if multiple exist, or just the one.
            const exportSheetId = sheetIds[0]
            const now = new Date()
            const month = now.getMonth() + 1
            const year = now.getFullYear()

            const count = await exportConfirmedShifts(exportSheetId, month, year)

            await prisma.syncLog.update({
                where: { id: syncLog.id },
                data: {
                    status: "SUCCESS",
                    message: `Exported ${count} confirmed shifts to Google Sheets`,
                    rowsProcessed: count,
                    endedAt: new Date()
                }
            })
            return NextResponse.json({ success: true, message: `Exported ${count} shifts` })
        } catch (error: any) {
            await prisma.syncLog.update({
                where: { id: syncLog.id },
                data: {
                    status: "ERROR",
                    message: error.message || "Export failed",
                    endedAt: new Date()
                }
            })
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const logs = await prisma.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 20
    })

    return NextResponse.json(logs)
}
