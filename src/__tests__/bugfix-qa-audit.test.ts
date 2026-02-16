/**
 * Unit Tests for QA-Audit Bug Fixes (2026-02-07)
 *
 * Bug #1: Backup shift overwrite — isSystemBackup detection must work
 *         even after backup employee confirms the shift (lastUpdatedBy changes)
 * Bug #3: Download endpoint planned-hours fallback — plannedHours must only
 *         use planned times, never fall back to actual times
 */

import { describe, it, expect } from 'vitest'
import { calculateMinutesBetween } from '@/lib/time-utils'

// ---------------------------------------------------------------------------
// Bug #1: Backup-Overwrite — isSystemBackup detection
// ---------------------------------------------------------------------------
describe('Bug #1: isSystemBackup detection', () => {
    // Simulates the detection logic from timesheets/route.ts
    function isSystemBackup(backupExisting: { note: string | null; lastUpdatedBy: string | null }): boolean {
        // NEW: Only check note — lastUpdatedBy changes when employee confirms
        return !!backupExisting.note?.includes("Backup-Schicht anfallend")
    }

    it('detects fresh system-created backup shift', () => {
        expect(isSystemBackup({
            note: "Backup-Schicht anfallend wegen Krankheit von Max Mustermann",
            lastUpdatedBy: "SYSTEM_BACKUP_ACTIVATION"
        })).toBe(true)
    })

    it('detects backup shift AFTER employee confirmation (lastUpdatedBy changed)', () => {
        // This was the actual bug: after confirming, lastUpdatedBy becomes the employee's email
        expect(isSystemBackup({
            note: "Backup-Schicht anfallend wegen Krankheit von Max Mustermann",
            lastUpdatedBy: "backup-employee@example.com"
        })).toBe(true)
    })

    it('detects backup shift after employee edits note (as long as note still contains marker)', () => {
        expect(isSystemBackup({
            note: "Backup-Schicht anfallend wegen Urlaub von Anna Schmidt - Zeiten angepasst",
            lastUpdatedBy: "backup-employee@example.com"
        })).toBe(true)
    })

    it('does NOT detect regular employee shift', () => {
        expect(isSystemBackup({
            note: "Reguläre Schicht",
            lastUpdatedBy: "employee@example.com"
        })).toBe(false)
    })

    it('does NOT detect shift with null note', () => {
        expect(isSystemBackup({
            note: null,
            lastUpdatedBy: "SYSTEM_BACKUP_ACTIVATION"
        })).toBe(false)
    })

    it('does NOT detect shift with empty note', () => {
        expect(isSystemBackup({
            note: "",
            lastUpdatedBy: "SYSTEM_BACKUP_ACTIVATION"
        })).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Bug #1: Cleanup logic — confirmed backup shifts get info note
// ---------------------------------------------------------------------------
describe('Bug #1: Backup cleanup when original employee recovers', () => {
    type BackupShift = { status: string; note: string | null }

    // Simulates the cleanup decision logic from timesheets/route.ts
    function getCleanupAction(backupShift: BackupShift): 'delete' | 'update_note' | 'skip' {
        if (!backupShift.note?.includes("Backup-Schicht anfallend")) return 'skip'

        if (backupShift.status === "PLANNED") return 'delete'
        if (backupShift.status === "CONFIRMED" || backupShift.status === "CHANGED") return 'update_note'
        return 'skip' // SUBMITTED — don't touch
    }

    it('deletes PLANNED backup shift', () => {
        expect(getCleanupAction({
            status: "PLANNED",
            note: "Backup-Schicht anfallend wegen Krankheit von Max"
        })).toBe('delete')
    })

    it('updates note for CONFIRMED backup shift (not delete)', () => {
        expect(getCleanupAction({
            status: "CONFIRMED",
            note: "Backup-Schicht anfallend wegen Krankheit von Max"
        })).toBe('update_note')
    })

    it('updates note for CHANGED backup shift', () => {
        expect(getCleanupAction({
            status: "CHANGED",
            note: "Backup-Schicht anfallend wegen Urlaub von Anna"
        })).toBe('update_note')
    })

    it('skips SUBMITTED backup shift (already submitted, do not touch)', () => {
        expect(getCleanupAction({
            status: "SUBMITTED",
            note: "Backup-Schicht anfallend wegen Krankheit von Max"
        })).toBe('skip')
    })

    it('skips non-backup shift regardless of status', () => {
        expect(getCleanupAction({
            status: "PLANNED",
            note: "Reguläre Schicht"
        })).toBe('skip')
    })
})

// ---------------------------------------------------------------------------
// Bug #3: Download planned-hours — no actual-time fallback
// ---------------------------------------------------------------------------
describe('Bug #3: Planned hours calculation (no actual-time fallback)', () => {
    // Simulates the planned hours calculation from download/[submissionId]/route.ts
    function calculatePlannedHours(timesheets: Array<{
        plannedStart: string | null
        plannedEnd: string | null
        actualStart: string | null
        actualEnd: string | null
        absenceType: string | null
    }>): number {
        let plannedHours = 0
        for (const ts of timesheets) {
            if (!ts.absenceType) {
                // NEW: Only use planned times, no fallback to actual
                const start = ts.plannedStart
                const end = ts.plannedEnd
                if (start && end) {
                    const minutes = calculateMinutesBetween(start, end)
                    if (minutes !== null && minutes > 0) {
                        plannedHours += Math.round(minutes / 60 * 100) / 100
                    }
                }
            }
        }
        return plannedHours
    }

    it('calculates planned hours from planned times', () => {
        const result = calculatePlannedHours([
            { plannedStart: "08:00", plannedEnd: "16:00", actualStart: "08:00", actualEnd: "16:00", absenceType: null }
        ])
        expect(result).toBe(8)
    })

    it('returns 0 when only actual times exist (no planned times)', () => {
        // BUG FIX: Previously this would return 10 (actual hours) as plannedHours
        const result = calculatePlannedHours([
            { plannedStart: null, plannedEnd: null, actualStart: "07:00", actualEnd: "17:00", absenceType: null }
        ])
        expect(result).toBe(0)
    })

    it('uses planned times even when actual times differ', () => {
        // Planned: 8h, Actual: 10h — plannedHours should be 8, not 10
        const result = calculatePlannedHours([
            { plannedStart: "08:00", plannedEnd: "16:00", actualStart: "07:00", actualEnd: "17:00", absenceType: null }
        ])
        expect(result).toBe(8)
    })

    it('excludes absence days from planned hours', () => {
        const result = calculatePlannedHours([
            { plannedStart: "08:00", plannedEnd: "16:00", actualStart: null, actualEnd: null, absenceType: null },
            { plannedStart: "08:00", plannedEnd: "16:00", actualStart: null, actualEnd: null, absenceType: "SICK" },
        ])
        expect(result).toBe(8) // Only the non-absent shift counts
    })

    it('sums planned hours across multiple shifts', () => {
        const result = calculatePlannedHours([
            { plannedStart: "08:00", plannedEnd: "16:00", actualStart: "08:00", actualEnd: "16:00", absenceType: null },
            { plannedStart: "09:00", plannedEnd: "17:00", actualStart: "09:00", actualEnd: "17:00", absenceType: null },
        ])
        expect(result).toBe(16)
    })

    it('handles overnight planned shifts', () => {
        const result = calculatePlannedHours([
            { plannedStart: "22:00", plannedEnd: "06:00", actualStart: "22:00", actualEnd: "06:00", absenceType: null }
        ])
        expect(result).toBe(8)
    })

    it('handles partial planned times (only start, no end)', () => {
        const result = calculatePlannedHours([
            { plannedStart: "08:00", plannedEnd: null, actualStart: "08:00", actualEnd: "16:00", absenceType: null }
        ])
        expect(result).toBe(0) // Can't calculate without both planned times
    })
})
