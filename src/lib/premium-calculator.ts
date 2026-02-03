/**
 * Premium Calculator für Zuschlagsberechnungen
 * - NRW Feiertage 2026-2035
 * - Nachtstunden (23:00-06:00) = 7 Stunden
 * - Sonntagsstunden
 * - Monatliche Aggregation
 */

// NRW Feiertage 2026-2035 (Format: YYYY-MM-DD)
// Feste Feiertage: 01.01, 01.05, 03.10, 01.11, 25.12, 26.12
// Variable Feiertage: Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam
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

    // 2031
    "2031-01-01", // Neujahr
    "2031-04-11", // Karfreitag
    "2031-04-14", // Ostermontag
    "2031-05-01", // Tag der Arbeit
    "2031-05-22", // Christi Himmelfahrt
    "2031-06-02", // Pfingstmontag
    "2031-06-12", // Fronleichnam
    "2031-10-03", // Tag der Deutschen Einheit
    "2031-11-01", // Allerheiligen
    "2031-12-25", // 1. Weihnachtsfeiertag
    "2031-12-26", // 2. Weihnachtsfeiertag

    // 2032
    "2032-01-01", // Neujahr
    "2032-03-26", // Karfreitag
    "2032-03-29", // Ostermontag
    "2032-05-01", // Tag der Arbeit
    "2032-05-06", // Christi Himmelfahrt
    "2032-05-17", // Pfingstmontag
    "2032-05-27", // Fronleichnam
    "2032-10-03", // Tag der Deutschen Einheit
    "2032-11-01", // Allerheiligen
    "2032-12-25", // 1. Weihnachtsfeiertag
    "2032-12-26", // 2. Weihnachtsfeiertag

    // 2033
    "2033-01-01", // Neujahr
    "2033-04-15", // Karfreitag
    "2033-04-18", // Ostermontag
    "2033-05-01", // Tag der Arbeit
    "2033-05-26", // Christi Himmelfahrt
    "2033-06-06", // Pfingstmontag
    "2033-06-16", // Fronleichnam
    "2033-10-03", // Tag der Deutschen Einheit
    "2033-11-01", // Allerheiligen
    "2033-12-25", // 1. Weihnachtsfeiertag
    "2033-12-26", // 2. Weihnachtsfeiertag

    // 2034
    "2034-01-01", // Neujahr
    "2034-04-07", // Karfreitag
    "2034-04-10", // Ostermontag
    "2034-05-01", // Tag der Arbeit
    "2034-05-18", // Christi Himmelfahrt
    "2034-05-29", // Pfingstmontag
    "2034-06-08", // Fronleichnam
    "2034-10-03", // Tag der Deutschen Einheit
    "2034-11-01", // Allerheiligen
    "2034-12-25", // 1. Weihnachtsfeiertag
    "2034-12-26", // 2. Weihnachtsfeiertag

    // 2035
    "2035-01-01", // Neujahr
    "2035-03-23", // Karfreitag
    "2035-03-26", // Ostermontag
    "2035-05-01", // Tag der Arbeit
    "2035-05-03", // Christi Himmelfahrt
    "2035-05-14", // Pfingstmontag
    "2035-05-24", // Fronleichnam
    "2035-10-03", // Tag der Deutschen Einheit
    "2035-11-01", // Allerheiligen
    "2035-12-25", // 1. Weihnachtsfeiertag
    "2035-12-26", // 2. Weihnachtsfeiertag
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
 * Unterstützt Übernacht-Dienste und 24-Stunden-Schichten
 */
export function calculateTotalHours(start: string, end: string): number {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)

    let minutes = (endH * 60 + endM) - (startH * 60 + startM)

    // Übernacht-Dienst (Ende < Start)
    if (minutes < 0) {
        minutes += 24 * 60
    }

    // 24-Stunden-Schicht (0:00 bis 0:00 = 24 Stunden, nicht 0 Stunden)
    if (minutes === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
        minutes = 24 * 60
    }

    return minutes / 60
}

/**
 * Berechnet Nachtstunden (23:00-06:00) für einen Dienst
 * Unterstützt Übernacht-Dienste und 24-Stunden-Schichten
 *
 * WICHTIG: Nachtstunden bestehen aus ZWEI Fenstern:
 * - Fenster 1: 0:00-6:00 (früher Morgen)
 * - Fenster 2: 23:00-24:00 (und darüber hinaus bis 6:00 am nächsten Tag)
 *
 * Bei einer 24-Stunden-Schicht (0:00-0:00) sind das 7 Stunden:
 * - 0:00-6:00 = 6 Stunden
 * - 23:00-24:00 = 1 Stunde
 */
