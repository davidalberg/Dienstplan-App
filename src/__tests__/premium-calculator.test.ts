/**
 * Unit Tests for premium-calculator.ts
 *
 * Tests cover:
 * - NRW holiday detection (2026-2035)
 * - Sunday detection
 * - Total hours calculation (normal, overnight, 24h)
 * - Night hours calculation (23:00-06:00 window)
 * - Monthly data aggregation (status filtering, absences, premiums)
 * - Backup statistics (backup days, hours, premium attribution)
 * - CRITICAL: Holiday-Sunday double-counting prevention (else-if fix)
 *
 * IMPORTANT: All test Date objects use 'T12:00:00Z' format to avoid
 * timezone issues with .toISOString().split('T')[0] inside the functions.
 */

import { describe, it, expect } from 'vitest'
import {
    isNRWHoliday,
    isSundayDate,
    calculateTotalHours,
    calculateNightHours,
    calculateBackupStats,
    aggregateMonthlyData,
} from '@/lib/premium-calculator'

// ---------------------------------------------------------------------------
// Helper: create a Date that survives .toISOString().split('T')[0] correctly
// Using noon UTC avoids midnight rollover issues in any timezone.
// ---------------------------------------------------------------------------
function dateUTC(isoDate: string): Date {
    return new Date(`${isoDate}T12:00:00Z`)
}

// ---------------------------------------------------------------------------
// Default employee config with all premiums enabled
// ---------------------------------------------------------------------------
const ALL_PREMIUMS_ENABLED = {
    nightPremiumEnabled: true,
    sundayPremiumEnabled: true,
    holidayPremiumEnabled: true,
}

const ALL_PREMIUMS_DISABLED = {
    nightPremiumEnabled: false,
    sundayPremiumEnabled: false,
    holidayPremiumEnabled: false,
}

const FULL_EMPLOYEE = {
    id: 'emp-001',
    hourlyWage: 15,
    nightPremiumEnabled: true,
    nightPremiumPercent: 25,
    sundayPremiumEnabled: true,
    sundayPremiumPercent: 25,
    holidayPremiumEnabled: true,
    holidayPremiumPercent: 100,
}

// ===================================================================
// 1. isNRWHoliday
// ===================================================================
describe('isNRWHoliday', () => {
    it('returns true for Neujahr 2026 (2026-01-01, Thursday)', () => {
        expect(isNRWHoliday(dateUTC('2026-01-01'))).toBe(true)
    })

    it('returns true for Ostermontag 2026 (2026-04-06, Monday)', () => {
        expect(isNRWHoliday(dateUTC('2026-04-06'))).toBe(true)
    })

    it('returns true for Tag der Arbeit 2026 (2026-05-01)', () => {
        expect(isNRWHoliday(dateUTC('2026-05-01'))).toBe(true)
    })

    it('returns true for 1. Weihnachtsfeiertag 2026 (2026-12-25)', () => {
        expect(isNRWHoliday(dateUTC('2026-12-25'))).toBe(true)
    })

    it('returns true for Neujahr 2028 (2028-01-01, Saturday)', () => {
        expect(isNRWHoliday(dateUTC('2028-01-01'))).toBe(true)
    })

    it('returns true for Neujahr 2034 (2034-01-01, Sunday) - holiday on Sunday', () => {
        expect(isNRWHoliday(dateUTC('2034-01-01'))).toBe(true)
    })

    it('returns true for last supported year 2035 (2035-01-01)', () => {
        expect(isNRWHoliday(dateUTC('2035-01-01'))).toBe(true)
    })

    it('returns false for a normal weekday (2026-01-02, Friday)', () => {
        expect(isNRWHoliday(dateUTC('2026-01-02'))).toBe(false)
    })

    it('returns false for a weekend non-holiday (2026-01-03, Saturday)', () => {
        expect(isNRWHoliday(dateUTC('2026-01-03'))).toBe(false)
    })

    it('returns false for a Sunday that is NOT a holiday (2026-04-05)', () => {
        expect(isNRWHoliday(dateUTC('2026-04-05'))).toBe(false)
    })

    it('returns false for a date outside the 2026-2035 range (2025-01-01)', () => {
        expect(isNRWHoliday(dateUTC('2025-01-01'))).toBe(false)
    })

    it('returns false for a date outside the 2026-2035 range (2036-01-01)', () => {
        expect(isNRWHoliday(dateUTC('2036-01-01'))).toBe(false)
    })
})

