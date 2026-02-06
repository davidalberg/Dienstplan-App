import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"
import { de } from "date-fns/locale"

interface TimesheetEntry {
    date: Date
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    absenceType: string | null
    note: string | null
    status: string
    employeeName?: string // For multi-employee PDFs
}

interface MonthlyStats {
    totalHours: number
    plannedHours: number
    nightHours: number
    sundayHours: number
    holidayHours: number
    sickDays: number
    sickHours: number
    vacationDays: number
    vacationHours: number
}

interface EmployeeSignature {
    employeeName: string
    signature: string // Base64 PNG
    signedAt: Date
}

interface SignatureData {
    // OLD: Single employee (for backward compatibility)
    employeeName?: string
    employeeSignature?: string | null // Base64 PNG
    employeeSignedAt?: Date | null

    // NEW: Multiple employees (multi-employee system)
    employeeSignatures?: EmployeeSignature[]

    // Recipient (Assistenznehmer)
    recipientName?: string | null
    recipientSignature?: string | null // Base64 PNG
    recipientSignedAt?: Date | null

    // Manual release info
    manuallyReleased?: boolean
    releaseNote?: string | null
}

interface GeneratePdfOptions {
    employeeName: string
    teamName: string
    month: number
    year: number
    timesheets: TimesheetEntry[]
    stats: MonthlyStats
    signatures: SignatureData
    /** If true, only show employee signature (no Assistenznehmer field) */
    singleEmployee?: boolean
}

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

function calculateHoursFromTimes(start: string | null, end: string | null): number {
    if (!start || !end) return 0
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)
    let diff = (endH * 60 + endM) - (startH * 60 + startM)
    if (diff < 0) diff += 24 * 60
    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
    if (diff === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
        diff = 24 * 60
    }
    return diff / 60
}

/**
 * Format a time range for display (ensures 0:00 end is shown as 24:00)
 */
function formatTimeRangeForPdf(start: string | null, end: string | null): string {
    if (!start || !end) return "-"
    let displayEnd = end
    if (end === "0:00" || end === "00:00") {
        displayEnd = "24:00"
    }
    return `${start}-${displayEnd}`
}

/**
 * Ensure signature data is in a format jsPDF can handle.
 * Strips the data:image/png;base64, prefix if present and returns raw base64.
 */
function prepareSignatureForPdf(signature: string): string {
    if (signature.startsWith("data:image/png;base64,")) {
        return signature.substring("data:image/png;base64,".length)
    }
    if (signature.startsWith("data:image/")) {
        // Handle other image formats
        const commaIndex = signature.indexOf(",")
        if (commaIndex !== -1) {
            return signature.substring(commaIndex + 1)
        }
    }
    return signature
}

function formatDiff(planned: number, actual: number): string {
    const diff = actual - planned
    if (diff === 0) return "±0"
    return diff > 0 ? `+${diff.toFixed(1)}h` : `${diff.toFixed(1)}h`
}

