/**
 * Time Utility Functions
 *
 * Centralized time parsing and calculation logic to eliminate code duplication.
 */

/**
 * Parse a time string (HH:MM format) into total minutes since midnight
 * @param timeStr Time string in HH:MM format
 * @returns Total minutes, or null if invalid
 */
export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
    if (!timeStr) return null

    const parts = timeStr.split(":")
    if (parts.length !== 2) return null

    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)

    if (isNaN(hours) || isNaN(minutes)) return null

    // Allow 24:00 as a special case (midnight at end of day)
    if (hours === 24 && minutes === 0) return 24 * 60

    // Standard validation: hours 0-23, minutes 0-59
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

    return hours * 60 + minutes
}

/**
 * Calculate duration in minutes between two time strings
 * Handles overnight shifts (e.g., 23:00 to 06:00)
 * Handles 24-hour shifts (e.g., 0:00 to 0:00 = 24 hours)
 * @param start Start time (HH:MM)
 * @param end End time (HH:MM)
 * @returns Duration in minutes, or null if invalid times
 */
export function calculateMinutesBetween(start: string | null, end: string | null): number | null {
    const startMinutes = parseTimeToMinutes(start)
    const endMinutes = parseTimeToMinutes(end)

    if (startMinutes === null || endMinutes === null) return null

    let diff = endMinutes - startMinutes

    // Handle overnight shifts
    if (diff < 0) {
        diff += 24 * 60
    }

    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
    if (diff === 0 && startMinutes === 0 && endMinutes === 0) {
        diff = 24 * 60
    }

    return diff
}

/**
 * Convert minutes to hours with decimal places
 * @param minutes Total minutes
 * @param decimals Number of decimal places (default: 2)
 * @returns Hours as string with specified decimal places
 */
export function minutesToHours(minutes: number, decimals: number = 2): string {
    return (minutes / 60).toFixed(decimals)
}

/**
 * Format minutes as HH:MM string
 * @param minutes Total minutes
 * @returns Formatted time string
 */
export function formatMinutesAsTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Validate time string format
 * @param timeStr Time string to validate
 * @returns true if valid HH:MM format
 */
export function isValidTimeFormat(timeStr: string | null | undefined): boolean {
    if (!timeStr) return false

    // Allow 24:00 as a special case (midnight at end of day)
    if (timeStr === '24:00') return true

    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    return timeRegex.test(timeStr)
}

/**
 * Format a time range for display
 * Ensures 24:00 is displayed correctly (not as 0:00)
 * Examples:
 *   - "0:00" to "0:00" → "0:00 - 24:00" (24-hour shift)
 *   - "18:00" to "0:00" → "18:00 - 24:00" (evening to midnight)
 *   - "8:00" to "16:00" → "8:00 - 16:00" (normal shift)
 * @param start Start time (HH:MM)
 * @param end End time (HH:MM)
 * @returns Formatted time range string
 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
    if (!start || !end) return "-"

    // Normalize end time: 0:00 → 24:00 when it represents midnight end of day
    let displayEnd = end
    if (end === "0:00" || end === "00:00") {
        // If end is 0:00/00:00, it means midnight = end of day = 24:00
        displayEnd = "24:00"
    }

    return `${start} - ${displayEnd}`
}

/**
 * Hours breakdown by type (work, vacation, sick)
 */
export interface HoursBreakdown {
    workHours: number
    vacationHours: number
    sickHours: number
    totalHours: number
}

/**
 * Calculate hours breakdown from a list of timesheets
 * Separates work hours from vacation and sick hours
 * @param timesheets Array of timesheet objects with times and absenceType
 * @returns HoursBreakdown with separate totals for each type
 */
export function calculateHoursBreakdown(timesheets: Array<{
    actualStart?: string | null
    actualEnd?: string | null
    absenceType?: string | null
    breakMinutes?: number | null
}>): HoursBreakdown {
    let workMinutes = 0
    let vacationMinutes = 0
    let sickMinutes = 0

    for (const ts of timesheets) {
        if (ts.actualStart && ts.actualEnd) {
            const rawMinutes = calculateMinutesBetween(ts.actualStart, ts.actualEnd)
            if (rawMinutes !== null && rawMinutes > 0) {
                const minutes = Math.max(0, rawMinutes - (ts.breakMinutes || 0))
                if (ts.absenceType === 'VACATION') {
                    vacationMinutes += minutes
                } else if (ts.absenceType === 'SICK') {
                    sickMinutes += minutes
                } else {
                    workMinutes += minutes
                }
            }
        }
    }

    return {
        workHours: workMinutes / 60,
        vacationHours: vacationMinutes / 60,
        sickHours: sickMinutes / 60,
        totalHours: (workMinutes + vacationMinutes + sickMinutes) / 60
    }
}

/**
 * Calculate total hours from a list of timesheets with actual times
 * NOTE: This function includes ALL hours (work + vacation + sick).
 * For work-only hours, use calculateHoursBreakdown().workHours
 * @param timesheets Array of timesheet objects with actualStart and actualEnd
 * @returns Total hours as decimal string
 */
export function calculateTotalHoursFromTimesheets(timesheets: Array<{
    actualStart?: string | null
    actualEnd?: string | null
}>): string {
    let totalMinutes = 0

    for (const ts of timesheets) {
        if (ts.actualStart && ts.actualEnd) {
            const minutes = calculateMinutesBetween(ts.actualStart, ts.actualEnd)
            if (minutes !== null) {
                totalMinutes += minutes
            }
        }
    }

    return minutesToHours(totalMinutes)
}
