"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react"
import { useAdminTimesheets } from "@/hooks/use-admin-data"
import TimesheetDetail from "@/components/TimesheetDetail"

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

function calcHours(start: string | null, end: string | null): number {
    if (!start || !end) return 0
    const [sh, sm] = start.split(":").map(Number)
    const [eh, em] = end.split(":").map(Number)
    let minutes = (eh * 60 + em) - (sh * 60 + sm)
    if (minutes < 0) minutes += 24 * 60
    return minutes / 60
}

interface EmployeeRow {
    employeeId: string
    employeeName: string
    clientId: string | null
    clientName: string | null
    plannedHours: number
    actualHours: number
    shiftCount: number
    sickDays: number
    vacationDays: number
}

export default function EmployeeTimesheetsPage() {
    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())
    const [selectedEmployee, setSelectedEmployee] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)

    const { timesheets, isLoading, mutate } = useAdminTimesheets(month, year)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const handleRefresh = async () => {
        setIsRefreshing(true)
        await mutate()
        setIsRefreshing(false)
    }

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
                    plannedHours: 0,
                    actualHours: 0,
                    shiftCount: 0,
                    sickDays: 0,
                    vacationDays: 0,
                }
                map.set(key, row)
            }

            row.shiftCount++

            if (ts.absenceType === "SICK") {
                row.sickDays++
            } else if (ts.absenceType === "VACATION") {
                row.vacationDays++
            } else {
                // Soll = geplante Stunden
                row.plannedHours += calcHours(ts.plannedStart, ts.plannedEnd)
                // Ist = tatsaechliche Stunden (falls vorhanden)
                if (ts.actualStart && ts.actualEnd) {
                    row.actualHours += calcHours(ts.actualStart, ts.actualEnd)
                }
            }
        }

        return Array.from(map.values()).sort((a, b) =>
            a.employeeName.localeCompare(b.employeeName, "de")
        )
    }, [timesheets])

    const totals = useMemo(() => ({
        planned: employeeRows.reduce((s, r) => s + r.plannedHours, 0),
        actual: employeeRows.reduce((s, r) => s + r.actualHours, 0),
    }), [employeeRows])

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

                    {/* Refresh button */}
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                        title="Daten aktualisieren"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
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
                                    <th className="px-4 py-3 font-medium text-right">Soll</th>
                                    <th className="px-4 py-3 font-medium text-right">Ist</th>
                                    <th className="px-4 py-3 font-medium text-center">Abwesenheit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employeeRows.map((row) => {
                                    const diff = row.actualHours - row.plannedHours
                                    const hasActual = row.actualHours > 0

                                    return (
                                        <tr
                                            key={row.employeeId}
                                            onClick={() => {
                                                setSelectedEmployee({
                                                    employeeId: row.employeeId,
                                                    clientId: row.clientId || "",
                                                })
                                            }}
                                            className="border-b border-neutral-800/50 transition-colors hover:bg-neutral-800/50 cursor-pointer"
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
                                            <td className="px-4 py-3 text-right text-sm tabular-nums text-neutral-400">
                                                {row.shiftCount}
                                            </td>

                                            {/* Soll (planned) */}
                                            <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                                                {row.plannedHours.toFixed(1)}h
                                            </td>

                                            {/* Ist (actual) */}
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {hasActual ? (
                                                    <div>
                                                        <span className="font-medium text-white">
                                                            {row.actualHours.toFixed(1)}h
                                                        </span>
                                                        {diff !== 0 && (
                                                            <span className={`ml-1.5 text-xs ${
                                                                diff > 0 ? "text-emerald-400" : "text-red-400"
                                                            }`}>
                                                                {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-neutral-600">-</span>
                                                )}
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
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>

                        {/* Summary footer */}
                        <div className="px-4 py-3 bg-neutral-800/50 border-t border-neutral-800 flex items-center justify-between text-sm">
                            <span className="text-neutral-400">
                                {employeeRows.length} Mitarbeiter
                            </span>
                            <div className="flex items-center gap-4 tabular-nums">
                                <span className="text-neutral-400">
                                    Soll: {totals.planned.toFixed(1)}h
                                </span>
                                <span className="text-white font-medium">
                                    Ist: {totals.actual.toFixed(1)}h
                                </span>
                            </div>
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
