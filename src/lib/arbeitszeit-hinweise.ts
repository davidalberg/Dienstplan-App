/**
 * Arbeitszeit-Hinweise - NUR INFORMATIV, NIEMALS BLOCKIEREND!
 *
 * Branchenspezifik Persoenliche Assistenz:
 * - Keine Pausen-Pflicht (Rufbereitschaft = volle Verguetung)
 * - 24h-Schichten sind erlaubt (Sonderbewilligung)
 * - Hinweise sind rein informativ - Schichten koennen IMMER erstellt werden
 */

export type HinweisType = "INFO" | "HINWEIS"

export interface ArbeitszeitHinweis {
    type: HinweisType
    message: string
    /** Betroffenes Datum (optional) */
    date?: string
    /** Betroffener Mitarbeiter (optional) */
    employeeId?: string
}

interface Shift {
    date: string | Date
    plannedStart: string | null
    plannedEnd: string | null
    actualStart?: string | null
    actualEnd?: string | null
    employeeId: string
}

/**
 * Berechnet Minuten zwischen zwei Zeitangaben (HH:MM Format)
 */
function minutesBetween(start: string, end: string): number {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)
    let diff = (endH * 60 + endM) - (startH * 60 + startM)
    if (diff <= 0) diff += 24 * 60 // Uebernacht
    // 0:00 bis 0:00 = 24h
    if (diff === 24 * 60 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
        diff = 24 * 60
    }
    return diff
}

/**
 * Berechnet den Endzeit-Punkt als Minuten ab 00:00
 * Bei Uebernacht-Schichten: Endzeit + 24h (naechster Tag)
 */
function shiftEndMinutesAbsolute(start: string, end: string): number {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)
    const startMin = startH * 60 + startM
    const endMin = endH * 60 + endM
    return endMin <= startMin ? endMin + 24 * 60 : endMin
}

/**
 * Prueft ob die Ruhezeit zwischen zwei aufeinanderfolgenden Schichten < 11h ist.
 * Gibt INFO-Hinweise zurueck (NICHT blockierend).
 */
export function checkRestPeriod(shifts: Shift[]): ArbeitszeitHinweis[] {
    const hinweise: ArbeitszeitHinweis[] = []
    if (shifts.length < 2) return hinweise

    // Gruppiere nach Mitarbeiter
    const byEmployee = new Map<string, Shift[]>()
    for (const s of shifts) {
        const list = byEmployee.get(s.employeeId) || []
        list.push(s)
        byEmployee.set(s.employeeId, list)
    }

    for (const [employeeId, empShifts] of byEmployee) {
        // Sortiere nach Datum
        const sorted = [...empShifts].sort((a, b) => {
            const dateA = typeof a.date === "string" ? a.date : a.date.toISOString().split("T")[0]
            const dateB = typeof b.date === "string" ? b.date : b.date.toISOString().split("T")[0]
            return dateA.localeCompare(dateB)
        })

        for (let i = 0; i < sorted.length - 1; i++) {
            const current = sorted[i]
            const next = sorted[i + 1]

            const currStart = current.actualStart || current.plannedStart
            const currEnd = current.actualEnd || current.plannedEnd
            const nextStart = next.actualStart || next.plannedStart

            if (!currStart || !currEnd || !nextStart) continue

            const currDate = typeof current.date === "string" ? current.date : current.date.toISOString().split("T")[0]
            const nextDate = typeof next.date === "string" ? next.date : next.date.toISOString().split("T")[0]

            // Berechne Ruhezeit: Ende der aktuellen Schicht bis Start der naechsten
            const currEndAbsolute = shiftEndMinutesAbsolute(currStart, currEnd)
            const [nextStartH, nextStartM] = nextStart.split(":").map(Number)
            const nextStartMin = nextStartH * 60 + nextStartM

            // Tage zwischen den Schichten
            const d1 = new Date(currDate)
            const d2 = new Date(nextDate)
            const daysDiff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))

            if (daysDiff > 2) continue // Zu weit auseinander

            // Restzeit in Minuten
            let restMinutes: number
            if (daysDiff === 0) {
                // Gleicher Tag
                restMinutes = nextStartMin - currEndAbsolute
            } else if (daysDiff === 1) {
                // Naechster Tag
                const currEndOnDay = currEndAbsolute > 24 * 60
                    ? currEndAbsolute - 24 * 60 // Uebernacht: Ende am naechsten Tag
                    : currEndAbsolute
                if (currEndAbsolute > 24 * 60) {
                    // Schicht endet am naechsten Tag
                    restMinutes = nextStartMin - currEndOnDay
                } else {
                    // Schicht endet am selben Tag, naechste am Folgetag
                    restMinutes = (24 * 60 - currEndAbsolute) + nextStartMin
                }
            } else {
                // 2 Tage Differenz - nur relevant bei Uebernacht-Schicht
                restMinutes = (24 * 60 - (currEndAbsolute > 24 * 60 ? currEndAbsolute - 24 * 60 : 0)) + nextStartMin
            }

            if (restMinutes < 11 * 60 && restMinutes >= 0) {
                const restHours = Math.round(restMinutes / 60 * 10) / 10
                hinweise.push({
                    type: "HINWEIS",
                    message: `Ruhezeit zwischen ${currDate} und ${nextDate}: ${restHours}h (unter 11h)`,
                    date: nextDate,
                    employeeId
                })
            }
        }
    }

    return hinweise
}

