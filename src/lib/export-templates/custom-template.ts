import { ExportTemplate, formatDate, formatNumber } from "./base-template"

/**
 * Custom Export Template
 *
 * Flexible template with all available fields for custom exports.
 * Can be used as a base for creating organization-specific templates.
 */
export const customTemplate: ExportTemplate = {
    id: "custom",
    name: "Custom (All Fields)",
    format: "xlsx",
    columns: [
        {
            header: "Employee ID",
            field: "employeeId"
        },
        {
            header: "Employee Name",
            field: "employeeName"
        },
        {
            header: "Date",
            field: "date",
            transform: (value) => formatDate(value, "YYYY-MM-DD")
        },
        {
            header: "Weekday",
            field: "weekday"
        },
        {
            header: "Planned Start",
            field: "plannedStart",
            transform: (value) => value || "-"
        },
        {
            header: "Planned End",
            field: "plannedEnd",
            transform: (value) => value || "-"
        },
        {
            header: "Actual Start",
            field: "actualStart",
            transform: (value) => value || "-"
        },
        {
            header: "Actual End",
            field: "actualEnd",
            transform: (value) => value || "-"
        },
        {
            header: "Hours",
            field: "hours",
            transform: (value) => formatNumber(value, ".", 2)
        },
        {
            header: "Absence Type",
            field: "absenceType",
            transform: (value) => {
                if (value === "SICK") return "Sick"
                if (value === "VACATION") return "Vacation"
                return "-"
            }
        },
        {
            header: "Status",
            field: "status"
        },
        {
            header: "Note",
            field: "note",
            transform: (value) => value || ""
        }
    ],
    options: {
        dateFormat: "YYYY-MM-DD",
        decimalSeparator: ".",
        includeHeaders: true,
        encoding: "UTF-8"
    }
}
