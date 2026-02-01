import { ExportTemplate, formatDate, formatNumber } from "./base-template"

/**
 * Simple Export Template (Einfach)
 *
 * Minimal template showing only essential information:
 * - Date
 * - Employee Name
 * - Total Hours
 *
 * Ideal for quick overviews and simple payroll summaries.
 */
export const simpleTemplate: ExportTemplate = {
    id: "simple",
    name: "Einfach",
    format: "xlsx",
    columns: [
        {
            header: "Datum",
            field: "date",
            transform: (value) => formatDate(value, "DD.MM.YYYY")
        },
        {
            header: "Mitarbeiter",
            field: "employeeName"
        },
        {
            header: "Stunden",
            field: "hours",
            transform: (value, row) => {
                if (row?.absenceType === "SICK") return "Krank"
                if (row?.absenceType === "VACATION") return "Urlaub"
                return formatNumber(value, ",", 2) // German decimal separator
            }
        }
    ],
    options: {
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ",",
        includeHeaders: true,
        encoding: "UTF-8"
    }
}
