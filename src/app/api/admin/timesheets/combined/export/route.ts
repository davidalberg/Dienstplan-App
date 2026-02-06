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
import { getTemplateByIdOrDefault, getNestedValue } from "@/lib/export-templates"

/**
 * Zod Schema for query parameter validation
 */
/**
 * Valid template IDs for export
 * - standard: Full detail export (default) - all details with signatures
 * - invoice: DSGVO-compliant invoice format - anonymized employees, no employee signatures
 */
const QueryParamsSchema = z.object({
    sheetFileName: z.string().min(1, "sheetFileName ist erforderlich"),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2030),
    clientId: z.string().optional().default(""),
    format: z.enum(["pdf", "xlsx"]).default("pdf"),
    template: z.enum(["standard", "invoice"]).default("standard")
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
        format: searchParams.get("format") || "pdf",
        template: searchParams.get("template") || "standard" // NEW: Template parameter
    }

    const validationResult = QueryParamsSchema.safeParse(rawParams)
    if (!validationResult.success) {
        return NextResponse.json({
            error: "Ungueltige Parameter",
            details: validationResult.error.flatten()
        }, { status: 400 })
    }

    const { sheetFileName, month, year, clientId, format: exportFormat, template: templateId } = validationResult.data

    // Load export template
    const exportTemplate = getTemplateByIdOrDefault(templateId)

    try {
        // Parallel fetch: Client data (if clientId provided), TeamSubmission, and employee IDs
        const [client, submission, employeeIds] = await Promise.all([
            // Fetch client data (only if clientId provided)
            clientId
                ? prisma.client.findUnique({
                    where: { id: clientId },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                })
                : Promise.resolve(null),
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

        // Resolve client: try direct lookup, then submission.clientId, then team relation
        let resolvedClient = client
        if (!resolvedClient && submission?.clientId) {
            resolvedClient = await prisma.client.findUnique({
                where: { id: submission.clientId },
                select: { id: true, firstName: true, lastName: true, email: true }
            })
        }
        if (!resolvedClient) {
            const timesheetWithTeam = await prisma.timesheet.findFirst({
                where: { sheetFileName, month, year },
                select: {
                    team: {
                        select: {
                            client: {
                                select: { id: true, firstName: true, lastName: true, email: true }
                            }
                        }
                    }
                }
            })
            if (timesheetWithTeam?.team?.client) {
                resolvedClient = timesheetWithTeam.team.client
            }
        }

        if (!resolvedClient) {
            return NextResponse.json({
                error: "Klient nicht gefunden"
            }, { status: 404 })
        }

        const clientName = `${resolvedClient.firstName} ${resolvedClient.lastName}`

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
                    status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
                },
                orderBy: { date: "asc" },
                select: {
                    id: true,
                    date: true,
                    plannedStart: true,
                    plannedEnd: true,
                    actualStart: true,
                    actualEnd: true,
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

        // Create employee name map (real names)
        const employeeNameMap = new Map<string, string>()
        // Create anonymized name map for invoice template (Assistent N, T, ... = first letter of first name)
        const anonymizedNameMap = new Map<string, string>()
        for (let i = 0; i < employees.length; i++) {
            const emp = employees[i]
            employeeNameMap.set(emp.id, emp.name || "Unbekannt")
            const firstLetter = emp.name ? emp.name.charAt(0).toUpperCase() : "?"
            anonymizedNameMap.set(emp.id, `Assistent ${firstLetter}`)
        }

        // Helper: get display name (anonymized for invoice, real for standard)
        const getDisplayName = (employeeId: string): string => {
            if (templateId === "invoice") {
                return anonymizedNameMap.get(employeeId) || "Assistent ?"
            }
            return employeeNameMap.get(employeeId) || "Unbekannt"
        }

        // Helper: anonymize note content for invoice (remove employee names)
        const anonymizeNote = (note: string | null): string | null => {
            if (!note || templateId !== "invoice") return note
            let anonymized = note
            // Sort by name length (longest first) to avoid partial overlaps
            // e.g., "Anna Müller" must be replaced before "Anna"
            const sortedEmployees = [...employees]
                .filter(emp => emp.name)
                .sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))
            for (const emp of sortedEmployees) {
                if (emp.name) {
                    const anonName = anonymizedNameMap.get(emp.id) || "Assistent"
                    // Replace full name FIRST (before partial names)
                    anonymized = anonymized.replace(new RegExp(emp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), anonName)
                    // Replace first name only
                    const firstName = emp.name.split(' ')[0]
                    if (firstName && firstName.length > 2) {
                        anonymized = anonymized.replace(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), anonName)
                    }
                    // Replace last name only
                    const nameParts = emp.name.split(' ')
                    if (nameParts.length > 1) {
                        const lastName = nameParts[nameParts.length - 1]
                        if (lastName && lastName.length > 2) {
                            anonymized = anonymized.replace(new RegExp(lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), anonName)
                        }
                    }
                }
            }
            return anonymized
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
            let hours = 0
            let plannedHours = 0

            // Determine if this timesheet is CONFIRMED (not just PLANNED)
            // Only CONFIRMED, CHANGED, SUBMITTED, COMPLETED count as "actually worked"
            const isConfirmed = ts.status !== "PLANNED"

            // Calculate PLANNED hours (for comparison) - always calculate from planned times
            if (ts.plannedStart && ts.plannedEnd && !ts.absenceType) {
                const plannedMinutes = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                if (plannedMinutes !== null && plannedMinutes > 0) {
                    plannedHours = Math.round(plannedMinutes / 60 * 100) / 100
                }
            }

            // Calculate ACTUAL hours only for CONFIRMED entries (not PLANNED)
            // Use actual times if available, otherwise use planned times for confirmed entries
            if (!ts.absenceType && isConfirmed) {
                const start = ts.actualStart || ts.plannedStart
                const end = ts.actualEnd || ts.plannedEnd
                if (start && end) {
                    const minutes = calculateMinutesBetween(start, end)
                    if (minutes !== null && minutes > 0) {
                        hours = Math.round(minutes / 60 * 100) / 100
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
                    // totalHours = only confirmed work (not PLANNED)
                    if (hours > 0) {
                        stats.totalHours += hours
                        stats.workDays++
                    }
                    // plannedHours = always count planned hours regardless of status
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
                employeeName: getDisplayName(ts.employeeId),
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                hours,
                note: anonymizeNote(ts.note),
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
        // Excel Export (with Template Support)
        // =========================================================================
        if (exportFormat === "xlsx") {
            // Use template (prefer xlsx templates, fallback to standard)
            const template = exportTemplate.format === "xlsx" ? exportTemplate : getTemplateByIdOrDefault("standard")

            // Sort by date, then by employee name
            const sortedTimesheets = [...processedTimesheets].sort((a, b) => {
                const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime()
                if (dateCompare !== 0) return dateCompare
                return a.employeeName.localeCompare(b.employeeName)
            })

            // Build Excel data using template
            const excelData: Record<string, unknown>[] = sortedTimesheets.map(ts => {
                const row: Record<string, unknown> = {}
                for (const col of template.columns) {
                    let value = getNestedValue(ts as unknown as Record<string, unknown>, col.field)

                    // Apply transformation if defined
                    if (col.transform) {
                        value = col.transform(value, ts as unknown as Record<string, unknown>)
                    }

                    row[col.header] = value
                }
                return row
            })

            // Add totals row - use field-based lookup instead of index-based
            const totalsRow: Record<string, unknown> = {}
            const hoursColumnIndex = template.columns.findIndex(col => col.field === "hours")

            for (let i = 0; i < template.columns.length; i++) {
                const col = template.columns[i]
                if (i === 0) {
                    // First column always gets the label
                    totalsRow[col.header] = "Gesamtstunden"
                } else if (i === hoursColumnIndex) {
                    // Hours column gets the total - use index match for safety
                    totalsRow[col.header] = totalHours
                } else {
                    totalsRow[col.header] = ""
                }
            }
            excelData.push(totalsRow)

            // Add empty row
            const emptyRow: Record<string, unknown> = {}
            for (const col of template.columns) {
                emptyRow[col.header] = ""
            }
            excelData.push(emptyRow)

            // Add employee breakdown - use field-based lookup instead of index-based
            const noteColumnIndex = template.columns.findIndex(col => col.field === "note")

            for (const emp of employees) {
                const stats = employeeStatsMap.get(emp.id)
                if (stats) {
                    const empRow: Record<string, unknown> = {}
                    const displayName = getDisplayName(emp.id)
                    for (let i = 0; i < template.columns.length; i++) {
                        const col = template.columns[i]
                        if (i === 0) {
                            // First column gets employee name (anonymized if invoice)
                            empRow[col.header] = `${displayName}:`
                        } else if (i === hoursColumnIndex) {
                            // Hours column gets employee total hours
                            empRow[col.header] = stats.totalHours
                        } else if (templateId !== "invoice" && noteColumnIndex !== -1 && i === noteColumnIndex) {
                            // If note column exists and NOT invoice, put sick/vacation info there
                            empRow[col.header] = `${stats.sickDays} Krank, ${stats.vacationDays} Urlaub`
                        } else if (templateId !== "invoice" && noteColumnIndex === -1 && i === template.columns.length - 1) {
                            // Fallback: If no note column, use last column for sick/vacation info
                            // But only if it's not the hours column (to avoid overwriting)
                            if (i !== hoursColumnIndex) {
                                empRow[col.header] = `${stats.sickDays} Krank, ${stats.vacationDays} Urlaub`
                            } else {
                                empRow[col.header] = stats.totalHours
                            }
                        } else {
                            empRow[col.header] = ""
                        }
                    }
                    excelData.push(empRow)
                }
            }

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(excelData)

            // Column widths - dynamic based on template columns
            ws['!cols'] = template.columns.map(col => {
                // Estimate width based on header length
                const headerLength = col.header.length
                return { wch: Math.max(headerLength + 2, 10) }
            })

            XLSX.utils.book_append_sheet(wb, ws, `${month}_${year}`)
            const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

            return new NextResponse(excelBuffer, {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="${filename}_${templateId}.xlsx"`,
                },
            })
        }

        // =========================================================================
        // PDF Export (default)
        // =========================================================================

        // Build employee stats array (use anonymized names for invoice)
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
                employeeName: getDisplayName(emp.id),
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
                        // DSGVO: Use anonymized name for invoice template
                        employeeName: templateId === "invoice"
                            ? (anonymizedNameMap.get(sig.employeeId) || "Assistent ?")
                            : (sig.employee.name || "Unbekannt"),
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
            },
            isInvoice: templateId === "invoice"
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
