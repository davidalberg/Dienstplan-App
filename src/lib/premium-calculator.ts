/**
 * Premium Calculator für Zuschlagsberechnungen
 * - NRW Feiertage 2026-2030
 * - Nachtstunden (23:00-06:00)
 * - Sonntagsstunden
 * - Monatliche Aggregation
 */

// NRW Feiertage 2026-2030 (Format: YYYY-MM-DD)
const NRW_HOLIDAYS = new Set([
    // 2026
    "2026-01-01", // Neujahr
    "2026-04-03", // Karfreitag
    "2026-04-06", // Ostermontag
    "2026-05-01", // Tag der Arbeit
    "2026-05-14", // Christi Himmelfahrt
    "2026-05-25", // Pfingstmontag
    "2026-06-04", // Fronleichnam
    "2026-10-03", // Tag der Deutschen Einheit
    "2026-11-01", // Allerheiligen
    "2026-12-25", // 1. Weihnachtsfeiertag
    "2026-12-26", // 2. Weihnachtsfeiertag

    // 2027
    "2027-01-01", // Neujahr
    "2027-03-26", // Karfreitag
    "2027-03-29", // Ostermontag
    "2027-05-01", // Tag der Arbeit
    "2027-05-06", // Christi Himmelfahrt
    "2027-05-17", // Pfingstmontag
    "2027-05-27", // Fronleichnam
    "2027-10-03", // Tag der Deutschen Einheit
    "2027-11-01", // Allerheiligen
    "2027-12-25", // 1. Weihnachtsfeiertag
    "2027-12-26", // 2. Weihnachtsfeiertag

    // 2028
    "2028-01-01", // Neujahr
    "2028-04-14", // Karfreitag
    "2028-04-17", // Ostermontag
    "2028-05-01", // Tag der Arbeit
    "2028-05-25", // Christi Himmelfahrt
    "2028-06-05", // Pfingstmontag
    "2028-06-15", // Fronleichnam
    "2028-10-03", // Tag der Deutschen Einheit
    "2028-11-01", // Allerheiligen
    "2028-12-25", // 1. Weihnachtsfeiertag
    "2028-12-26", // 2. Weihnachtsfeiertag

    // 2029
    "2029-01-01", // Neujahr
    "2029-03-30", // Karfreitag
    "2029-04-02", // Ostermontag
    "2029-05-01", // Tag der Arbeit
    "2029-05-10", // Christi Himmelfahrt
    "2029-05-21", // Pfingstmontag
    "2029-05-31", // Fronleichnam
    "2029-10-03", // Tag der Deutschen Einheit
    "2029-11-01", // Allerheiligen
    "2029-12-25", // 1. Weihnachtsfeiertag
    "2029-12-26", // 2. Weihnachtsfeiertag

    // 2030
    "2030-01-01", // Neujahr
    "2030-04-19", // Karfreitag
    "2030-04-22", // Ostermontag
    "2030-05-01", // Tag der Arbeit
    "2030-05-30", // Christi Himmelfahrt
    "2030-06-10", // Pfingstmontag
    "2030-06-20", // Fronleichnam
    "2030-10-03", // Tag der Deutschen Einheit
    "2030-11-01", // Allerheiligen
    "2030-12-25", // 1. Weihnachtsfeiertag
    "2030-12-26", // 2. Weihnachtsfeiertag
])

/**
 * Prüft ob ein Datum ein NRW Feiertag ist
 */
export function isNRWHoliday(date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0]
    return NRW_HOLIDAYS.has(dateStr)
}

/**
 * Prüft ob ein Datum ein Sonntag ist
 */
export function isSundayDate(date: Date): boolean {
    return date.getDay() === 0
}

/**
 * Berechnet die Gesamtstunden zwischen Start und Ende
 * Unterstützt Übernacht-Dienste
 */
export function calculateTotalHours(start: string, end: string): number {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)

    let minutes = (endH * 60 + endM) - (startH * 60 + startM)

    // Übernacht-Dienst (Ende < Start)
    if (minutes < 0) {
        minutes += 24 * 60
    }

    return minutes / 60
}

/**
 * Berechnet Nachtstunden (23:00-06:00) für einen Dienst
 * Unterstützt Übernacht-Dienste
 */