export function calculateNightHours(start: string, end: string, date: Date): number {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)

    const startMinutes = startH * 60 + startM
    let endMinutes = endH * 60 + endM

    // Übernacht-Dienst: Ende am nächsten Tag (z.B. 18:00-6:00 oder 0:00-0:00)
    if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60 // 1440
    }

    // Zwei Nachtfenster definieren:
    // Fenster 1: 0:00-6:00 (0-360 Minuten)
    // Fenster 2: 23:00-30:00 (1380-1800 Minuten, wobei 30:00 = 6:00 nächster Tag)
    const nightWindow1Start = 0
    const nightWindow1End = 6 * 60 // 360
    const nightWindow2Start = 23 * 60 // 1380 - Nachtarbeit beginnt um 23 Uhr
    const nightWindow2End = 30 * 60 // 1800

    let nightMinutes = 0

    // Überschneidung mit Fenster 1 (0:00-6:00)
    if (startMinutes < nightWindow1End && endMinutes > nightWindow1Start) {
        const overlapStart = Math.max(startMinutes, nightWindow1Start)
        const overlapEnd = Math.min(endMinutes, nightWindow1End)
        nightMinutes += Math.max(0, overlapEnd - overlapStart)
    }

    // Überschneidung mit Fenster 2 (23:00-30:00)
    if (startMinutes < nightWindow2End && endMinutes > nightWindow2Start) {
        const overlapStart = Math.max(startMinutes, nightWindow2Start)
        const overlapEnd = Math.min(endMinutes, nightWindow2End)
        nightMinutes += Math.max(0, overlapEnd - overlapStart)
    }

    return nightMinutes / 60
}

/**
 * Berechnet Backup-Statistiken für einen Mitarbeiter
 *
 * LOGIK:
 * - Zählt alle Schichten, bei denen der Mitarbeiter als Backup eingetragen ist
 * - Berechnet Arbeitsstunden NUR wenn Haupt-Person abwesend ist (SICK/VACATION)
 * - Berechnet auch Zuschläge (Nacht/Sonntag/Feiertag) für eingesprungene Schichten
 */