// ===================================================================
// 2. isSundayDate
// ===================================================================
describe('isSundayDate', () => {
    it('returns true for a Sunday (2026-04-05)', () => {
        expect(isSundayDate(dateUTC('2026-04-05'))).toBe(true)
    })

    it('returns true for Neujahr 2034 which is a Sunday (2034-01-01)', () => {
        expect(isSundayDate(dateUTC('2034-01-01'))).toBe(true)
    })

    it('returns false for a Monday (2026-04-06)', () => {
        expect(isSundayDate(dateUTC('2026-04-06'))).toBe(false)
    })

    it('returns false for a Thursday (2026-01-01)', () => {
        expect(isSundayDate(dateUTC('2026-01-01'))).toBe(false)
    })

    it('returns false for a Saturday (2028-01-01)', () => {
        expect(isSundayDate(dateUTC('2028-01-01'))).toBe(false)
    })
})

// ===================================================================
// 3. calculateTotalHours
// ===================================================================
describe('calculateTotalHours', () => {
    it('calculates a normal 8-hour day shift (08:00-16:00)', () => {
        expect(calculateTotalHours('08:00', '16:00')).toBe(8)
    })

    it('calculates a half-hour shift (09:00-09:30)', () => {
        expect(calculateTotalHours('09:00', '09:30')).toBe(0.5)
    })

    it('calculates a short 4-hour shift (12:00-16:00)', () => {
        expect(calculateTotalHours('12:00', '16:00')).toBe(4)
    })

    it('calculates an overnight shift (22:00-06:00 = 8h)', () => {
        expect(calculateTotalHours('22:00', '06:00')).toBe(8)
    })

    it('calculates an overnight shift starting late (23:00-07:00 = 8h)', () => {
        expect(calculateTotalHours('23:00', '07:00')).toBe(8)
    })

    it('calculates a 24-hour shift (00:00-00:00 = 24h)', () => {
        expect(calculateTotalHours('00:00', '00:00')).toBe(24)
    })

    it('calculates an evening shift (18:00-23:00 = 5h)', () => {
        expect(calculateTotalHours('18:00', '23:00')).toBe(5)
    })

    it('calculates late evening into midnight (18:00-00:00 = 6h)', () => {
        expect(calculateTotalHours('18:00', '00:00')).toBe(6)
    })

    it('calculates with minutes (08:30-17:15 = 8.75h)', () => {
        expect(calculateTotalHours('08:30', '17:15')).toBe(8.75)
    })

    it('calculates a 1-minute shift (12:00-12:01)', () => {
        const result = calculateTotalHours('12:00', '12:01')
        expect(result).toBeCloseTo(1 / 60, 5)
    })
})

