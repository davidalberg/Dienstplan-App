/**
 * Shared constants for the application
 */

// All active timesheet statuses (including COMPLETED)
export const ALL_TIMESHEET_STATUSES = ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] as const

// Active timesheet statuses (excluding COMPLETED)
export const ACTIVE_TIMESHEET_STATUSES = ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] as const

// Statuses before submission (not yet submitted or completed)
export const PRE_SUBMISSION_STATUSES = ["PLANNED", "CONFIRMED", "CHANGED"] as const

// Confirmed statuses ready for submission (employee has confirmed/changed but not yet submitted)
export const CONFIRMED_TIMESHEET_STATUSES = ["CONFIRMED", "CHANGED"] as const

// Statuses where work was confirmed - used for planned-time fallback in PDFs and sign pages
export const WORKED_TIMESHEET_STATUSES = ["CONFIRMED", "CHANGED", "SUBMITTED"] as const

// Password validation rules
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const PASSWORD_RULES = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
} as const

// Input length limits
export const INPUT_LIMITS = {
    name: 100,
    email: 255,
    note: 500,
} as const

export function validatePassword(password: string): { valid: boolean; error: string | null } {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: "Passwort ist erforderlich" }
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        return { valid: false, error: `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein` }
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
        return { valid: false, error: `Passwort darf maximal ${PASSWORD_MAX_LENGTH} Zeichen lang sein` }
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: "Passwort muss mindestens einen Großbuchstaben enthalten" }
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: "Passwort muss mindestens einen Kleinbuchstaben enthalten" }
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: "Passwort muss mindestens eine Zahl enthalten" }
    }
    return { valid: true, error: null }
}