export function generateTimesheetPdf(options: GeneratePdfOptions): ArrayBuffer {
    const { employeeName, teamName, month, year, timesheets, stats, signatures, singleEmployee = false } = options

    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15
    let yPos = margin

    // Header
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text("STUNDENNACHWEIS", pageWidth / 2, yPos, { align: "center" })
    yPos += 8

    doc.setFontSize(14)
    doc.setFont("helvetica", "normal")
    doc.text(`${MONTH_NAMES[month - 1]} ${year}`, pageWidth / 2, yPos, { align: "center" })
    yPos += 12

    // Info Box
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Mitarbeiter:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(employeeName, margin + 30, yPos)
    yPos += 5

    doc.setFont("helvetica", "bold")
    doc.text("Team:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(teamName, margin + 30, yPos)
    yPos += 5

    const daysInMonth = new Date(year, month, 0).getDate()
    doc.setFont("helvetica", "bold")
    doc.text("Zeitraum:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(`01.${String(month).padStart(2, "0")}.${year} - ${daysInMonth}.${String(month).padStart(2, "0")}.${year}`, margin + 30, yPos)
    yPos += 10

    // Horizontal line
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    // Table header
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("TAGESÜBERSICHT", margin, yPos)
    yPos += 5

    // Prepare table data
    const tableData: string[][] = []

    // Sort timesheets by date
    const sortedTimesheets = [...timesheets].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    for (const ts of sortedTimesheets) {
        const date = new Date(ts.date)
        const dayName = format(date, "EE", { locale: de })
        const dateStr = format(date, "dd.MM.", { locale: de })

        let plannedStr = "-"
        let actualStr = "-"
        let diffStr = "-"

        if (ts.absenceType === "SICK") {
            actualStr = "KRANK"
            diffStr = "-"
        } else if (ts.absenceType === "VACATION") {
            actualStr = "URLAUB"
            diffStr = "-"
        } else {
            if (ts.plannedStart && ts.plannedEnd) {
                plannedStr = formatTimeRangeForPdf(ts.plannedStart, ts.plannedEnd)
            }
            if (ts.actualStart && ts.actualEnd) {
                actualStr = formatTimeRangeForPdf(ts.actualStart, ts.actualEnd)
            } else if (["CONFIRMED", "CHANGED", "SUBMITTED"].includes(ts.status)) {
                actualStr = plannedStr // Use planned if confirmed but no actual times
            }

            if (ts.plannedStart && ts.plannedEnd) {
                const plannedHours = calculateHoursFromTimes(ts.plannedStart, ts.plannedEnd)
                const actualHours = ts.actualStart && ts.actualEnd
                    ? calculateHoursFromTimes(ts.actualStart, ts.actualEnd)
                    : (["CONFIRMED", "CHANGED", "SUBMITTED"].includes(ts.status) ? plannedHours : 0)
                diffStr = formatDiff(plannedHours, actualHours)
            }
        }

        tableData.push([
            `${dayName} ${dateStr}`,
            plannedStr,
            actualStr,
            diffStr,
            ts.note || ""
        ])
    }

    // Generate table
    autoTable(doc, {
        startY: yPos,
        head: [["Datum", "Soll", "Ist", "Diff", "Notiz"]],
        body: tableData,
        theme: "striped",
        headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 9
        },
        bodyStyles: {
            fontSize: 8,
            cellPadding: 2
        },
        columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 30 },
            2: { cellWidth: 30 },
            3: { cellWidth: 20 },
            4: { cellWidth: "auto" }
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
            // Footer on each page
            const pageCount = doc.internal.pages.length - 1
            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.text(
                `Seite ${data.pageNumber} von ${pageCount}`,
                pageWidth / 2,
                doc.internal.pageSize.getHeight() - 10,
                { align: "center" }
            )
        }
    })

    // Get the final Y position after the table
    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

    // Check if we need a new page for summary
    if (yPos > 220) {
        doc.addPage()
        yPos = margin
    }

    // Summary section
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("ZUSAMMENFASSUNG", margin, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")

    const summaryData: [string, string][] = [
        ["Geplante Stunden:", `${stats.plannedHours.toFixed(2)} Std.`],
        ["Tatsächliche Stunden:", `${stats.totalHours.toFixed(2)} Std.`],
        ["Differenz:", `${(stats.totalHours - stats.plannedHours) >= 0 ? "+" : ""}${(stats.totalHours - stats.plannedHours).toFixed(2)} Std.`],
    ]

    // Only add absence types if they have values > 0
    const hasAbsences = stats.sickDays > 0 || stats.vacationDays > 0
    if (hasAbsences) {
        summaryData.push(["", ""])  // Separator
        if (stats.sickDays > 0) {
            summaryData.push(["Krankheitstage:", `${stats.sickDays} Tage (${stats.sickHours.toFixed(2)} Std.)`])
        }
        if (stats.vacationDays > 0) {
            summaryData.push(["Urlaubstage:", `${stats.vacationDays} Tage (${stats.vacationHours.toFixed(2)} Std.)`])
        }
    }

    // Only add bonus hours if they have values > 0
    const hasBonusHours = stats.nightHours > 0 || stats.sundayHours > 0 || stats.holidayHours > 0
    if (hasBonusHours) {
        summaryData.push(["", ""])  // Separator
        if (stats.nightHours > 0) {
            summaryData.push(["Nachtstunden:", `${stats.nightHours.toFixed(2)} Std.`])
        }
        if (stats.sundayHours > 0) {
            summaryData.push(["Sonntagsstunden:", `${stats.sundayHours.toFixed(2)} Std.`])
        }
        if (stats.holidayHours > 0) {
            summaryData.push(["Feiertagsstunden:", `${stats.holidayHours.toFixed(2)} Std.`])
        }
    }

    for (const [label, value] of summaryData) {
        if (label === "") {
            yPos += 3
            continue
        }
        doc.setFont("helvetica", "bold")
        doc.text(label, margin, yPos)
        doc.setFont("helvetica", "normal")
        doc.text(value, margin + 50, yPos)
        yPos += 5
    }

    // Check if we need a new page for signatures
    if (yPos > 230) {
        doc.addPage()
        yPos = margin
    }

    yPos += 10

    // Signatures section
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("UNTERSCHRIFTEN", margin, yPos)
    yPos += 10

    const signatureWidth = 60
    const signatureHeight = 25

    // Check if multi-employee system (NEW) or single employee (OLD)
    const isMultiEmployee = signatures.employeeSignatures && signatures.employeeSignatures.length > 0

    if (isMultiEmployee) {
        // NEW: Multi-Employee Signatures (4 employees on left, 1 recipient on right)
        const leftColX = margin
        const rightColX = pageWidth / 2 + 10
        let leftYPos = yPos

        // Title for employees
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.text("Mitarbeiter:", leftColX, leftYPos)
        leftYPos += 5

        // Display all employee signatures (stacked vertically on left side)
        for (const empSig of signatures.employeeSignatures!) {
            // Add signature image
            if (empSig.signature) {
                try {
                    const sigData = prepareSignatureForPdf(empSig.signature)
                    doc.addImage(
                        sigData,
                        "PNG",
                        leftColX,
                        leftYPos,
                        signatureWidth,
                        signatureHeight
                    )
                } catch (e) {
                    console.error("Failed to add employee signature image:", e)
                }
            }

            // Draw signature line
            doc.setLineWidth(0.3)
            doc.line(leftColX, leftYPos + signatureHeight + 2, leftColX + signatureWidth, leftYPos + signatureHeight + 2)

            // Name and date
            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.text(empSig.employeeName, leftColX, leftYPos + signatureHeight + 6)
            doc.text(
                format(new Date(empSig.signedAt), "dd.MM.yyyy HH:mm", { locale: de }),
                leftColX,
                leftYPos + signatureHeight + 10
            )

            // Move down for next signature
            leftYPos += signatureHeight + 15
        }

        // Manual release note (if applicable)
        if (signatures.manuallyReleased && signatures.releaseNote) {
            doc.setFontSize(7)
            doc.setFont("helvetica", "italic")
            doc.setTextColor(200, 0, 0)
            doc.text(`Hinweis: ${signatures.releaseNote}`, leftColX, leftYPos)
            doc.setTextColor(0, 0, 0)
            leftYPos += 5
        }

        // Recipient signature (RIGHT SIDE - aligned with top of employee signatures)
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.text("Assistenznehmer:", rightColX, yPos)
        const recipientYPos = yPos + 5

        if (signatures.recipientSignature) {
            try {
                const sigData = prepareSignatureForPdf(signatures.recipientSignature)
                doc.addImage(
                    sigData,
                    "PNG",
                    rightColX,
                    recipientYPos,
                    signatureWidth,
                    signatureHeight
                )
            } catch (e) {
                console.error("Failed to add recipient signature image:", e)
            }
        }

        // Draw signature line
        doc.setLineWidth(0.3)
        doc.line(rightColX, recipientYPos + signatureHeight + 2, rightColX + signatureWidth, recipientYPos + signatureHeight + 2)

        // Name and date
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.text(signatures.recipientName || "Ausstehend", rightColX, recipientYPos + signatureHeight + 6)
        if (signatures.recipientSignedAt) {
            doc.text(
                format(new Date(signatures.recipientSignedAt), "dd.MM.yyyy HH:mm", { locale: de }),
                rightColX,
                recipientYPos + signatureHeight + 10
            )
        }

        // Update yPos to continue below signatures
        yPos = Math.max(leftYPos, recipientYPos + signatureHeight + 15)

    } else {
        // OLD: Single employee signature (backward compatibility)
        const leftColX = margin
        const rightColX = pageWidth / 2 + 10

        // Employee signature (left side)
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.text("Mitarbeiter:", leftColX, yPos)
        yPos += 3

        if (signatures.employeeSignature) {
            try {
                const sigData = prepareSignatureForPdf(signatures.employeeSignature)
                doc.addImage(
                    sigData,
                    "PNG",
                    leftColX,
                    yPos,
                    signatureWidth,
                    signatureHeight
                )
            } catch (e) {
                console.error("Failed to add employee signature image:", e)
            }
        }

        // Draw signature line
        doc.setLineWidth(0.3)
        doc.line(leftColX, yPos + signatureHeight + 2, leftColX + signatureWidth, yPos + signatureHeight + 2)

        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.text(signatures.employeeName || "Unbekannt", leftColX, yPos + signatureHeight + 7)
        if (signatures.employeeSignedAt) {
            doc.text(
                format(new Date(signatures.employeeSignedAt), "dd.MM.yyyy HH:mm", { locale: de }),
                leftColX,
                yPos + signatureHeight + 11
            )
        }

        // Recipient signature (right side) - only show if not singleEmployee mode
        if (!singleEmployee) {
            doc.setFontSize(9)
            doc.setFont("helvetica", "bold")
            doc.text("Assistenznehmer:", rightColX, yPos - 3)

            if (signatures.recipientSignature) {
                try {
                    const sigData = prepareSignatureForPdf(signatures.recipientSignature)
                    doc.addImage(
                        sigData,
                        "PNG",
                        rightColX,
                        yPos,
                        signatureWidth,
                        signatureHeight
                    )
                } catch (e) {
                    console.error("Failed to add recipient signature image:", e)
                }
            }

            // Draw signature line
            doc.line(rightColX, yPos + signatureHeight + 2, rightColX + signatureWidth, yPos + signatureHeight + 2)

            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.text(signatures.recipientName || "Ausstehend", rightColX, yPos + signatureHeight + 7)
            if (signatures.recipientSignedAt) {
                doc.text(
                    format(new Date(signatures.recipientSignedAt), "dd.MM.yyyy HH:mm", { locale: de }),
                    rightColX,
                    yPos + signatureHeight + 11
                )
            }
        }

        // Update yPos
        yPos += signatureHeight + 15
    }

    // Footer
    yPos = doc.internal.pageSize.getHeight() - 20
    doc.setFontSize(7)
    doc.setFont("helvetica", "italic")
    doc.text(
        `Generiert am ${format(new Date(), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}`,
        pageWidth / 2,
        yPos,
        { align: "center" }
    )

    return doc.output("arraybuffer")
}