// ===================================================================
// 4. calculateNightHours (night window: 23:00-06:00 = 7h max)
// ===================================================================
describe('calculateNightHours', () => {
    const anyDate = dateUTC('2026-03-15') // a normal Wednesday

    it('returns 0 for a pure day shift (08:00-16:00)', () => {
        expect(calculateNightHours('08:00', '16:00', anyDate)).toBe(0)
    })

    it('returns 0 for an evening shift ending before 23:00 (18:00-23:00)', () => {
        expect(calculateNightHours('18:00', '23:00', anyDate)).toBe(0)
    })

    it('returns 7 for a full night shift (22:00-06:00)', () => {
        // 22:00-23:00 is NOT night, 23:00-06:00 = 7h night
        expect(calculateNightHours('22:00', '06:00', anyDate)).toBe(7)
    })

    it('returns 7 for a 24-hour shift (00:00-00:00)', () => {
        // 0:00-6:00 = 6h night + 23:00-24:00 = 1h night = 7h total
        expect(calculateNightHours('00:00', '00:00', anyDate)).toBe(7)
    })

    it('returns 1 for a late evening shift crossing 23:00 (18:00-00:00)', () => {
        // 23:00-00:00 = 1h night
        expect(calculateNightHours('18:00', '00:00', anyDate)).toBe(1)
    })

    it('returns 6 for a shift starting at midnight (00:00-06:00)', () => {
        expect(calculateNightHours('00:00', '06:00', anyDate)).toBe(6)
    })

    it('returns 3 for a shift from 03:00-08:00 (3h night: 03:00-06:00)', () => {
        expect(calculateNightHours('03:00', '08:00', anyDate)).toBe(3)
    })

    it('returns 1 for a shift from 23:00-00:00', () => {
        expect(calculateNightHours('23:00', '00:00', anyDate)).toBe(1)
    })

    it('returns 7 for a shift from 23:00-06:00 (full night window)', () => {
        expect(calculateNightHours('23:00', '06:00', anyDate)).toBe(7)
    })

    it('returns 2 for a shift from 04:00-08:00 (2h night: 04:00-06:00)', () => {
        expect(calculateNightHours('04:00', '08:00', anyDate)).toBe(2)
    })

    it('returns 0 for a shift entirely outside night hours (06:00-23:00)', () => {
        expect(calculateNightHours('06:00', '23:00', anyDate)).toBe(0)
    })

    it('returns 0 for a short morning shift (07:00-12:00)', () => {
        expect(calculateNightHours('07:00', '12:00', anyDate)).toBe(0)
    })
})

