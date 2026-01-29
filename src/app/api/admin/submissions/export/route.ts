import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { calculateMinutesBetween } from "@/lib/time-utils"
import { generateTimesheetPdf } from "@/lib/pdf-generator"

// GET - Export Stundennachweis als PDF, CSV oder Excel
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")
    const clientId = searchParams.get("clientId")
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")
    const exportFormat = searchParams.get("format") || "pdf"

    if (!employeeId || isNaN(month) || isNaN(year)) {
        return NextResponse.json({
            error: "employeeId, month und year sind erforderlich"
        }, { status: 400 })
    }

    try {
        // Mitarbeiter laden
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: {
                id: true,
                name: true,
                email: true,
                hourlyWage: true,
                nightPremiumEnabled: true,
                nightPremiumPercent: true,
                sundayPremiumEnabled: true,
                sundayPremiumPercent: true,
                holidayPremiumEnabled: true,
                holidayPremiumPercent: true
            }
        })

        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
        }

        // Klient laden (optional)
        let client = null
        if (clientId) {
            client = await prisma.client.findUnique({
                where: { id: clientId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            })
        }

        const clientName = client ? `${client.firstName} ${client.lastName}` : "Unbekannt"

        // Timesheets laden (inkl. PLANNED)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId,
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
            },
            orderBy: { date: "asc" }
        })

        if (timesheets.length === 0) {
            return NextResponse.json({ error: "Keine Einträge gefunden" }, { status: 404 })
        }

        // Daten aufbereiten
        const rows = timesheets.map(ts => {
            const start = ts.actualStart || ts.plannedStart
            const end = ts.actualEnd || ts.plannedEnd
            let hours = 0

            if (start && end && !ts.absenceType) {
                const minutes = calculateMinutesBetween(start, end)
                if (minutes !== null) {
                    hours = Math.round((minutes - (ts.breakMinutes || 0)) / 60 * 10) / 10
                }
            }

            // Typ bestimmen
            let type = ""
            if (ts.absenceType === "SICK") type = "K"
            else if (ts.absenceType === "VACATION") type = "U"
            else if (ts.note?.includes("Feiertag")) type = "F"
            else if (ts.note?.includes("Fahrt")) type = "FZ"
            else if (ts.note?.includes("Bereitschaft")) type = "BD"
            else if (ts.note?.includes("Büro")) type = "B"

            const date = new Date(ts.date)
            const weekday = format(date, "EEEE", { locale: de })
            const formattedDate = format(date, "dd.MM.yyyy", { locale: de })

            return {
                date,
                weekday,
                formattedDate,
                start: start || "-",
                end: end || "-",
                hours: ts.absenceType ? 0 : hours,
                type,
                note: ts.absenceType === "SICK" ? "Krank" :
                    ts.absenceType === "VACATION" ? "Urlaub" :
                        ts.note || ""
            }
        })

        // Gesamtstunden berechnen
        const totalHours = rows.reduce((sum, r) => sum + r.hours, 0)

        const monthName = format(new Date(year, month - 1), "MMMM yyyy", { locale: de })
        const filename = `Stundennachweis_${employee.name?.replace(/\s+/g, "_")}_${month}_${year}`

        // Export je nach Format
        if (exportFormat === "csv") {
            // CSV Export
            const csvHeader = "Datum,Wochentag,Beginn,Ende,Stunden,Typ,Bemerkung\n"
            const csvRows = rows.map(r =>
                `${r.formattedDate},${r.weekday},${r.start},${r.end},${r.hours},${r.type},"${r.note.replace(/"/g, '""')}"`
            ).join("\n")
            const csvFooter = `\nGesamtstunden,,,,,${totalHours},`
            const csvContent = csvHeader + csvRows + csvFooter

            return new NextResponse(csvContent, {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${filename}.csv"`,
                },
            })
        } else if (exportFormat === "xlsx") {
            // Excel Export
            const excelData = rows.map(r => ({
                "Datum": r.formattedDate,
                "Wochentag": r.weekday,
                "Beginn": r.start,
                "Ende": r.end,
                "Stunden": r.hours,
                "Typ": r.type,
                "Bemerkung": r.note
            }))

            // Gesamtzeile hinzufügen
            excelData.push({
                "Datum": "Gesamtstunden",
                "Wochentag": "",
                "Beginn": "",
                "Ende": "",
                "Stunden": totalHours,
                "Typ": "",
                "Bemerkung": ""
            })

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(excelData)

            // Spaltenbreiten
            ws['!cols'] = [
                { wch: 12 }, // Datum
                { wch: 12 }, // Wochentag
                { wch: 8 },  // Beginn
                { wch: 8 },  // Ende
                { wch: 8 },  // Stunden
                { wch: 6 },  // Typ
                { wch: 30 }  // Bemerkung
            ]

            XLSX.utils.book_append_sheet(wb, ws, `${month}_${year}`)
            const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

            return new NextResponse(excelBuffer, {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
                },
            })
        } else {
            // PDF Export
            const pdfTimesheets = timesheets.map(ts => ({
                date: ts.date,
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                absenceType: ts.absenceType,
                note: ts.note,
                status: ts.status,
                breakMinutes: ts.breakMinutes || 0,
                employeeName: employee.name || undefined
            }))

            const pdfBuffer = generateTimesheetPdf({
                employeeName: employee.name || "Unbekannt",
                teamName: clientName,
                month,
                year,
                timesheets: pdfTimesheets,
                stats: {
                    totalHours,
                    plannedHours: totalHours,
                    sickDays: rows.filter(r => r.type === "K").length,
                    sickHours: 0,
                    vacationDays: rows.filter(r => r.type === "U").length,
                    vacationHours: 0,
                    nightHours: 0,
                    sundayHours: 0,
                    holidayHours: 0
                },
                signatures: {}
            })

            return new NextResponse(pdfBuffer, {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `attachment; filename="${filename}.pdf"`,
                },
            })
        }
    } catch (error: any) {
        console.error("[GET /api/admin/submissions/export] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