// ============================================================================
// COMBINED TEAM PDF GENERATION
// ============================================================================

/**
 * A single timesheet entry for the combined team PDF.
 * All timesheets from all employees are merged into one chronological list.
 */
interface CombinedTimesheetEntry {
    date: Date
    employeeId: string
    employeeName: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    absenceType: string | null
    note: string | null
    status: string
    hours: number  // Pre-calculated hours for this entry
}

/**
 * Statistics for a single employee in the combined PDF.
 */
interface EmployeeStats {
    employeeId: string
    employeeName: string
    totalHours: number
    plannedHours: number
    sickDays: number
    vacationDays: number
    workDays: number
}

/**
 * Options for generating the combined team PDF.
 */
interface GenerateCombinedPdfOptions {
    teamName: string
    clientName: string
    month: number
    year: number
    timesheets: CombinedTimesheetEntry[]
    employeeStats: EmployeeStats[]
    totalHours: number
    signatures: {
        employees: Array<{
            employeeId: string
            employeeName: string
            signature: string  // Base64 PNG
            signedAt: Date
        }>
        client: {
            clientName: string
            signature: string | null  // Base64 PNG
            signedAt: Date | null
        }
    }
    /** If true, generates DSGVO-compliant invoice PDF (anonymized employees, no employee signatures) */
    isInvoice?: boolean
}