// ===================================================================
// 5. aggregateMonthlyData
// ===================================================================
describe('aggregateMonthlyData', () => {
    // ---------------------------------------------------------------
    // 5a. Basic hour counting with status filtering
    // ---------------------------------------------------------------
    describe('status filtering', () => {
        it('counts CONFIRMED shifts in totalHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'), // Monday
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(8)
        })

        it('counts CHANGED shifts in totalHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'CHANGED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(8)
        })

        it('counts SUBMITTED shifts in totalHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'SUBMITTED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(8)
        })

        it('counts COMPLETED shifts in totalHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'COMPLETED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(8)
        })

        it('does NOT count PLANNED shifts in totalHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'PLANNED',
                plannedStart: '08:00',
                plannedEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(0)
        })

        it('does NOT count CANCELLED shifts in totalHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'CANCELLED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(0)
        })

        it('falls back to planned times when actual times are missing', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'CONFIRMED',
                plannedStart: '09:00',
                plannedEnd: '17:00',
                actualStart: null,
                actualEnd: null,
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.totalHours).toBe(8)
        })
    })

    // ---------------------------------------------------------------
    // 5b. Sunday premium
    // ---------------------------------------------------------------
    describe('Sunday premium', () => {
        it('counts Sunday hours for CONFIRMED shift on a Sunday', () => {
            const timesheets = [{
                date: dateUTC('2026-04-05'), // Sunday, not a holiday
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.sundayHours).toBe(8)
            expect(result.holidayHours).toBe(0)
            expect(result.totalHours).toBe(8)
        })

        it('does NOT count Sunday hours when sundayPremiumEnabled is false', () => {
            const timesheets = [{
                date: dateUTC('2026-04-05'), // Sunday
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const employee = {
                ...FULL_EMPLOYEE,
                sundayPremiumEnabled: false,
            }

            const result = aggregateMonthlyData(timesheets, employee)
            expect(result.sundayHours).toBe(0)
            expect(result.totalHours).toBe(8)
        })
    })

    // ---------------------------------------------------------------
    // 5c. Holiday premium
    // ---------------------------------------------------------------
    describe('Holiday premium', () => {
        it('counts holiday hours for CONFIRMED shift on a holiday', () => {
            const timesheets = [{
                date: dateUTC('2026-01-01'), // Neujahr (Thursday)
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.holidayHours).toBe(8)
            expect(result.sundayHours).toBe(0)
            expect(result.totalHours).toBe(8)
        })

        it('counts holiday hours for Ostermontag 2026', () => {
            const timesheets = [{
                date: dateUTC('2026-04-06'), // Ostermontag (Monday)
                status: 'CONFIRMED',
                actualStart: '06:00',
                actualEnd: '14:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.holidayHours).toBe(8)
            expect(result.sundayHours).toBe(0)
        })

        it('does NOT count holiday hours when holidayPremiumEnabled is false', () => {
            const timesheets = [{
                date: dateUTC('2026-01-01'), // Neujahr
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const employee = {
                ...FULL_EMPLOYEE,
                holidayPremiumEnabled: false,
            }

            const result = aggregateMonthlyData(timesheets, employee)
            expect(result.holidayHours).toBe(0)
        })
    })

    // ---------------------------------------------------------------
    // 5d. CRITICAL: Holiday on Sunday - no double-counting
    // ---------------------------------------------------------------
    describe('Holiday-Sunday double-counting prevention (bug fix)', () => {
        it('counts ONLY holidayHours, NOT sundayHours, when a holiday falls on Sunday', () => {
            // 2034-01-01 is both Neujahr AND a Sunday
            const timesheets = [{
                date: dateUTC('2034-01-01'),
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)

            // Holiday takes priority - 8 hours counted as holiday
            expect(result.holidayHours).toBe(8)
            // Sunday must NOT also count these hours (this was the bug)
            expect(result.sundayHours).toBe(0)
            // Total hours should be 8, not 16
            expect(result.totalHours).toBe(8)
        })

        it('counts as sundayHours when holiday premium is disabled but Sunday premium is enabled', () => {
            // If holiday premium is disabled, the Sunday premium should take effect
            const timesheets = [{
                date: dateUTC('2034-01-01'), // Neujahr + Sunday
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const employee = {
                ...FULL_EMPLOYEE,
                holidayPremiumEnabled: false,
            }

            const result = aggregateMonthlyData(timesheets, employee)
            expect(result.holidayHours).toBe(0)
            expect(result.sundayHours).toBe(8) // Falls through to Sunday when holiday disabled
        })

        it('counts neither holiday nor Sunday when both premiums are disabled', () => {
            const timesheets = [{
                date: dateUTC('2034-01-01'),
                status: 'CONFIRMED',
                actualStart: '08:00',
                actualEnd: '16:00',
            }]

            const employee = {
                ...FULL_EMPLOYEE,
                holidayPremiumEnabled: false,
                sundayPremiumEnabled: false,
            }

            const result = aggregateMonthlyData(timesheets, employee)
            expect(result.holidayHours).toBe(0)
            expect(result.sundayHours).toBe(0)
            expect(result.totalHours).toBe(8)
        })
    })

    // ---------------------------------------------------------------
    // 5e. Night premium
    // ---------------------------------------------------------------
    describe('Night premium', () => {
        it('calculates night hours for an overnight CONFIRMED shift', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'), // Monday
                status: 'CONFIRMED',
                actualStart: '22:00',
                actualEnd: '06:00',
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.nightHours).toBe(7) // 23:00-06:00
            expect(result.totalHours).toBe(8) // 22:00-06:00
        })

        it('does NOT calculate night hours when nightPremiumEnabled is false', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'CONFIRMED',
                actualStart: '22:00',
                actualEnd: '06:00',
            }]

            const employee = {
                ...FULL_EMPLOYEE,
                nightPremiumEnabled: false,
            }

            const result = aggregateMonthlyData(timesheets, employee)
            expect(result.nightHours).toBe(0)
            expect(result.totalHours).toBe(8)
        })

        it('accumulates night hours across multiple shifts', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    actualStart: '23:00',
                    actualEnd: '06:00',
                },
                {
                    date: dateUTC('2026-01-06'),
                    status: 'CONFIRMED',
                    actualStart: '23:00',
                    actualEnd: '06:00',
                },
            ]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.nightHours).toBe(14) // 7 + 7
            expect(result.totalHours).toBe(14) // 7 + 7
        })
    })

    // ---------------------------------------------------------------
    // 5f. Sick days / hours
    // ---------------------------------------------------------------
    describe('Sick absences', () => {
        it('counts SICK shifts as sickDays and sickHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'CONFIRMED',
                absenceType: 'SICK',
                plannedStart: '08:00',
                plannedEnd: '16:00',
                actualStart: null,
                actualEnd: null,
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.sickDays).toBe(1)
            expect(result.sickHours).toBe(8)
            // Sick shifts should NOT be counted in totalHours
            expect(result.totalHours).toBe(0)
        })

        it('deduplicates sick days for multiple shifts on the same date', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '12:00',
                },
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    absenceType: 'SICK',
                    plannedStart: '13:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.sickDays).toBe(1) // Same date = 1 day
            expect(result.sickHours).toBe(7) // 4 + 3
        })

        it('counts multiple sick dates correctly', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
                {
                    date: dateUTC('2026-01-06'),
                    status: 'CONFIRMED',
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.sickDays).toBe(2)
            expect(result.sickHours).toBe(16)
        })
    })

    // ---------------------------------------------------------------
    // 5g. Vacation days / hours
    // ---------------------------------------------------------------
    describe('Vacation absences', () => {
        it('counts VACATION shifts as vacationDays and vacationHours', () => {
            const timesheets = [{
                date: dateUTC('2026-01-05'),
                status: 'CONFIRMED',
                absenceType: 'VACATION',
                plannedStart: '08:00',
                plannedEnd: '16:00',
                actualStart: null,
                actualEnd: null,
            }]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.vacationDays).toBe(1)
            expect(result.vacationHours).toBe(8)
            // Vacation shifts should NOT be counted in totalHours
            expect(result.totalHours).toBe(0)
        })

        it('deduplicates vacation days for multiple shifts on the same date', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    absenceType: 'VACATION',
                    plannedStart: '08:00',
                    plannedEnd: '12:00',
                },
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    absenceType: 'VACATION',
                    plannedStart: '13:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)
            expect(result.vacationDays).toBe(1) // Same date = 1 day
            expect(result.vacationHours).toBe(7) // 4 + 3
        })
    })

    // ---------------------------------------------------------------
    // 5h. Mixed shifts in a month
    // ---------------------------------------------------------------
    describe('Mixed monthly data', () => {
        it('aggregates a realistic month with work, sick, and vacation', () => {
            const timesheets = [
                // Normal work day (Monday)
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    actualStart: '08:00',
                    actualEnd: '16:00',
                },
                // Night shift (Tuesday)
                {
                    date: dateUTC('2026-01-06'),
                    status: 'CONFIRMED',
                    actualStart: '22:00',
                    actualEnd: '06:00',
                },
                // Sick day (Wednesday)
                {
                    date: dateUTC('2026-01-07'),
                    status: 'CONFIRMED',
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
                // Vacation day (Thursday)
                {
                    date: dateUTC('2026-01-08'),
                    status: 'CONFIRMED',
                    absenceType: 'VACATION',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
                // PLANNED shift (should NOT count)
                {
                    date: dateUTC('2026-01-09'),
                    status: 'PLANNED',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = aggregateMonthlyData(timesheets, FULL_EMPLOYEE)

            expect(result.totalHours).toBe(16) // 8 + 8 (work days only)
            expect(result.nightHours).toBe(7) // night shift 23:00-06:00
            expect(result.sickDays).toBe(1)
            expect(result.sickHours).toBe(8)
            expect(result.vacationDays).toBe(1)
            expect(result.vacationHours).toBe(8)
        })

        it('returns all zeros for an empty timesheets array', () => {
            const result = aggregateMonthlyData([], FULL_EMPLOYEE)

            expect(result.totalHours).toBe(0)
            expect(result.nightHours).toBe(0)
            expect(result.sundayHours).toBe(0)
            expect(result.holidayHours).toBe(0)
            expect(result.sickDays).toBe(0)
            expect(result.sickHours).toBe(0)
            expect(result.vacationDays).toBe(0)
            expect(result.vacationHours).toBe(0)
            expect(result.backupDays).toBe(0)
            expect(result.backupHours).toBe(0)
        })
    })

    // ---------------------------------------------------------------
    // 5i. Backup integration via allTimesheetsForBackup
    // ---------------------------------------------------------------
    describe('Backup integration', () => {
        it('adds backup hours to totals when main employee is absent', () => {
            const ownTimesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    status: 'CONFIRMED',
                    actualStart: '08:00',
                    actualEnd: '16:00',
                },
            ]

            // Another team's timesheets where our employee is backup
            const allTimesheets = [
                {
                    date: dateUTC('2026-01-06'),
                    backupEmployeeId: 'emp-001',
                    absenceType: 'SICK', // Main person is sick, backup jumps in
                    plannedStart: '09:00',
                    plannedEnd: '17:00',
                },
            ]

            const result = aggregateMonthlyData(ownTimesheets, FULL_EMPLOYEE, allTimesheets)

            expect(result.totalHours).toBe(16) // 8 own + 8 backup
            expect(result.backupDays).toBe(1)
            expect(result.backupHours).toBe(8)
        })
    })
})

