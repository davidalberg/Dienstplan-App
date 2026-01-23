/**
 * TypeScript Type Definitions
 *
 * Centralized type definitions for the entire application
 */

// User Roles
export type UserRole = "ADMIN" | "TEAMLEAD" | "EMPLOYEE"

// Timesheet Status
export type TimesheetStatus = "PLANNED" | "CONFIRMED" | "CHANGED" | "SUBMITTED"

// Absence Types
export type AbsenceType = "SICK" | "VACATION" | null

// Travel Cost Types
export type TravelCostType = "DEUTSCHLANDTICKET" | "AUTO" | "NONE"

/**
 * Authenticated User (from session)
 */
export interface AuthUser {
    id: string
    email: string
    name: string
    role: UserRole
    teamId?: string
}

/**
 * User/Employee from Database
 */
export interface User {
    id: string
    email: string
    password?: string
    name: string
    role: UserRole
    employeeId: string | null
    entryDate: Date | null
    exitDate: Date | null
    hourlyWage: number
    travelCostType: TravelCostType
    nightPremiumEnabled: boolean
    nightPremiumPercent: number
    sundayPremiumEnabled: boolean
    sundayPremiumPercent: number
    holidayPremiumEnabled: boolean
    holidayPremiumPercent: number
    assignedSheetId: string | null
    assignedPlanTab: string | null
    teamId: string | null
    createdAt: Date
    updatedAt: Date
}

/**
 * Timesheet Entry
 */
export interface Timesheet {
    id: string
    employeeId: string
    date: Date
    month: number
    year: number
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    breakMinutes: number
    note: string | null
    absenceType: AbsenceType
    status: TimesheetStatus
    source: string | null
    sheetId: string | null
    sheetFileName: string | null
    syncVerified: boolean
    lastUpdatedBy: string | null
    lastUpdatedAt: Date | null
    teamId: string | null
    createdAt: Date
    updatedAt: Date
}

/**
 * Timesheet with Employee data (for exports/reports)
 */
export interface TimesheetWithEmployee extends Timesheet {
    employee: {
        name: string
        email: string
        employeeId: string | null
        entryDate: Date | null
        exitDate: Date | null
        hourlyWage: number
        travelCostType: TravelCostType
        nightPremiumEnabled: boolean
        nightPremiumPercent: number
        sundayPremiumEnabled: boolean
        sundayPremiumPercent: number
        holidayPremiumEnabled: boolean
        holidayPremiumPercent: number
    }
}

/**
 * Audit Log Entry
 */
export interface AuditLog {
    id: string
    employeeId: string
    date: Date
    changedBy: string
    field: string
    oldValue: string | null
    newValue: string | null
    createdAt: Date
}

/**
 * Sync Log Entry
 */
export interface SyncLog {
    id: string
    status: "RUNNING" | "SUCCESS" | "ERROR"
    message: string | null
    rowsProcessed: number | null
    startedAt: Date
    completedAt: Date | null
}

/**
 * Team
 */
export interface Team {
    id: string
    name: string
    createdAt: Date
    updatedAt: Date
}

/**
 * Monthly Hours Summary
 */
export interface MonthlyHoursSummary {
    totalRegularHours: number
    totalNightHours: number
    totalSundayHours: number
    totalHolidayHours: number
    totalSickHours: number
    totalVacationHours: number
}

/**
 * API Error Response
 */
export interface ApiError {
    error: string
    details?: string
}

/**
 * API Success Response
 */
export interface ApiSuccess<T = any> {
    success: boolean
    data?: T
    message?: string
}
