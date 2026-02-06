"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Check, Loader2, FileText } from "lucide-react"
import { useAdminTimesheets } from "@/hooks/use-admin-data"
import TimesheetDetail from "@/components/TimesheetDetail"

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

interface EmployeeRow {
    employeeId: string
    employeeName: string
    clientId: string | null
    clientName: string | null
    teamName: string | null
    totalHours: number
    shiftCount: number
    sickDays: number
    vacationDays: number
    hasActualTimes: boolean
}

export default function EmployeeTimesheetsPage() {
    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())
    const [selectedEmployee, setSelectedEmployee] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)

    const { timesheets, isLoading } = useAdminTimesheets(month, year)

    const navigateMonth = (direction: -1 | 1) => {
        let newMonth = month + direction
        let newYear = year
        if (newMonth < 1) { newMonth = 12; newYear-- }
        else if (newMonth > 12) { newMonth = 1; newYear++ }
        setMonth(newMonth)
        setYear(newYear)
    }

    const goToToday = () => {
        const today = new Date()
        setMonth(today.getMonth() + 1)
        setYear(today.getFullYear())
    }

    // Aggregate timesheets per employee
    const employeeRows = useMemo(() => {
        const map = new Map<string, EmployeeRow>()

        for (const ts of timesheets) {
            const key = ts.employeeId
            let row = map.get(key)
            if (!row) {
                row = {
                    employeeId: ts.employeeId,
                    employeeName: ts.employee?.name || "Unbekannt",
                    clientId: ts.team?.client?.id || null,
                    clientName: ts.team?.client
                        ? `${ts.team.client.firstName} ${ts.team.client.lastName}`
                        : null,
                    teamName: ts.team?.name || null,
                    totalHours: 0,
                    shiftCount: 0,
                    sickDays: 0,
                    vacationDays: 0,
                    hasActualTimes: false,
                }
                map.set(key, row)
            }

            row.shiftCount++

            if (ts.absenceType === "SICK") {
                row.sickDays++
            } else if (ts.absenceType === "VACATION") {
                row.vacationDays++
            } else {
                // Calculate hours from actual or planned times
                const start = ts.actualStart || ts.plannedStart
                const end = ts.actualEnd || ts.plannedEnd
                if (start && end) {
                    const [sh, sm] = start.split(":").map(Number)
                    const [eh, em] = end.split(":").map(Number)
                    let minutes = (eh * 60 + em) - (sh * 60 + sm)
                    if (minutes < 0) minutes += 24 * 60 // overnight
                    row.totalHours += minutes / 60
                }
            }

            if (ts.actualStart || ts.actualEnd) {
                row.hasActualTimes = true
            }
        }

        return Array.from(map.values()).sort((a, b) =>
            a.employeeName.localeCompare(b.employeeName, "de")
        )
    }, [timesheets])

    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            {/* Header */}
            <div className="border-b border-neutral-800 px-6 py-4">
                <h1 className="text-xl font-semibold">Stundennachweise</h1>

                {/* Filter bar */}
                <div className="flex items-center gap-4 mt-4">
                    {/* Count badge */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 rounded-lg text-sm">
                        <span className="text-neutral-400">{employeeRows.length}</span>
                        <span className="text-neutral-500">Mitarbeiter</span>
                    </div>

                    {/* Month navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => navigateMonth(-1)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-3 py-1.5 font-medium min-w-[140px] text-center">
                            {MONTH_NAMES[month - 1]} {year}
                        </span>
                        <button
                            onClick={() => navigateMonth(1)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Today button */}
                    <button
                        onClick={goToToday}
                        className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                        Heute
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                    </div>
                ) : employeeRows.length === 0 ? (
                    <div className="text-center py-12 text-neutral-500">
                        Keine Schichten fuer {MONTH_NAMES[month - 1]} {year}
                    </div>
                ) : (
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-800 text-left text-sm text-neutral-400">
                                    <th className="px-4 py-3 font-medium">Mitarbeiter</th>
                                    <th className="px-4 py-3 font-medium">Klient</th>
                                    <th className="px-4 py-3 font-medium text-right">Schichten</th>
                                    <th className="px-4 py-3 font-medium text-right">Stunden</th>
                                    <th className="px-4 py-3 font-medium text-center">Abwesenheit</th>
                                    <th className="px-4 py-3 font-medium text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employeeRows.map((row) => (
                                    <tr
                                        key={row.employeeId}
                                        onClick={() => {
                                            if (row.clientId) {
                                                setSelectedEmployee({
                                                    employeeId: row.employeeId,
                                                    clientId: row.clientId,
                                                })
                                            }
                                        }}
                                        className={`border-b border-neutral-800/50 transition-colors ${
                                            row.clientId
                                                ? "hover:bg-neutral-800/50 cursor-pointer"
                                                : "opacity-60"
                                        }`}
                                    >
                                        {/* Employee name */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-semibold">
                                                    {row.employeeName.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-medium">{row.employeeName}</span>
                                            </div>
                                        </td>

                                        {/* Client */}
                                        <td className="px-4 py-3 text-neutral-400 text-sm">
                                            {row.clientName || <span className="text-neutral-600">Kein Klient</span>}
                                        </td>

                                        {/* Shift count */}
                                        <td className="px-4 py-3 text-right text-sm tabular-nums">
                                            {row.shiftCount}
                                        </td>

                                        {/* Hours */}
                                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                                            {row.totalHours.toFixed(1)}h
                                        </td>

                                        {/* Absence */}
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {row.sickDays > 0 && (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                                                        {row.sickDays} Krank
                                                    </span>
                                                )}
                                                {row.vacationDays > 0 && (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">
                                                        {row.vacationDays} Urlaub
                                                    </span>
                                                )}
                                                {row.sickDays === 0 && row.vacationDays === 0 && (
                                                    <span className="text-neutral-600 text-xs">-</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3 text-center">
                                            {row.hasActualTimes ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                                                    <Check className="w-3 h-3" />
                                                    Erfasst
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-400 text-xs">
                                                    <FileText className="w-3 h-3" />
                                                    Geplant
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Summary footer */}
                        <div className="px-4 py-3 bg-neutral-800/50 border-t border-neutral-800 flex items-center justify-between text-sm">
                            <span className="text-neutral-400">
                                {employeeRows.length} Mitarbeiter
                            </span>
                            <span className="text-white font-medium tabular-nums">
                                Gesamt: {employeeRows.reduce((sum, r) => sum + r.totalHours, 0).toFixed(1)}h
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* TimesheetDetail Modal */}
            {selectedEmployee && (
                <TimesheetDetail
                    employeeId={selectedEmployee.employeeId}
                    clientId={selectedEmployee.clientId}
                    month={month}
                    year={year}
                    onClose={() => setSelectedEmployee(null)}
                />
            )}
        </div>
    )
}
