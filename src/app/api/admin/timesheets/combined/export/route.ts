import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { calculateMinutesBetween } from "@/lib/time-utils"
import { generateCombinedTeamPdf } from "@/lib/pdf-generator"
import { getEmployeesInDienstplan } from "@/lib/team-submission-utils"

/**
 * Zod Schema for query parameter validation
 */
const QueryParamsSchema = z.object({
    sheetFileName: z.string().min(1, "sheetFileName ist erforderlich"),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2030),
    clientId: z.string().min(1, "clientId ist erforderlich"),
    format: z.enum(["pdf", "xlsx", "csv"]).default("pdf")
})

/**
 * GET /api/admin/timesheets/combined/export
 *
 * Exports combined timesheet data as PDF, Excel or CSV.
 * Aggregates all employees' timesheets for a given sheetFileName/month/year.
 *
 * Query Parameters:
 * - sheetFileName: string (required) - e.g., "Team_Jana_Scheuer_2026"
 * - month: number (required) - 1-12
 * - year: number (required) - 2020-2030
 * - clientId: string (required) - CUID of the client
 * - format: "pdf" | "xlsx" | "csv" (default: "pdf")
 */
export async function GET(req: NextRequest) {
    // Auth check: Require ADMIN role
    const session = await auth()
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url)
    const rawParams = {
        sheetFileName: searchParams.get("sheetFileName") || "",
        month: searchParams.get("month") || "",
        year: searchParams.get("year") || "",
        clientId: searchParams.get("clientId") || "",
        format: searchParams.get("format") || "pdf"
    }

    const validationResult = QueryParamsSchema.safeParse(rawParams)
    if (!validationResult.success) {
        return NextResponse.json({
            error: "Ungueltige Parameter",
            details: validationResult.error.flatten()
        }, { status: 400 })
    }

    const { sheetFileName, month, year, clientId, format: exportFormat } = validationResult.data

    try {
        // Parallel fetch: Client data, TeamSubmission, and employee IDs
        const [client, submission, employeeIds] = await Promise.all([
            // Fetch client data
            prisma.client.findUnique({
                where: { id: clientId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                }
            }),
            // Fetch team submission with employee signatures
            prisma.teamSubmission.findUnique({
                where: {
                    sheetFileName_month_year: {
                        sheetFileName,
                        month,
                        year
                    }
                },
                include: {
                    employeeSignatures: {
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            }),
            // Get all employee IDs for this dienstplan
            getEmployeesInDienstplan(sheetFileName, month, year)
        ])

        // Validate client exists
        if (!client) {
            return NextResponse.json({
                error: "Klient nicht gefunden"
            }, { status: 404 })
        }

        const clientName = `${client.firstName} ${client.lastName}`

        // Check if any employees found
        if (employeeIds.length === 0) {
            return NextResponse.json({
                error: "Keine Mitarbeiter oder Schichten fuer diesen Dienstplan gefunden"
            }, { status: 404 })
        }

        // Fetch employee data and timesheets in parallel
        const [employees, allTimesheets] = await Promise.all([
            // Fetch all employees
            prisma.user.findMany({
                where: {
                    id: { in: employeeIds }
                },
                select: {
                    id: true,
                    name: true,
                    email: true
                },
                orderBy: {
                    name: "asc"
                }
            }),
            // Fetch all timesheets for this month/year/sheetFileName
            prisma.timesheet.findMany({
                where: {
                    sheetFileName,
                    month,
                    year,
                    status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
                },
                orderBy: { date: "asc" },
                select: {
                    id: true,
                    date: true,
                    plannedStart: true,
                    plannedEnd: true,
                    actualStart: true,
                    actualEnd: true,
                    breakMinutes: true,
                    note: true,
                    status: true,
                    absenceType: true,
                    employeeId: true
                }
            })
        ])

        if (allTimesheets.length === 0) {
            return NextResponse.json({
                error: "Keine Eintraege gefunden"
            }, { status: 404 })
        }

        // Create employee name map
        const employeeNameMap = new Map<string, string>()
        for (const emp of employees) {
            employeeNameMap.set(emp.id, emp.name || "Unbekannt")
        }

        // Process timesheets and calculate hours
        interface ProcessedTimesheet {
            id: string
            date: Date
            formattedDate: string
            weekday: string
            employeeId: string
            employeeName: string
            plannedStart: string | null
            plannedEnd: string | null
            actualStart: string | null
            actualEnd: string | null
            breakMinutes: number
            hours: number
            note: string | null
            absenceType: string | null
            status: string
        }

        const processedTimesheets: ProcessedTimesheet[] = []
        const employeeStatsMap = new Map<string, {
            totalHours: number
            plannedHours: number
            sickDays: number
            vacationDays: number
            workDays: number
        }>()

        // Initialize stats for all employees
        for (const emp of employees) {
            employeeStatsMap.set(emp.id, {
                totalHours: 0,
                plannedHours: 0,
                sickDays: 0,
                vacationDays: 0,
                workDays: 0
            })
        }

        for (const ts of allTimesheets) {
            const start = ts.actualStart || ts.plannedStart
            const end = ts.actualEnd || ts.plannedEnd
            let hours = 0
            let plannedHours = 0

            // Calculate ACTUAL hours only for non-absence entries
            if (start && end && !ts.absenceType) {
                const minutes = calculateMinutesBetween(start, end)
                if (minutes !== null) {
                    const netMinutes = minutes - (ts.breakMinutes || 0)
                    if (netMinutes > 0) {
                        hours = Math.round(netMinutes / 60 * 100) / 100
                    }
                }
            }

            // Calculate PLANNED hours separately (for comparison)
            if (ts.plannedStart && ts.plannedEnd && !ts.absenceType) {
                const plannedMinutes = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                if (plannedMinutes !== null) {
                    const netPlannedMinutes = plannedMinutes - (ts.breakMinutes || 0)
                    if (netPlannedMinutes > 0) {
                        plannedHours = Math.round(netPlannedMinutes / 60 * 100) / 100
                    }
                }
            }

            // Update employee stats
            const stats = employeeStatsMap.get(ts.employeeId)
            if (stats) {
                if (ts.absenceType === "SICK") {
                    stats.sickDays++
                } else if (ts.absenceType === "VACATION") {
                    stats.vacationDays++
                } else {
                    if (hours > 0) {
                        stats.totalHours += hours
                        stats.workDays++
                    }
                    if (plannedHours > 0) {
                        stats.plannedHours += plannedHours
                    }
                }
            }

            // Format date
            const dateObj = new Date(ts.date)
            const weekday = format(dateObj, "EE", { locale: de })
            const formattedDate = format(dateObj, "dd.MM.yyyy", { locale: de })

            processedTimesheets.push({
                id: ts.id,
                date: ts.date,
                formattedDate,
                weekday,
                employeeId: ts.employeeId,
                employeeName: employeeNameMap.get(ts.employeeId) || "Unbekannt",
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                breakMinutes: ts.breakMinutes || 0,
                hours,
                note: ts.note,
                absenceType: ts.absenceType,
                status: ts.status
            })
        }

        // Calculate total hours
        let totalHours = 0
        for (const stats of employeeStatsMap.values()) {
            totalHours += stats.totalHours
        }

        const filename = `Stundennachweis_${sheetFileName.replace(/\s+/g, "_")}_${month}_${year}`

        // =========================================================================
        // CSV Export
        // =========================================================================
        if (exportFormat === "csv") {
            const csvHeader = "Datum,Wochentag,Mitarbeiter,Geplant Start,Geplant Ende,Tatsaechlich Start,Tatsaechlich Ende,Stunden,Bemerkung\n"

            // Sort by date, then by employee name
            const sortedTimesheets = [...processedTimesheets].sort((a, b) => {
                const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime()
                if (dateCompare !== 0) return dateCompare
                return a.employeeName.localeCompare(b.employeeName)
            })

            const csvRows = sortedTimesheets.map(ts => {
                const hoursStr = ts.absenceType
                    ? (ts.absenceType === "SICK" ? "Krank" : "Urlaub")
                    : ts.hours.toFixed(2)
                return `${ts.formattedDate},${ts.weekday},"${ts.employeeName}",${ts.plannedStart || "-"},${ts.plannedEnd || "-"},${ts.actualStart || "-"},${ts.actualEnd || "-"},${hoursStr},"${(ts.note || "").replace(/"/g, '""')}"`
            }).join("\n")

            const csvFooter = `\nGesamtstunden,,,,,,,${totalHours.toFixed(2)},`
            const csvContent = csvHeader + csvRows + csvFooter

            return new NextResponse(csvContent, {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${filename}.csv"`,
                },
            })
        }

        // =========================================================================
        // Excel Export
        // =========================================================================
        if (exportFormat === "xlsx") {
            // Sort by date, then by employee name
            const sortedTimesheets = [...processedTimesheets].sort((a, b) => {
                const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime()
                if (dateCompare !== 0) return dateCompare
                return a.employeeName.localeCompare(b.employeeName)
            })

            const excelData = sortedTimesheets.map(ts => ({
                "Datum": ts.formattedDate,
                "Wochentag": ts.weekday,
                "Mitarbeiter": ts.employeeName,
                "Geplant Start": ts.plannedStart || "-",
                "Geplant Ende": ts.plannedEnd || "-",
                "Tatsaechlich Start": ts.actualStart || "-",
                "Tatsaechlich Ende": ts.actualEnd || "-",
                "Stunden": ts.absenceType
                    ? (ts.absenceType === "SICK" ? "Krank" : "Urlaub")
                    : ts.hours,
                "Bemerkung": ts.note || ""
            }))

            // Add totals row
            excelData.push({
                "Datum": "Gesamtstunden",
                "Wochentag": "",
                "Mitarbeiter": "",
                "Geplant Start": "",
                "Geplant Ende": "",
                "Tatsaechlich Start": "",
                "Tatsaechlich Ende": "",
                "Stunden": totalHours,
                "Bemerkung": ""
            })

            // Add employee breakdown
            excelData.push({
                "Datum": "",
                "Wochentag": "",
                "Mitarbeiter": "",
                "Geplant Start": "",
                "Geplant Ende": "",
                "Tatsaechlich Start": "",
                "Tatsaechlich Ende": "",
                "Stunden": "",
                "Bemerkung": ""
            })

            for (const emp of employees) {
                const stats = employeeStatsMap.get(emp.id)
                if (stats) {
                    excelData.push({
                        "Datum": `${emp.name || "Unbekannt"}:`,
                        "Wochentag": "",
                        "Mitarbeiter": "",
                        "Geplant Start": "",
                        "Geplant Ende": "",
                        "Tatsaechlich Start": "",
                        "Tatsaechlich Ende": "",
                        "Stunden": stats.totalHours,
                        "Bemerkung": `${stats.sickDays} Krank, ${stats.vacationDays} Urlaub`
                    })
                }
            }

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(excelData)

            // Column widths
            ws['!cols'] = [
                { wch: 12 },  // Datum
                { wch: 10 },  // Wochentag
                { wch: 20 },  // Mitarbeiter
                { wch: 12 },  // Geplant Start
                { wch: 12 },  // Geplant Ende
                { wch: 14 },  // Tatsaechlich Start
                { wch: 14 },  // Tatsaechlich Ende
                { wch: 10 },  // Stunden
                { wch: 30 }   // Bemerkung
            ]

            XLSX.utils.book_append_sheet(wb, ws, `${month}_${year}`)
            const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

            return new NextResponse(excelBuffer, {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
                },
            })
        }

        // =========================================================================
        // PDF Export (default)
        // =========================================================================

        // Build employee stats array
        const employeeStats = employees.map(emp => {
            const stats = employeeStatsMap.get(emp.id) || {
                totalHours: 0,
                plannedHours: 0,
                sickDays: 0,
                vacationDays: 0,
                workDays: 0
            }
            return {
                employeeId: emp.id,
                employeeName: emp.name || "Unbekannt",
                totalHours: Math.round(stats.totalHours * 100) / 100,
                plannedHours: Math.round(stats.plannedHours * 100) / 100,
                sickDays: stats.sickDays,
                vacationDays: stats.vacationDays,
                workDays: stats.workDays
            }
        })

        // Build signature data from submission
        const employeeSignatures: Array<{
            employeeId: string
            employeeName: string
            signature: string
            signedAt: Date
        }> = []

        if (submission?.employeeSignatures) {
            for (const sig of submission.employeeSignatures) {
                if (sig.signature && sig.signedAt) {
                    employeeSignatures.push({
                        employeeId: sig.employeeId,
                        employeeName: sig.employee.name || "Unbekannt",
                        signature: sig.signature,
                        signedAt: sig.signedAt
                    })
                }
            }
        }

        const clientSignature = {
            clientName,
            signature: submission?.recipientSignature || submission?.clientSignatureUrl || null,
            signedAt: submission?.recipientSignedAt || null
        }

        // Convert processed timesheets to PDF format
        const pdfTimesheets = processedTimesheets.map(ts => ({
            date: ts.date,
            employeeId: ts.employeeId,
            employeeName: ts.employeeName,
            plannedStart: ts.plannedStart,
            plannedEnd: ts.plannedEnd,
            actualStart: ts.actualStart,
            actualEnd: ts.actualEnd,
            breakMinutes: ts.breakMinutes,
            absenceType: ts.absenceType,
            note: ts.note,
            status: ts.status,
            hours: ts.hours
        }))

        const pdfBuffer = generateCombinedTeamPdf({
            teamName: sheetFileName,
            clientName,
            month,
            year,
            timesheets: pdfTimesheets,
            employeeStats,
            totalHours: Math.round(totalHours * 100) / 100,
            signatures: {
                employees: employeeSignatures,
                client: clientSignature
            }
        })

        return new NextResponse(pdfBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}.pdf"`,
            },
        })

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[GET /api/admin/timesheets/combined/export] Error:", errorMessage, error)
        return NextResponse.json({
            error: "Interner Serverfehler"
        }, { status: 500 })
    }
}
