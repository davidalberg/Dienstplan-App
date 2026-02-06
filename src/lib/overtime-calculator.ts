/**
 * Ueberstunden-Calculator
 * Berechnet Soll/Ist/Ueberstunden pro Mitarbeiter und Monat
 */

import prisma from "@/lib/prisma"
import { calculateTotalHours } from "@/lib/premium-calculator"

export interface OvertimeResult {
    employeeId: string
    employeeName: string
    weeklyHours: number
    targetHours: number
    actualHours: number
    overtime: number
    sickHours: number
    vacationHours: number
}

/**
 * Berechnet die Anzahl der Arbeitswochen in einem Monat (anteilig)
 */
function getWorkWeeksInMonth(month: number, year: number): number {
    const daysInMonth = new Date(year, month, 0).getDate()
    return daysInMonth / 7
}

/**
 * Berechnet Ueberstunden fuer alle Mitarbeiter eines Monats
 */
export async function calculateOvertime(
    month: number,
    year: number,
    employeeId?: string
): Promise<OvertimeResult[]> {
    // Alle Mitarbeiter mit weeklyHours laden
    const whereClause: { role: string; id?: string } = { role: "EMPLOYEE" }
    if (employeeId) whereClause.id = employeeId

    const employees = await prisma.user.findMany({
        where: whereClause,
        select: {
            id: true,
            name: true,
            email: true,
            weeklyHours: true
        }
    })

    // Alle Timesheets fuer den Monat laden
    const timesheets = await prisma.timesheet.findMany({
        where: {
            month,
            year,
            ...(employeeId ? { employeeId } : {}),
            status: { in: ["CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
        },
        select: {
            employeeId: true,
            plannedStart: true,
            plannedEnd: true,
            actualStart: true,
            actualEnd: true,
            absenceType: true,
            status: true
        }
    })

    // Gruppiere Timesheets nach Employee
    const byEmployee = new Map<string, typeof timesheets>()
    for (const ts of timesheets) {
        const list = byEmployee.get(ts.employeeId) || []
        list.push(ts)
        byEmployee.set(ts.employeeId, list)
    }

    const workWeeks = getWorkWeeksInMonth(month, year)

    return employees.map(emp => {
        const empTimesheets = byEmployee.get(emp.id) || []
        const weeklyHours = emp.weeklyHours || 40
        const targetHours = Math.round(weeklyHours * workWeeks * 100) / 100

        let actualHours = 0
        let sickHours = 0
        let vacationHours = 0

        for (const ts of empTimesheets) {
            const start = ts.actualStart || ts.plannedStart
            const end = ts.actualEnd || ts.plannedEnd

            if (!start || !end) continue

            const hours = calculateTotalHours(start, end)

            if (ts.absenceType === "SICK") {
                sickHours += hours
            } else if (ts.absenceType === "VACATION") {
                vacationHours += hours
            } else {
                actualHours += hours
            }
        }

        // Ueberstunden = tatsaechlich gearbeitet - Soll
        // Krank/Urlaub zaehlt nicht als gearbeitete Zeit, aber auch nicht als Fehlzeit
        const overtime = Math.round((actualHours - targetHours) * 100) / 100

        return {
            employeeId: emp.id,
            employeeName: emp.name || emp.email,
            weeklyHours,
            targetHours: Math.round(targetHours * 100) / 100,
            actualHours: Math.round(actualHours * 100) / 100,
            overtime,
            sickHours: Math.round(sickHours * 100) / 100,
            vacationHours: Math.round(vacationHours * 100) / 100
        }
    })
}
