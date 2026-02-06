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

        // Timesheets laden (alle Status)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId,
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
            },
            orderBy: { date: "asc" }
        })

        if (timesheets.length === 0) {
            return NextResponse.json({ error: "Keine Einträge gefunden" }, { status: 404 })
        }

        // Daten aufbereiten
        // WICHTIG: "Tatsaechlich geleistete Stunden" nur fuer bestaetigte Schichten (nicht PLANNED)
        let totalPlannedHours = 0
        let totalActualHours = 0

        const rows = timesheets.map(ts => {
            const date = new Date(ts.date)
            const weekday = format(date, "EEEE", { locale: de })
            const formattedDate = format(date, "dd.MM.yyyy", { locale: de })

            // Determine if this timesheet is CONFIRMED (not just PLANNED)
            const isConfirmed = ts.status !== "PLANNED"

            let plannedHours = 0
            let actualHours = 0

            // Calculate PLANNED hours (always, for all entries)
            if (ts.plannedStart && ts.plannedEnd && !ts.absenceType) {
                const minutes = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                if (minutes !== null) {
                    plannedHours = Math.round(minutes / 60 * 100) / 100
                    totalPlannedHours += plannedHours
                }
            }

            // Calculate ACTUAL hours only for CONFIRMED entries (not PLANNED)
            if (!ts.absenceType && isConfirmed) {
                const start = ts.actualStart || ts.plannedStart
                const end = ts.actualEnd || ts.plannedEnd
                if (start && end) {
                    const minutes = calculateMinutesBetween(start, end)
                    if (minutes !== null) {
                        actualHours = Math.round(minutes / 60 * 100) / 100
                        totalActualHours += actualHours
                    }
                }
            }

            // For display, use actualStart/End if available, else plannedStart/End
            const displayStart = ts.actualStart || ts.plannedStart
            const displayEnd = ts.actualEnd || ts.plannedEnd

            return {
                date,
                weekday,
                formattedDate,
                start: displayStart || "-",
                end: displayEnd || "-",
                hours: ts.absenceType ? 0 : actualHours,
                plannedHours: ts.absenceType ? 0 : plannedHours,
                note: ts.absenceType === "SICK" ? "Krank" :
                    ts.absenceType === "VACATION" ? "Urlaub" :
                        ts.note || "",
                status: ts.status
            }
        })

        // Gesamtstunden = nur bestaetigte Stunden (totalActualHours)
        const totalHours = totalActualHours

        const monthName = format(new Date(year, month - 1), "MMMM yyyy", { locale: de })
        const filename = `Stundennachweis_${employee.name?.replace(/\s+/g, "_")}_${month}_${year}`

        // Export je nach Format
        if (exportFormat === "csv") {
            // CSV Export mit UTF-8 BOM fuer Windows Excel Kompatibilitaet
            const BOM = '\ufeff'
            const csvHeader = "Datum,Wochentag,Beginn,Ende,Stunden,Bemerkung\n"
            const csvRows = rows.map(r =>
                `${r.formattedDate},${r.weekday},${r.start},${r.end},${r.hours},"${r.note.replace(/"/g, '""')}"`
            ).join("\n")
            const csvFooter = `\nGesamtstunden,,,,${totalHours},`
            const csvContent = BOM + csvHeader + csvRows + csvFooter

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
                "Bemerkung": r.note
            }))

            // Gesamtzeile hinzufügen
            excelData.push({
                "Datum": "Gesamtstunden",
                "Wochentag": "",
                "Beginn": "",
                "Ende": "",
                "Stunden": totalHours,
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

            // Load employee signature from TeamSubmission
            let employeeSignatureData: { signature: string | null; signedAt: Date | null } | null = null
            if (employeeId) {
                // Use sheetFileName from timesheets for more reliable matching
                const sheetFileName = timesheets[0]?.sheetFileName
                const sig = await prisma.employeeSignature.findFirst({
                    where: {
                        employeeId,
                        teamSubmission: {
                            month,
                            year,
                            ...(sheetFileName ? { sheetFileName } : clientId ? { clientId } : {})
                        }
                    },
                    select: {
                        signature: true,
                        signedAt: true
                    }
                })
                if (sig) {
                    employeeSignatureData = sig
                }
            }

            const pdfTimesheets = timesheets.map(ts => ({
                date: ts.date,
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                absenceType: ts.absenceType,
                note: ts.note,
                status: ts.status,
                employeeName: employee.name || undefined
            }))

            const pdfBuffer = generateTimesheetPdf({
                employeeName: employee.name || "Unbekannt",
                teamName: clientName,
                month,
                year,
                timesheets: pdfTimesheets,
                stats: {
                    totalHours,                   // Tatsaechlich geleistet (nur CONFIRMED+)
                    plannedHours: totalPlannedHours,  // Geplante Stunden (alle)
                    sickDays: timesheets.filter(ts => ts.absenceType === "SICK").length,
                    sickHours: timesheets
                        .filter(ts => ts.absenceType === "SICK")
                        .reduce((sum, ts) => {
                            if (ts.plannedStart && ts.plannedEnd) {
                                const m = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                                return sum + (m ? Math.round(m / 60 * 100) / 100 : 0)
                            }
                            return sum
                        }, 0),
                    vacationDays: timesheets.filter(ts => ts.absenceType === "VACATION").length,
                    vacationHours: timesheets
                        .filter(ts => ts.absenceType === "VACATION")
                        .reduce((sum, ts) => {
                            if (ts.plannedStart && ts.plannedEnd) {
                                const m = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                                return sum + (m ? Math.round(m / 60 * 100) / 100 : 0)
                            }
                            return sum
                        }, 0),
                    nightHours: 0,
                    sundayHours: 0,
                    holidayHours: 0
                },
                signatures: {
                    employeeName: employee.name || "Unbekannt",
                    employeeSignature: employeeSignatureData?.signature || null,
                    employeeSignedAt: employeeSignatureData?.signedAt || null,
                    // No recipient signature for single-employee PDF
                },
                singleEmployee: true
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