// ===================================================================
// 6. calculateBackupStats
// ===================================================================
describe('calculateBackupStats', () => {
    const userId = 'backup-user-001'

    // ---------------------------------------------------------------
    // 6a. Basic backup counting
    // ---------------------------------------------------------------
    describe('basic backup counting', () => {
        it('counts backup days when employee is assigned as backup', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: null, // Main person is NOT absent
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(1) // Counted as backup day
            expect(result.backupHours).toBe(0) // But no hours because main is not absent
        })

        it('counts backup hours when main employee is SICK', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(1)
            expect(result.backupHours).toBe(8)
        })

        it('counts backup hours when main employee is on VACATION', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'VACATION',
                    actualStart: '09:00',
                    actualEnd: '17:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(1)
            expect(result.backupHours).toBe(8)
        })

        it('does NOT count hours for other employees backup shifts', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: 'someone-else',
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(0)
            expect(result.backupHours).toBe(0)
        })

        it('deduplicates backup days for multiple shifts on same date', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '12:00',
                },
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '13:00',
                    plannedEnd: '17:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(1) // Same date = 1 day
            expect(result.backupHours).toBe(8) // 4 + 4
        })

        it('uses actualStart/actualEnd when available, falling back to planned', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: '07:00',
                    actualEnd: '15:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            // Should use actual times (07:00-15:00 = 8h)
            expect(result.backupHours).toBe(8)
        })
    })

    // ---------------------------------------------------------------
    // 6b. Backup Sunday premium
    // ---------------------------------------------------------------
    describe('backup Sunday premium', () => {
        it('counts backup Sunday hours for a shift on Sunday', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-04-05'), // Sunday, not a holiday
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupSundayHours).toBe(8)
            expect(result.backupHolidayHours).toBe(0)
            expect(result.backupHours).toBe(8)
        })
    })

    // ---------------------------------------------------------------
    // 6c. Backup Holiday premium
    // ---------------------------------------------------------------
    describe('backup Holiday premium', () => {
        it('counts backup holiday hours for a shift on a holiday', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-01'), // Neujahr (Thursday)
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupHolidayHours).toBe(8)
            expect(result.backupSundayHours).toBe(0)
            expect(result.backupHours).toBe(8)
        })
    })

    // ---------------------------------------------------------------
    // 6d. CRITICAL: Backup holiday-on-Sunday - no double-counting
    // ---------------------------------------------------------------
    describe('Backup Holiday-Sunday double-counting prevention (bug fix)', () => {
        it('counts ONLY backupHolidayHours, NOT backupSundayHours, on holiday-Sunday', () => {
            // 2034-01-01 is both Neujahr AND a Sunday
            const timesheets = [
                {
                    date: dateUTC('2034-01-01'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            // Holiday takes priority - 8 hours counted as holiday
            expect(result.backupHolidayHours).toBe(8)
            // Sunday must NOT also count these hours (this was the bug)
            expect(result.backupSundayHours).toBe(0)
            expect(result.backupHours).toBe(8)
        })

        it('counts backupSundayHours when holiday premium is disabled on holiday-Sunday', () => {
            const timesheets = [
                {
                    date: dateUTC('2034-01-01'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const employee = {
                ...ALL_PREMIUMS_ENABLED,
                holidayPremiumEnabled: false,
            }

            const result = calculateBackupStats(timesheets, userId, employee)

            expect(result.backupHolidayHours).toBe(0)
            expect(result.backupSundayHours).toBe(8) // Falls through to Sunday
        })

        it('counts neither backup holiday nor Sunday when both premiums disabled', () => {
            const timesheets = [
                {
                    date: dateUTC('2034-01-01'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_DISABLED)

            expect(result.backupHolidayHours).toBe(0)
            expect(result.backupSundayHours).toBe(0)
            expect(result.backupNightHours).toBe(0)
            expect(result.backupHours).toBe(8) // Hours still count, just no premiums
        })
    })

    // ---------------------------------------------------------------
    // 6e. Backup night premium
    // ---------------------------------------------------------------
    describe('backup Night premium', () => {
        it('calculates backup night hours for an overnight backup shift', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'), // Monday
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '22:00',
                    plannedEnd: '06:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupNightHours).toBe(7) // 23:00-06:00
            expect(result.backupHours).toBe(8) // 22:00-06:00
        })

        it('does NOT calculate backup night hours when nightPremiumEnabled is false', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '22:00',
                    plannedEnd: '06:00',
                },
            ]

            const employee = {
                ...ALL_PREMIUMS_ENABLED,
                nightPremiumEnabled: false,
            }

            const result = calculateBackupStats(timesheets, userId, employee)

            expect(result.backupNightHours).toBe(0)
            expect(result.backupHours).toBe(8) // Hours still count
        })
    })

    // ---------------------------------------------------------------
    // 6f. Edge cases
    // ---------------------------------------------------------------
    describe('edge cases', () => {
        it('returns all zeros for empty timesheets array', () => {
            const result = calculateBackupStats([], userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(0)
            expect(result.backupHours).toBe(0)
            expect(result.backupNightHours).toBe(0)
            expect(result.backupSundayHours).toBe(0)
            expect(result.backupHolidayHours).toBe(0)
        })

        it('handles timesheets with no start/end times gracefully', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    // No start/end times at all
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(1) // Day is still counted
            expect(result.backupHours).toBe(0) // But no hours without times
        })

        it('handles date as string instead of Date object', () => {
            const timesheets = [
                {
                    date: '2026-01-05T12:00:00.000Z', // String instead of Date
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupDays).toBe(1)
            expect(result.backupHours).toBe(8)
        })

        it('rounds backup hours to 2 decimal places', () => {
            const timesheets = [
                {
                    date: dateUTC('2026-01-05'),
                    backupEmployeeId: userId,
                    absenceType: 'SICK',
                    plannedStart: '08:00',
                    plannedEnd: '08:20', // 20 min = 0.333... hours
                },
            ]

            const result = calculateBackupStats(timesheets, userId, ALL_PREMIUMS_ENABLED)

            expect(result.backupHours).toBe(0.33)
        })
    })
})
