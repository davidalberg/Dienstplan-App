/**
 * Base Export Template Interface
 *
 * Defines the structure for export templates used in timesheet exports.
 * Supports different formats (XLSX, CSV) and customizable column mappings.
 */

export interface ExportColumn {
    header: string
    field: string // Nested path supported: "employee.name", "timesheet.date"
    transform?: (value: unknown, row?: Record<string, unknown>) => string // Optional transformation function
}

export interface ExportOptions {
    dateFormat: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY"
    decimalSeparator: "." | ","
    includeHeaders: boolean
    encoding: "UTF-8" | "ISO-8859-1"
    timeFormat?: "24h" | "12h" // Optional: 24-hour vs 12-hour time format
}

export interface ExportTemplate {
    id: string
    name: string
    format: "xlsx" | "csv"
    columns: ExportColumn[]
    options: ExportOptions
}

/**
 * Helper function to get nested field value from object
 * Supports dot notation: "employee.name", "team.client.fullName"
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (!path || !obj) return null

    const parts = path.split(".")
    let value: unknown = obj

    for (const part of parts) {
        if (value === null || value === undefined) return null
        value = (value as Record<string, unknown>)[part]
    }

    return value
}

/**
 * Format date according to template options
 */
export function formatDate(date: Date | string, format: ExportOptions["dateFormat"]): string {
    const d = typeof date === "string" ? new Date(date) : date

    const day = d.getDate().toString().padStart(2, "0")
    const month = (d.getMonth() + 1).toString().padStart(2, "0")
    const year = d.getFullYear()

    switch (format) {
        case "DD.MM.YYYY":
            return `${day}.${month}.${year}`
        case "MM/DD/YYYY":
            return `${month}/${day}/${year}`
        case "YYYY-MM-DD":
        default:
            return `${year}-${month}-${day}`
    }
}

/**
 * Format number according to decimal separator option
 */
export function formatNumber(value: number, decimalSeparator: "." | ",", decimals: number = 2): string {
    const formatted = value.toFixed(decimals)
    if (decimalSeparator === ",") {
        return formatted.replace(".", ",")
    }
    return formatted
}
