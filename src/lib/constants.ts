/**
 * Shared constants for the application
 */

// All active timesheet statuses (including COMPLETED)
export const ALL_TIMESHEET_STATUSES = ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] as const

// Active timesheet statuses (excluding COMPLETED)
export const ACTIVE_TIMESHEET_STATUSES = ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] as const