/**
 * Generates a combined PDF showing all employees' timesheets in one table.
 * Used for submitting to insurance providers (Traeger) who need to see
 * the entire team's work hours at once.
 *
 * @param options - Configuration for the combined PDF
 * @returns ArrayBuffer containing the PDF data
 */
export function generateCombinedTeamPdf(options: GenerateCombinedPdfOptions): ArrayBuffer {
    const {
        teamName,
        clientName,
        month,
        year,
        timesheets,
        employeeStats,
        totalHours,
        signatures,
        isInvoice = false
    } = options

    // Employee names are already anonymized by the export route when isInvoice=true
    // No additional anonymization needed here

    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    let yPos = margin

    // Calculate total planned hours from employee stats
    const totalPlannedHours = employeeStats.reduce((sum, emp) => sum + emp.plannedHours, 0)

    // -------------------------------------------------------------------------
    // HEADER SECTION
    // -------------------------------------------------------------------------
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text("KOMBINIERTER STUNDENNACHWEIS", pageWidth / 2, yPos, { align: "center" })
    yPos += 8

    doc.setFontSize(14)
    doc.setFont("helvetica", "normal")
    doc.text(`${MONTH_NAMES[month - 1]} ${year}`, pageWidth / 2, yPos, { align: "center" })
    yPos += 12

    // Info Box
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Klient:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(clientName, margin + 25, yPos)
    yPos += 5

    const daysInMonth = new Date(year, month, 0).getDate()
    doc.setFont("helvetica", "bold")
    doc.text("Zeitraum:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(
        `01.${String(month).padStart(2, "0")}.${year} - ${daysInMonth}.${String(month).padStart(2, "0")}.${year}`,
        margin + 25,
        yPos
    )
    yPos += 10

    // Horizontal line
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    // -------------------------------------------------------------------------
    // TABLE SECTION
    // -------------------------------------------------------------------------
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("TAGESÜBERSICHT - ALLE MITARBEITER", margin, yPos)
    yPos += 5

    // Sort ALL timesheets chronologically, then by employee name
    const sortedTimesheets = [...timesheets].sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime()
        if (dateCompare !== 0) return dateCompare
        return a.employeeName.localeCompare(b.employeeName)
    })

    // Prepare table data
    const tableData: string[][] = []

    for (const ts of sortedTimesheets) {
        const date = new Date(ts.date)
        const dayName = format(date, "EE", { locale: de })
        const dateStr = format(date, "dd.MM.", { locale: de })

        let plannedStr = "-"
        let actualStr = "-"
        let hoursStr = "0.00h"

        if (ts.absenceType === "SICK") {
            actualStr = "KRANK"
            hoursStr = "-"
        } else if (ts.absenceType === "VACATION") {
            actualStr = "URLAUB"
            hoursStr = "-"
        } else {
            if (ts.plannedStart && ts.plannedEnd) {
                plannedStr = formatTimeRangeForPdf(ts.plannedStart, ts.plannedEnd)
            }
            if (ts.actualStart && ts.actualEnd) {
                actualStr = formatTimeRangeForPdf(ts.actualStart, ts.actualEnd)
            } else if (["CONFIRMED", "CHANGED", "SUBMITTED"].includes(ts.status)) {
                // Use planned times if confirmed but no actual times recorded
                actualStr = plannedStr
            }
            hoursStr = `${ts.hours.toFixed(2)}h`
        }

        tableData.push([
            `${dayName} ${dateStr}`,
            ts.employeeName,
            plannedStr,
            actualStr,
            hoursStr,
            ts.note || ""
        ])
    }

    // Generate table with violet header (distinct from single-employee blue)
    autoTable(doc, {
        startY: yPos,
        head: [["Datum", "Mitarbeiter", "Geplant", "Tatsächlich", "Stunden", "Notiz"]],
        body: tableData,
        theme: "striped",
        headStyles: {
            fillColor: [139, 92, 246],  // Violet to distinguish from single employee PDF
            textColor: 255,
            fontStyle: "bold",
            fontSize: 9
        },
        bodyStyles: {
            fontSize: 8,
            cellPadding: 2
        },
        columnStyles: {
            0: { cellWidth: 25 },      // Datum
            1: { cellWidth: 30 },      // Mitarbeiter
            2: { cellWidth: 30 },      // Geplant
            3: { cellWidth: 30 },      // Tatsächlich
            4: { cellWidth: 20 },      // Stunden
            5: { cellWidth: "auto" }   // Notiz
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
            // Footer on each page
            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.text(
                `Seite ${data.pageNumber}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: "center" }
            )
        }
    })

    // Get the final Y position after the table
    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

    // -------------------------------------------------------------------------
    // SUMMARY SECTION
    // -------------------------------------------------------------------------

    // Check if we need a new page for summary
    if (yPos > 220) {
        doc.addPage()
        yPos = margin
    }

    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("ZUSAMMENFASSUNG", margin, yPos)
    yPos += 8

    // Overall planned vs. actual hours (like single-employee PDF)
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Geplante Stunden:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(`${totalPlannedHours.toFixed(2)} Std.`, margin + 50, yPos)
    yPos += 5

    doc.setFont("helvetica", "bold")
    doc.text("Tatsächliche Stunden:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(`${totalHours.toFixed(2)} Std.`, margin + 50, yPos)
    yPos += 5

    doc.setFont("helvetica", "bold")
    doc.text("Differenz:", margin, yPos)
    doc.setFont("helvetica", "normal")
    const diff = totalHours - totalPlannedHours
    doc.text(`${diff >= 0 ? "+" : ""}${diff.toFixed(2)} Std.`, margin + 50, yPos)
    yPos += 8

    // Separator line
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 6

    // Per-employee breakdown
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Mitarbeiter:", margin, yPos)
    yPos += 6

    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")

    for (const empStat of employeeStats) {
        let line: string
        if (isInvoice) {
            // DSGVO-compliant: name already anonymized by export route, no sick/vacation days
            line = `- ${empStat.employeeName}:  ${empStat.totalHours.toFixed(2)} Std.`
        } else {
            const sickText = empStat.sickDays === 1 ? "Krankheitstag" : "Krankheitstage"
            const vacationText = empStat.vacationDays === 1 ? "Urlaubstag" : "Urlaubstage"
            line = `- ${empStat.employeeName}:  ${empStat.totalHours.toFixed(2)} Std. (${empStat.sickDays} ${sickText}, ${empStat.vacationDays} ${vacationText})`
        }
        doc.text(line, margin + 5, yPos)
        yPos += 5
    }

    yPos += 2

    // -------------------------------------------------------------------------
    // SIGNATURES SECTION
    // -------------------------------------------------------------------------

    // Check if we need a new page for signatures
    if (yPos > 230) {
        doc.addPage()
        yPos = margin
    }

    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("UNTERSCHRIFTEN", margin, yPos)
    yPos += 8

    const signatureBoxWidth = 50
    const signatureBoxHeight = 25
    const signatureGap = 10

    // Employee signatures section - only show if NOT invoice (DSGVO compliance)
    if (!isInvoice) {
        doc.setFontSize(10)
        doc.text("Mitarbeiter:", margin, yPos)
        yPos += 8

        const signaturesPerRow = Math.floor((pageWidth - 2 * margin + signatureGap) / (signatureBoxWidth + signatureGap))

        let xPos = margin
        let rowCount = 0

        for (const empSig of signatures.employees) {
            // Check if we need a new row or page
            if (rowCount >= signaturesPerRow) {
                xPos = margin
                yPos += signatureBoxHeight + 15
                rowCount = 0
            }

            // Check if we need a new page
            if (yPos + signatureBoxHeight + 15 > pageHeight - 30) {
                doc.addPage()
                yPos = margin
                xPos = margin
                rowCount = 0

                // Re-add section header on new page
                doc.setFontSize(10)
                doc.setFont("helvetica", "bold")
                doc.text("Mitarbeiter (Fortsetzung):", margin, yPos)
                yPos += 8
            }

            // Draw signature box
            doc.setLineWidth(0.3)
            doc.rect(xPos, yPos, signatureBoxWidth, signatureBoxHeight)

            // Add signature image if available
            if (empSig.signature) {
                try {
                    const sigData = prepareSignatureForPdf(empSig.signature)
                    doc.addImage(
                        sigData,
                        "PNG",
                        xPos + 2,
                        yPos + 2,
                        signatureBoxWidth - 4,
                        signatureBoxHeight - 4
                    )
                } catch (error) {
                    console.error("Error adding employee signature:", error)
                }
            }

            // Employee name and date below signature
            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            const signedDateStr = format(new Date(empSig.signedAt), "dd.MM.yyyy", { locale: de })
            doc.text(
                empSig.employeeName,
                xPos + signatureBoxWidth / 2,
                yPos + signatureBoxHeight + 4,
                { align: "center" }
            )
            doc.text(
                signedDateStr,
                xPos + signatureBoxWidth / 2,
                yPos + signatureBoxHeight + 8,
                { align: "center" }
            )

            xPos += signatureBoxWidth + signatureGap
            rowCount++
        }

        // Move down after employee signatures
        if (rowCount > 0) {
            yPos += signatureBoxHeight + 15
        }

        // Check if we need a new page for client signature
        if (yPos > pageHeight - 60) {
            doc.addPage()
            yPos = margin
        }

        yPos += 5
    }

    // Client signature section
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Klient:", margin, yPos)
    yPos += 8

    // Draw client signature box (larger)
    const clientBoxWidth = 70
    const clientBoxHeight = 30

    doc.setLineWidth(0.3)
    doc.rect(margin, yPos, clientBoxWidth, clientBoxHeight)

    // Add client signature image if available
    if (signatures.client.signature && signatures.client.signedAt) {
        try {
            const sigData = prepareSignatureForPdf(signatures.client.signature)
            doc.addImage(
                sigData,
                "PNG",
                margin + 2,
                yPos + 2,
                clientBoxWidth - 4,
                clientBoxHeight - 4
            )
        } catch (error) {
            console.error("Error adding client signature:", error)
        }
    }

    // Client name and date below signature
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")

    if (signatures.client.signedAt) {
        const clientSignedDateStr = format(new Date(signatures.client.signedAt), "dd.MM.yyyy", { locale: de })
        doc.text(
            signatures.client.clientName,
            margin + clientBoxWidth / 2,
            yPos + clientBoxHeight + 4,
            { align: "center" }
        )
        doc.text(
            clientSignedDateStr,
            margin + clientBoxWidth / 2,
            yPos + clientBoxHeight + 8,
            { align: "center" }
        )
    } else {
        doc.setFont("helvetica", "italic")
        doc.text(
            "Noch nicht unterschrieben",
            margin + clientBoxWidth / 2,
            yPos + clientBoxHeight + 5,
            { align: "center" }
        )
    }

    // -------------------------------------------------------------------------
    // FOOTER
    // -------------------------------------------------------------------------
    yPos = pageHeight - 20
    doc.setFontSize(7)
    doc.setFont("helvetica", "italic")
    doc.text(
        `Generiert am ${format(new Date(), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}`,
        pageWidth / 2,
        yPos,
        { align: "center" }
    )

    return doc.output("arraybuffer")
}