export function calculateNightHours(start: string, end: string, date: Date): number {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)

    const startMinutes = startH * 60 + startM
    let endMinutes = endH * 60 + endM

    // Übernacht-Dienst: Ende am nächsten Tag
    if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60
    }

    // Nachtfenster: 23:00 (1380 min) bis 06:00 (360 min am nächsten Tag = 1800 min)
    const nightStart = 23 * 60 // 1380
    const nightEnd = 30 * 60   // 1800 (entspricht 06:00 am nächsten Tag)

    let nightMinutes = 0

    // Fall 1: Dienst komplett innerhalb der Nacht (23:00-06:00)
    if (startMinutes >= nightStart && endMinutes <= nightEnd) {
        nightMinutes = endMinutes - startMinutes
    }
    // Fall 2: Dienst startet vor Nacht, endet in der Nacht
    else if (startMinutes < nightStart && endMinutes > nightStart && endMinutes <= nightEnd) {
        nightMinutes = endMinutes - nightStart
    }
    // Fall 3: Dienst startet in der Nacht, endet nach der Nacht
    else if (startMinutes >= nightStart && startMinutes < nightEnd && endMinutes > nightEnd) {
        nightMinutes = nightEnd - startMinutes
    }
    // Fall 4: Dienst umspannt die gesamte Nacht
    else if (startMinutes < nightStart && endMinutes > nightEnd) {
        nightMinutes = nightEnd - nightStart // 7 Stunden
    }

    return Math.max(0, nightMinutes / 60)
}

/**
 * Aggregiert monatliche Daten für einen Mitarbeiter
 */
export function aggregateMonthlyData(
    timesheets: any[],
    employee: {
        id?: string
        hourlyWage: number
        nightPremiumEnabled: boolean
        nightPremiumPercent: number
        sundayPremiumEnabled: boolean
        sundayPremiumPercent: number
        holidayPremiumEnabled: boolean
        holidayPremiumPercent: number
    },
    allTimesheetsForBackup?: any[]
): {
    totalHours: number
    nightHours: number
    sundayHours: number
    holidayHours: number
    sickDays: number
    sickHours: number
    vacationDays: number
    vacationHours: number
    backupDays: number
} {
    let totalHours = 0
    let nightHours = 0
    let sundayHours = 0
    let holidayHours = 0
    let sickDays = 0
    let sickHours = 0
    let vacationDays = 0
    let vacationHours = 0
    let backupDays = 0

    const sickDates = new Set<string>()
    const vacationDates = new Set<string>()
    const backupDates = new Set<string>()

    timesheets.forEach(ts => {
        const date = new Date(ts.date)

        // Abwesenheiten
        if (ts.absenceType === "SICK") {
            const dateStr = date.toISOString().split('T')[0]
            sickDates.add(dateStr)

            if (ts.actualStart && ts.actualEnd) {
                const hours = calculateTotalHours(ts.actualStart, ts.actualEnd)
                sickHours += hours
            }
        } else if (ts.absenceType === "VACATION") {
            const dateStr = date.toISOString().split('T')[0]
            vacationDates.add(dateStr)

            if (ts.actualStart && ts.actualEnd) {
                const hours = calculateTotalHours(ts.actualStart, ts.actualEnd)
                vacationHours += hours
            }
        }

        // Nur tatsächlich gearbeitete Stunden zählen (nicht Abwesenheiten)
        if (ts.actualStart && ts.actualEnd && !ts.absenceType) {
            const hours = calculateTotalHours(ts.actualStart, ts.actualEnd)
            totalHours += hours

            // Nachtstunden
            if (employee.nightPremiumEnabled) {
                const nightHrs = calculateNightHours(ts.actualStart, ts.actualEnd, date)
                nightHours += nightHrs
            }

            // Sonntagsstunden
            if (employee.sundayPremiumEnabled && isSundayDate(date)) {
                sundayHours += hours
            }

            // Feiertagsstunden
            if (employee.holidayPremiumEnabled && isNRWHoliday(date)) {
                holidayHours += hours
            }
        }
    })

    sickDays = sickDates.size
    vacationDays = vacationDates.size

    // Backup-Tage zählen: Wie oft ist dieser Mitarbeiter als Backup eingetragen?
    if (employee.id && allTimesheetsForBackup) {
        allTimesheetsForBackup.forEach(ts => {
            if (ts.backupEmployeeId === employee.id) {
                const dateStr = new Date(ts.date).toISOString().split('T')[0]
                backupDates.add(dateStr)
            }
        })
        backupDays = backupDates.size
    }

    return {
        totalHours: Math.round(totalHours * 100) / 100,
        nightHours: Math.round(nightHours * 100) / 100,
        sundayHours: Math.round(sundayHours * 100) / 100,
        holidayHours: Math.round(holidayHours * 100) / 100,
        sickDays,
        sickHours: Math.round(sickHours * 100) / 100,
        vacationDays,
        vacationHours: Math.round(vacationHours * 100) / 100,
        backupDays
    }
}