export function calculateBackupStats(
    allTimesheets: any[],
    userId: string,
    employee: {
        nightPremiumEnabled: boolean
        sundayPremiumEnabled: boolean
        holidayPremiumEnabled: boolean
    }
): {
    backupDays: number
    backupHours: number
    backupNightHours: number
    backupSundayHours: number
    backupHolidayHours: number
} {
    let backupHours = 0
    let backupNightHours = 0
    let backupSundayHours = 0
    let backupHolidayHours = 0

    const backupDates = new Set<string>()

    // Debug: Zähle wie viele Timesheets überhaupt backupEmployeeId haben
    const sheetsWithBackup = allTimesheets.filter(ts => ts.backupEmployeeId)
    console.log(`[BACKUP DEBUG] userId: ${userId}, totalSheets: ${allTimesheets.length}, sheetsWithBackupId: ${sheetsWithBackup.length}`)

    allTimesheets.forEach(ts => {
        // Prüfen ob dieser User als Backup eingetragen ist
        if (ts.backupEmployeeId === userId) {
            const dateStr = new Date(ts.date).toISOString().split('T')[0]
            backupDates.add(dateStr)
            console.log(`[BACKUP DEBUG] Found backup match for userId ${userId} on ${dateStr}`)

            // Stunden NUR zählen wenn Haupt-Person abwesend ist
            if (ts.absenceType === "SICK" || ts.absenceType === "VACATION") {
                const start = ts.actualStart || ts.plannedStart
                const end = ts.actualEnd || ts.plannedEnd

                if (start && end) {
                    const date = new Date(ts.date)
                    const hours = calculateTotalHours(start, end)
                    backupHours += hours
                    console.log(`[BACKUP DEBUG] Main person absent (${ts.absenceType}), crediting ${hours}h to backup`)

                    // Zuschläge berechnen
                    if (employee.nightPremiumEnabled) {
                        backupNightHours += calculateNightHours(start, end, date)
                    }

                    if (employee.sundayPremiumEnabled && isSundayDate(date)) {
                        backupSundayHours += hours
                    }

                    if (employee.holidayPremiumEnabled && isNRWHoliday(date)) {
                        backupHolidayHours += hours
                    }
                }
            }
        }
    })

    console.log(`[BACKUP DEBUG] Result for userId ${userId}: backupDays=${backupDates.size}, backupHours=${backupHours}`)

    return {
        backupDays: backupDates.size,
        backupHours: Math.round(backupHours * 100) / 100,
        backupNightHours: Math.round(backupNightHours * 100) / 100,
        backupSundayHours: Math.round(backupSundayHours * 100) / 100,
        backupHolidayHours: Math.round(backupHolidayHours * 100) / 100
    }
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
    backupHours: number
} {
    let totalHours = 0
    let nightHours = 0
    let sundayHours = 0
    let holidayHours = 0
    let sickDays = 0
    let sickHours = 0
    let vacationDays = 0
    let vacationHours = 0
    const sickDates = new Set<string>()
    const vacationDates = new Set<string>()

    timesheets.forEach(ts => {
        const date = new Date(ts.date)

        // Abwesenheiten (mit Fallback auf planned times)
        if (ts.absenceType === "SICK") {
            const dateStr = date.toISOString().split('T')[0]
            sickDates.add(dateStr)

            const startTime = ts.actualStart || ts.plannedStart
            const endTime = ts.actualEnd || ts.plannedEnd

            if (startTime && endTime) {
                const hours = calculateTotalHours(startTime, endTime)
                sickHours += hours
            }
        } else if (ts.absenceType === "VACATION") {
            const dateStr = date.toISOString().split('T')[0]
            vacationDates.add(dateStr)

            const startTime = ts.actualStart || ts.plannedStart
            const endTime = ts.actualEnd || ts.plannedEnd

            if (startTime && endTime) {
                const hours = calculateTotalHours(startTime, endTime)
                vacationHours += hours
            }
        }

        // Nur tatsächlich gearbeitete Stunden zählen (nicht Abwesenheiten)
        // FIX: Fallback auf planned times für bestätigte Dienste
        const isConfirmed = ['CONFIRMED', 'CHANGED', 'SUBMITTED', 'COMPLETED'].includes(ts.status)

        if (isConfirmed && !ts.absenceType) {
            // Verwende actual wenn vorhanden, sonst planned
            const startTime = ts.actualStart || ts.plannedStart
            const endTime = ts.actualEnd || ts.plannedEnd

            if (startTime && endTime) {
                const hours = calculateTotalHours(startTime, endTime)
                totalHours += hours

                // Nachtstunden (23:00-06:00)
                if (employee.nightPremiumEnabled) {
                    const nightHrs = calculateNightHours(startTime, endTime, date)
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
        }
    })

    sickDays = sickDates.size
    vacationDays = vacationDates.size

    // Backup-Statistiken berechnen (inklusive Stunden-Gutschrift bei Abwesenheit)
    let backupStats = {
        backupDays: 0,
        backupHours: 0,
        backupNightHours: 0,
        backupSundayHours: 0,
        backupHolidayHours: 0
    }

    if (employee.id && allTimesheetsForBackup) {
        backupStats = calculateBackupStats(allTimesheetsForBackup, employee.id, {
            nightPremiumEnabled: employee.nightPremiumEnabled,
            sundayPremiumEnabled: employee.sundayPremiumEnabled,
            holidayPremiumEnabled: employee.holidayPremiumEnabled
        })
    }

    // WICHTIG: Backup-Stunden zu Gesamt-Stunden addieren (wenn eingesprungen)
    totalHours += backupStats.backupHours
    nightHours += backupStats.backupNightHours
    sundayHours += backupStats.backupSundayHours
    holidayHours += backupStats.backupHolidayHours

    return {
        totalHours: Math.round(totalHours * 100) / 100,
        nightHours: Math.round(nightHours * 100) / 100,
        sundayHours: Math.round(sundayHours * 100) / 100,
        holidayHours: Math.round(holidayHours * 100) / 100,
        sickDays,
        sickHours: Math.round(sickHours * 100) / 100,
        vacationDays,
        vacationHours: Math.round(vacationHours * 100) / 100,
        backupDays: backupStats.backupDays,
        backupHours: backupStats.backupHours
    }
}
