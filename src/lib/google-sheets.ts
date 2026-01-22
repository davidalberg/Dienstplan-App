import { google } from "googleapis"
import prisma from "@/lib/prisma"

/**
 * Google Sheets Service
 * 
 * Note: Requires GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env
 */
export async function getGoogleSheetsClient() {
    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    return google.sheets({ version: "v4", auth })
}

export async function importPlannedShifts(sheetId: string, tabName: string = "Import", sheetFileName?: string) {
    const sheets = await getGoogleSheetsClient()
    const range = `'${tabName}'!A3:I` // Quote tabName to handle spaces
    const importStartTime = new Date() // Konflikt-Prävention: Zeitstempel speichern

    try {
        // Hole den Dateinamen, falls nicht übergeben
        if (!sheetFileName) {
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
            sheetFileName = spreadsheet.data.properties?.title || tabName
        }

        // SCHRITT 1: Markiere alle existierenden Dienste aus dieser Quelle als nicht verifiziert
        console.log(`[SYNC DEBUG] Marking existing shifts from "${tabName}" (File: "${sheetFileName}") as not verified...`)
        await prisma.timesheet.updateMany({
            where: { source: tabName, sheetId: sheetId },
            data: { syncVerified: false }
        })

        console.log(`[SYNC DEBUG] Fetching range "${range}" from sheet ${sheetId}...`)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range,
        })

        const rows = response.data.values || []
        console.log(`[SYNC DEBUG] Tab "${tabName}" returned ${rows.length} rows.`)
        let processed = 0

        for (const [index, row] of rows.entries()) {
            const rowNum = index + 3
            if (row.length < 2) {
                // Completely empty or too short row
                continue
            }

            // Mapping: A:Day, B:Date, C:Name, D:Start, E:End, F:Total, G:Backup, H:Status, I:Notes
            const [day, dateStr, nameRaw, start, end, total, backup, status, notes] = row
            const name = nameRaw?.trim()

            if (!name || !dateStr) {
                if (name || dateStr) {
                    console.log(`[SYNC DEBUG] Skipping row ${rowNum}: Name="${name}", Date="${dateStr}" (Required both)`)
                }
                continue
            }

            // Fuzzy Name Matching
            // We'll try exact match first, then parts
            const searchName = name.toLowerCase().replace(/[.,\s]/g, '')

            const users = await prisma.user.findMany({
                where: { role: "EMPLOYEE" }
            })

            const user = users.find((u: any) => {
                const dbName = u.name?.toLowerCase().replace(/[.,\s]/g, '') || ""
                // Check if one contains the other or vice versa
                return dbName.includes(searchName) || searchName.includes(dbName)
            })

            if (!user) {
                console.warn(`[SYNC DEBUG] Row ${rowNum}: User NOT FOUND in database for name "${name}" (Clean: "${searchName}")`)
                continue
            }

            // Parse date (B)
            let date: Date
            const cleanDateStr = dateStr.trim()
            if (cleanDateStr.includes('.')) {
                let [d, m, y] = cleanDateStr.split('.')
                if (!y) {
                    console.warn(`[SYNC DEBUG] Row ${rowNum}: Invalid date format "${dateStr}"`)
                    continue
                }
                if (y.length === 2) y = `20${y}`
                date = new Date(`${y.trim()}-${m.trim()}-${d.trim()}`)
            } else {
                date = new Date(cleanDateStr)
            }

            if (isNaN(date.getTime())) {
                console.warn(`[SYNC DEBUG] Row ${rowNum}: Could not parse date "${dateStr}"`)
                continue
            }

            const formatTime = (t: string) => (t && t.includes(':')) ? t.trim() : null
            const finalNote = status ? `[Status: ${status}] ${notes || ""}` : (notes || "")

            console.log(`[SYNC DEBUG] Row ${rowNum} OK: ${user.name} on ${dateStr} (${tabName})`)

            // Konflikt-Prävention: Prüfe ob DB-Version neuer als Import-Start
            const existing = await prisma.timesheet.findUnique({
                where: {
                    employeeId_date: {
                        employeeId: user.id,
                        date: date,
                    }
                }
            })

            // Wenn DB-Version neuer als Import-Start, nicht überschreiben
            if (existing && existing.lastUpdatedAt > importStartTime) {
                console.log(`[SYNC DEBUG] Row ${rowNum}: DB-Version ist neuer als Import-Start, überspringe Import aber markiere als verifiziert`)
                await prisma.timesheet.update({
                    where: { id: existing.id },
                    data: { syncVerified: true }
                })
                processed++
                continue
            }

            const data: any = {
                plannedStart: formatTime(start),
                plannedEnd: formatTime(end),
                note: finalNote,
                teamId: user.teamId,
                source: tabName,
                sheetFileName: sheetFileName,
                sheetId: sheetId,
                syncVerified: true, // SCHRITT 2: Markiere als verifiziert
            }

            await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: user.id,
                        date: date,
                    }
                },
                update: data,
                create: {
                    ...data,
                    employeeId: user.id,
                    date: date,
                    breakMinutes: 0,
                    status: "PLANNED",
                    month: date.getMonth() + 1,
                    year: date.getFullYear(),
                }
            })
            processed++
        }

        // SCHRITT 3: Lösche alle nicht verifizierten Dienste (wurden aus Sheets entfernt)
        console.log(`[SYNC DEBUG] Deleting shifts that were removed from sheet...`)
        const deletedShifts = await prisma.timesheet.findMany({
            where: { source: tabName, sheetId: sheetId, syncVerified: false },
            select: { id: true, date: true, employee: { select: { name: true } } }
        })

        if (deletedShifts.length > 0) {
            console.log(`[SYNC DEBUG] Found ${deletedShifts.length} shifts to delete:`)
            deletedShifts.forEach(shift => {
                console.log(`  - ${shift.employee.name} on ${shift.date.toISOString().split('T')[0]}`)
            })

            await prisma.timesheet.deleteMany({
                where: { source: tabName, sheetId: sheetId, syncVerified: false }
            })
        }

        return { imported: processed, deleted: deletedShifts.length }
    } catch (error: any) {
        console.error(`[SYNC DEBUG] Error in importPlannedShifts for ${tabName}:`, error.message)
        throw error
    }
}

