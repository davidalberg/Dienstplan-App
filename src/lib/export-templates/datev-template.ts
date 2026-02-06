import { ExportTemplate, formatDate, formatNumber } from "./base-template"

/**
 * DATEV Export Template
 *
 * Tailored for DATEV accounting software used in Germany.
 *
 * Key differences from standard:
 * - ISO-8859-1 encoding (required by DATEV)
 * - Comma as decimal separator (German format)
 * - Additional columns: Personalnummer, Lohnart
 * - Date format: DD.MM.YYYY (German standard)
 * - Specific column order required by DATEV import
 */
export const datevTemplate: ExportTemplate = {
    id: "datev",
    name: "DATEV",
    format: "csv",
    columns: [
        {
            header: "Personalnummer",
            field: "employeeId",
            transform: (value) => (value as string) || ""
        },
        {
            header: "Name",
            field: "employeeName"
        },
        {
            header: "Datum",
            field: "date",
            transform: (value) => formatDate(value as string | Date, "DD.MM.YYYY")
        },
        {
            header: "Von",
            field: "actualStart",
            transform: (value, row) => {
                if (row?.absenceType) return ""
                return (value as string) || (row?.plannedStart as string) || ""
            }
        },
        {
            header: "Bis",
            field: "actualEnd",
            transform: (value, row) => {
                if (row?.absenceType) return ""
                return (value as string) || (row?.plannedEnd as string) || ""
            }
        },
        {
            header: "Stunden",
            field: "hours",
            transform: (value, row) => {
                if (row?.absenceType === "SICK") return "0"
                if (row?.absenceType === "VACATION") return "0"
                return formatNumber(value as number, ",", 2) // German comma separator
            }
        },
        {
            header: "Lohnart",
            field: "absenceType",
            transform: (value, row) => {
                // Map absence types to DATEV wage types
                if (value === "SICK") return "200" // DATEV code for sick leave
                if (value === "VACATION") return "210" // DATEV code for vacation

                // Check if it's a night shift, weekend, or holiday (would require premium-calculator)
                // For now, default to "100" (normal working hours)
                return "100"
            }
        },
        {
            header: "Bemerkung",
            field: "note",
            transform: (value) => (value as string) || ""
        }
    ],
    options: {
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ",", // German standard
        includeHeaders: true,
        encoding: "ISO-8859-1" // Required by DATEV
    }
}

/**
 * DATEV Export Notes:
 *
 * Lohnart (Wage Type) Codes:
 * - 100: Normal working hours
 * - 110: Night premium hours (25%)
 * - 120: Sunday premium hours (30%)
 * - 130: Holiday premium hours (125%)
 * - 200: Sick leave (paid)
 * - 210: Vacation
 * - 300: Overtime
 *
 * Future Enhancement: Integrate with premium-calculator.ts to automatically
 * detect premium hours and assign correct Lohnart codes.
 */
