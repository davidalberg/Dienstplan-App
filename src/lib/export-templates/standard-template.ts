import { ExportTemplate, formatDate, formatNumber } from "./base-template"

/**
 * Standard Export Template
 *
 * Default format used in the app - matches current CSV/Excel export structure.
 */
export const standardTemplate: ExportTemplate = {
    id: "standard",
    name: "Standard",
    format: "xlsx",
    columns: [
        {
            header: "Datum",
            field: "date",
            transform: (value) => formatDate(value as string | Date, "DD.MM.YYYY")
        },
        {
            header: "Wochentag",
            field: "weekday"
        },
        {
            header: "Mitarbeiter",
            field: "employeeName"
        },
        {
            header: "Geplant Start",
            field: "plannedStart",
            transform: (value) => (value as string) || "-"
        },
        {
            header: "Geplant Ende",
            field: "plannedEnd",
            transform: (value) => (value as string) || "-"
        },
        {
            header: "Tatsächlich Start",
            field: "actualStart",
            transform: (value) => (value as string) || "-"
        },
        {
            header: "Tatsächlich Ende",
            field: "actualEnd",
            transform: (value) => (value as string) || "-"
        },
        {
            header: "Stunden",
            field: "hours",
            transform: (value, row) => {
                if (row?.absenceType === "SICK") return "Krank"
                if (row?.absenceType === "VACATION") return "Urlaub"
                return formatNumber(value as number, ".", 2)
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
        decimalSeparator: ".",
        includeHeaders: true,
        encoding: "UTF-8"
    }
}
