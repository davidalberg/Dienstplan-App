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
    breakMinutes: number
    employeeName?: string // NEW: For multi-employee PDFs
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
    return diff / 60
}

function formatDiff(planned: number, actual: number): string {
    const diff = actual - planned
    if (diff === 0) return "±0"
    return diff > 0 ? `+${diff.toFixed(1)}h` : `${diff.toFixed(1)}h`
}

export function generateTimesheetPdf(options: GeneratePdfOptions): ArrayBuffer {
    const { employeeName, teamName, month, year, timesheets, stats, signatures } = options

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
                plannedStr = `${ts.plannedStart}-${ts.plannedEnd}`
            }
            if (ts.actualStart && ts.actualEnd) {
                actualStr = `${ts.actualStart}-${ts.actualEnd}`
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
    yPos = (doc as any).lastAutoTable.finalY + 10

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

    const summaryData = [
        ["Geplante Stunden:", `${stats.plannedHours.toFixed(2)} Std.`],
        ["Tatsächliche Stunden:", `${stats.totalHours.toFixed(2)} Std.`],
        ["Differenz:", `${(stats.totalHours - stats.plannedHours) >= 0 ? "+" : ""}${(stats.totalHours - stats.plannedHours).toFixed(2)} Std.`],
        ["", ""],
        ["Krankheitstage:", `${stats.sickDays} Tage (${stats.sickHours.toFixed(2)} Std.)`],
        ["Urlaubstage:", `${stats.vacationDays} Tage (${stats.vacationHours.toFixed(2)} Std.)`],
        ["Nachtstunden:", `${stats.nightHours.toFixed(2)} Std.`],
        ["Sonntagsstunden:", `${stats.sundayHours.toFixed(2)} Std.`],
        ["Feiertagsstunden:", `${stats.holidayHours.toFixed(2)} Std.`],
    ]

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
                    doc.addImage(
                        empSig.signature,
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
                doc.addImage(
                    signatures.recipientSignature,
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
                doc.addImage(
                    signatures.employeeSignature,
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

        // Recipient signature (right side)
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.text("Assistenznehmer:", rightColX, yPos - 3)

        if (signatures.recipientSignature) {
            try {
                doc.addImage(
                    signatures.recipientSignature,
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

export function generatePdfDataUrl(options: GeneratePdfOptions): string {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    })

    // Re-use the same generation logic but return data URL
    const arrayBuffer = generateTimesheetPdf(options)
    const blob = new Blob([arrayBuffer], { type: "application/pdf" })

    // For data URL we need to regenerate using the doc's built-in method
    // This is a simplified approach - the full PDF is generated in generateTimesheetPdf
    return doc.output("dataurlstring")
}