/**
 * Prueft ob eine Schicht laenger als 10h ist.
 * Gibt INFO-Hinweis zurueck (NICHT blockierend - 24h-Schichten sind erlaubt!).
 */
export function checkLongShift(shift: Shift): ArbeitszeitHinweis | null {
    const start = shift.actualStart || shift.plannedStart
    const end = shift.actualEnd || shift.plannedEnd

    if (!start || !end) return null

    const minutes = minutesBetween(start, end)
    const hours = minutes / 60

    if (hours > 10) {
        const date = typeof shift.date === "string" ? shift.date : shift.date.toISOString().split("T")[0]
        return {
            type: "INFO",
            message: `Lange Schicht: ${Math.round(hours * 10) / 10}h am ${date}`,
            date,
            employeeId: shift.employeeId
        }
    }

    return null
}

/**
 * Prueft ob ein Mitarbeiter ueber 48h/Woche arbeitet.
 * Gibt INFO-Hinweis zurueck (NICHT blockierend).
 */
export function checkWeeklyHours(shifts: Shift[]): ArbeitszeitHinweis[] {
    const hinweise: ArbeitszeitHinweis[] = []

    // Gruppiere nach Mitarbeiter
    const byEmployee = new Map<string, Shift[]>()
    for (const s of shifts) {
        const list = byEmployee.get(s.employeeId) || []
        list.push(s)
        byEmployee.set(s.employeeId, list)
    }

    for (const [employeeId, empShifts] of byEmployee) {
        // Gruppiere nach Kalenderwoche (ISO)
        const byWeek = new Map<string, number>()

        for (const shift of empShifts) {
            const start = shift.actualStart || shift.plannedStart
            const end = shift.actualEnd || shift.plannedEnd
            if (!start || !end) continue

            const d = typeof shift.date === "string" ? new Date(shift.date) : shift.date
            const weekKey = getISOWeek(d)

            const minutes = minutesBetween(start, end)
            byWeek.set(weekKey, (byWeek.get(weekKey) || 0) + minutes)
        }

        for (const [weekKey, totalMinutes] of byWeek) {
            const totalHours = totalMinutes / 60
            if (totalHours > 48) {
                hinweise.push({
                    type: "HINWEIS",
                    message: `KW ${weekKey}: ${Math.round(totalHours * 10) / 10}h geplant (ueber 48h/Woche)`,
                    employeeId
                })
            }
        }
    }

    return hinweise
}

/**
 * Gibt ISO-Wochennummer zurueck (z.B. "2026-W05")
 */
function getISOWeek(date: Date): string {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`
}

/**
 * Hauptfunktion: Gibt alle Hinweise fuer ein Set von Schichten zurueck.
 * ALLE Hinweise sind rein informativ - NICHTS wird blockiert.
 */
export function getHinweise(shifts: Shift[]): ArbeitszeitHinweis[] {
    const hinweise: ArbeitszeitHinweis[] = []

    // Lange Schichten pruefen
    for (const shift of shifts) {
        const h = checkLongShift(shift)
        if (h) hinweise.push(h)
    }

    // Ruhezeiten pruefen
    hinweise.push(...checkRestPeriod(shifts))

    // Wochenstunden pruefen
    hinweise.push(...checkWeeklyHours(shifts))

    return hinweise
}