export async function exportConfirmedShifts(sheetId: string, month: number, year: number) {
    const sheets = await getGoogleSheetsClient()

    try {
        const timesheets = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                status: { in: ["CONFIRMED", "CHANGED", "SUBMITTED"] }
            },
            include: { employee: true }
        })

        if (timesheets.length === 0) return 0

        const values = timesheets.map((ts: any) => [
            "", // Day
            ts.date.toISOString().split("T")[0],
            ts.employee.name,
            ts.actualStart || ts.plannedStart,
            ts.actualEnd || ts.plannedEnd,
            "", // Total
            "", // Backup
            ts.status,
            ts.note || ""
        ])

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: "'Export'!A2",
            valueInputOption: "RAW",
            requestBody: { values }
        })

        return values.length
    } catch (error) {
        console.error("Error exporting shifts:", error)
        throw error
    }
}

async function findRowIndex(sheets: any, spreadsheetId: string, tabName: string, date: Date, name: string) {
    const range = `'${tabName}'!A3:C200` // Check more rows
    console.log(`[SYNC DEBUG] Searching for existing row for ${name} on ${date.toDateString()}...`)

    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range })
        const rows = response.data.values || []

        const searchD = date.getDate().toString().padStart(2, '0')
        const searchM = (date.getMonth() + 1).toString().padStart(2, '0')
        const searchDatePrefix = `${searchD}.${searchM}.`
        const searchName = name.toLowerCase().replace(/[.,\s]/g, '')

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            if (row.length < 3) continue

            const rowDate = (row[1] || "").trim()
            const rowName = (row[2] || "").trim().toLowerCase().replace(/[.,\s]/g, '')

            // Exact date prefix match (to handle 22 vs 2022) and name fuzzy match
            if (rowDate.startsWith(searchDatePrefix) && (rowName.includes(searchName) || searchName.includes(rowName))) {
                console.log(`[SYNC DEBUG] Match found at row ${i + 3}`)
                return i + 3
            }
        }
    } catch (e: any) {
        console.error(`[SYNC DEBUG] findRowIndex failed: ${e.message}`)
    }
    console.log(`[SYNC DEBUG] No matching row found.`)
    return -1
}

export async function appendShiftToSheet(sheetId: string, tabName: string, shiftData: { date: Date, name: string, start: string, end: string, note: string }, updateMode: 'full' | 'partial' = 'full') {
    const sheets = await getGoogleSheetsClient()
    const { date, name, start, end, note } = shiftData
    const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
    const day = dayNames[date.getDay()]
    const dateFormatted = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear().toString().slice(-2)}`

    const rowIndex = await findRowIndex(sheets, sheetId, tabName, date, name)

    if (rowIndex !== -1) {
        // Update existing row
        if (updateMode === 'partial') {
            // Only update columns C, D, E (Name, Start, End)
            console.log(`[SYNC DEBUG] Updating only columns C,D,E in row ${rowIndex} in "${tabName}"`)
            const updateRange = `'${tabName}'!C${rowIndex}:E${rowIndex}`
            const values = [[name, start, end]]

            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: updateRange,
                valueInputOption: "USER_ENTERED",
                requestBody: { values }
            })
        } else {
            // Update all columns A-I
            console.log(`[SYNC DEBUG] Updating all columns (A-I) in row ${rowIndex} in "${tabName}"`)
            const updateRange = `'${tabName}'!A${rowIndex}:I${rowIndex}`
            const values = [[day, dateFormatted, name, start, end, "", "", "", note]]

            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: updateRange,
                valueInputOption: "USER_ENTERED",
                requestBody: { values }
            })
        }
    } else {
        // Append as new row - always write all columns
        console.log(`[SYNC DEBUG] Appending new row to "${tabName}"`)
        const values = [[day, dateFormatted, name, start, end, "", "", "", note]]

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `'${tabName}'!A3`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values }
        })
    }
}

export async function clearShiftInSheet(sheetId: string, tabName: string, date: Date, name: string) {
    const sheets = await getGoogleSheetsClient()
    const rowIndex = await findRowIndex(sheets, sheetId, tabName, date, name)

    if (rowIndex !== -1) {
        console.log(`[SYNC DEBUG] Clearing columns C,D,E in row ${rowIndex} (tab: "${tabName}")`)
        // Columns C, D, E are indices 2, 3, 4. 
        // We write empty strings to these cells.
        const clearRange = `'${tabName}'!C${rowIndex}:E${rowIndex}`
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: clearRange,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [["", "", ""]]
            }
        })
    } else {
        console.warn(`[SYNC DEBUG] Could not find row to clear for ${name} on ${date.toDateString()} in "${tabName}"`)
    }
}
