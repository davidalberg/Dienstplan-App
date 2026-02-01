"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect, useMemo } from "react"
import { format, addWeeks, startOfWeek } from "date-fns"
import { de } from "date-fns/locale"
import { Users, ChevronLeft, ChevronRight } from "lucide-react"
import { showToast } from "@/lib/toast-utils"

interface Shift {
    id: string
    start: string
    end: string
    hours: number
    status: string
    absenceType: string | null
    note: string | null
}

interface Employee {
    id: string
    name: string
    teamId: string | null
    teamName: string
    shifts: Record<number, Shift>
}

interface Team {
    id: string
    name: string
}

interface OverviewData {
    weekStart: string
    weekEnd: string
    weekLabel: string
    employees: Employee[]
    teams: Team[]
}

export default function TeamOverviewPage() {
    const { data: session } = useSession()
    const [currentWeek, setCurrentWeek] = useState(() => {
        const today = new Date()
        const weekStart = startOfWeek(today, { weekStartsOn: 1 })
        const year = weekStart.getFullYear()
        const firstDayOfYear = new Date(year, 0, 1)
        const weekNumber = Math.ceil(((weekStart.getTime() - firstDayOfYear.getTime()) / 86400000 + firstDayOfYear.getDay() + 1) / 7)
        return `${year}-W${weekNumber.toString().padStart(2, "0")}`
    })

    const [selectedTeam, setSelectedTeam] = useState<string>("")
    const [showAvailableOnly, setShowAvailableOnly] = useState(false)
    const [data, setData] = useState<OverviewData | null>(null)
    const [loading, setLoading] = useState(true)
    const [selectedShift, setSelectedShift] = useState<{ employee: Employee; shift: Shift; day: number } | null>(null)

    const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const params = new URLSearchParams({
                    week: currentWeek
                })
                if (selectedTeam) params.append("teamId", selectedTeam)

                const res = await fetch(`/api/admin/team-overview?${params}`)
                if (res.ok) {
                    const json = await res.json()
                    setData(json)
                } else {
                    showToast("error", "Fehler beim Laden der Daten")
                }
            } catch (err) {
                showToast("error", "Netzwerkfehler")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [currentWeek, selectedTeam])

    // Filter employees
    const filteredEmployees = useMemo(() => {
        if (!data) return []

        let employees = data.employees

        // Filter: Only show employees with at least one shift
        if (showAvailableOnly) {
            employees = employees.filter(emp => {
                return Object.keys(emp.shifts).length > 0
            })
        }

        return employees
    }, [data, showAvailableOnly])

    const navigateWeek = (delta: number) => {
        const [yearStr, weekStr] = currentWeek.split("-W")
        const year = parseInt(yearStr)
        const week = parseInt(weekStr)

        const firstDayOfYear = new Date(year, 0, 1)
        const daysOffset = (week - 1) * 7
        const weekStartDate = new Date(firstDayOfYear.getTime() + daysOffset * 24 * 60 * 60 * 1000)
        const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 })

        const newWeekStart = addWeeks(weekStart, delta)
        const newYear = newWeekStart.getFullYear()
        const newFirstDay = new Date(newYear, 0, 1)
        const newWeekNumber = Math.ceil(((newWeekStart.getTime() - newFirstDay.getTime()) / 86400000 + newFirstDay.getDay() + 1) / 7)

        setCurrentWeek(`${newYear}-W${newWeekNumber.toString().padStart(2, "0")}`)
    }

    const getShiftColor = (shift: Shift | undefined) => {
        if (!shift) return "bg-neutral-800 text-neutral-500"

        // Absence types (distinct colors to avoid confusion)
        if (shift.absenceType === "SICK") return "bg-rose-500/20 text-rose-400"
        if (shift.absenceType === "VACATION") return "bg-cyan-500/20 text-cyan-400"

        // Color by hours (>10h uses orange to distinguish from SICK)
        if (shift.hours <= 8) return "bg-emerald-500/20 text-emerald-400"
        if (shift.hours <= 10) return "bg-yellow-500/20 text-yellow-400"
        return "bg-orange-500/20 text-orange-400"
    }

    const openShiftDetails = (employee: Employee, shift: Shift, day: number) => {
        setSelectedShift({ employee, shift, day })
    }

    const closeShiftDetails = () => {
        setSelectedShift(null)
    }

    if (!session) return null

    if (loading) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                    <p className="text-neutral-400 font-medium">Team-Übersicht wird geladen...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Users className="text-violet-400" size={28} />
                        Team-Wochenübersicht
                    </h1>
                    <p className="text-neutral-400 mt-1">Alle Mitarbeiter und ihre Schichten der Woche im Überblick</p>
                </div>

                {/* Filter Bar */}
                <div className="bg-neutral-900 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            {/* Week Navigation */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => navigateWeek(-1)}
                                    className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                                    aria-label="Vorherige Woche"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="font-bold text-lg min-w-[200px] text-center text-white">
                                    {data?.weekLabel || currentWeek}
                                </span>
                                <button
                                    onClick={() => navigateWeek(1)}
                                    className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                                    aria-label="Nächste Woche"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>

                            {/* Team Filter */}
                            <select
                                value={selectedTeam}
                                onChange={(e) => setSelectedTeam(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-medium text-white"
                            >
                                <option value="">Alle Teams</option>
                                {data?.teams.map(team => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))}
                            </select>

                            {/* Available Only Filter */}
                            <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showAvailableOnly}
                                    onChange={(e) => setShowAvailableOnly(e.target.checked)}
                                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-violet-600 focus:ring-violet-500"
                                />
                                Nur verfügbare Mitarbeiter
                            </label>
                        </div>

                        <div className="text-sm text-neutral-400">
                            <span className="font-bold text-white">{filteredEmployees.length}</span> Mitarbeiter
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-neutral-900 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-neutral-800">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide sticky left-0 bg-neutral-800 z-10">
                                        Mitarbeiter
                                    </th>
                                    {dayNames.map((day, idx) => (
                                        <th key={idx} className="px-4 py-3 text-center text-xs font-semibold text-neutral-400 uppercase tracking-wide min-w-[120px]">
                                            {day}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                                            Keine Mitarbeiter gefunden
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmployees.map(employee => (
                                        <tr key={employee.id} className="hover:bg-neutral-800/50 transition">
                                            <td className="px-4 py-3 font-medium text-white sticky left-0 bg-neutral-900 z-10">
                                                <div>
                                                    <div className="text-sm">{employee.name}</div>
                                                    <div className="text-xs text-neutral-500">{employee.teamName}</div>
                                                </div>
                                            </td>
                                            {dayNames.map((_, dayIdx) => {
                                                const shift = employee.shifts[dayIdx]
                                                return (
                                                    <td key={dayIdx} className="px-2 py-2 text-center">
                                                        {shift ? (
                                                            <button
                                                                onClick={() => openShiftDetails(employee, shift, dayIdx)}
                                                                className={`w-full px-2 py-2 rounded-lg text-xs font-medium transition cursor-pointer hover:brightness-110 ${getShiftColor(shift)}`}
                                                            >
                                                                <div>{shift.start}-{shift.end}</div>
                                                                <div className="text-[10px] mt-0.5">{shift.hours.toFixed(1)}h</div>
                                                            </button>
                                                        ) : (
                                                            <div className="bg-neutral-800 px-2 py-2 rounded-lg text-neutral-500 text-xs">
                                                                -
                                                            </div>
                                                        )}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Color Legend */}
                <div className="mt-6 bg-neutral-900 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Farbcodierung</h3>
                    <div className="flex flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/40"></div>
                            <span className="text-neutral-400">≤8h (Normal)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-yellow-500/20 border border-yellow-500/40"></div>
                            <span className="text-neutral-400">&gt;8h und ≤10h (Überstunden)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-orange-500/20 border border-orange-500/40"></div>
                            <span className="text-neutral-400">&gt;10h (Viele Überstunden)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-cyan-500/20 border border-cyan-500/40"></div>
                            <span className="text-neutral-400">Urlaub</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-rose-500/20 border border-rose-500/40"></div>
                            <span className="text-neutral-400">Krank</span>
                        </div>
                    </div>
                </div>

                {/* Shift Detail Modal */}
                {selectedShift && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                        <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full border border-neutral-800">
                            <div className="px-6 py-4 border-b border-neutral-800">
                                <h3 className="text-lg font-bold text-white">Schicht-Details</h3>
                                <p className="text-sm text-neutral-400 mt-1">
                                    {selectedShift.employee.name} - {dayNames[selectedShift.day]}
                                </p>
                            </div>
                            <div className="p-6 space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-neutral-500">Zeit</label>
                                    <p className="text-white font-medium">
                                        {selectedShift.shift.start} - {selectedShift.shift.end} ({selectedShift.shift.hours.toFixed(1)}h)
                                    </p>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-neutral-500">Status</label>
                                    <p className="text-white">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                            selectedShift.shift.absenceType === "SICK" ? "bg-rose-900/50 text-rose-400" :
                                            selectedShift.shift.absenceType === "VACATION" ? "bg-cyan-900/50 text-cyan-400" :
                                            selectedShift.shift.status === "CONFIRMED" ? "bg-green-900/50 text-green-400" :
                                            selectedShift.shift.status === "CHANGED" ? "bg-amber-900/50 text-amber-400" :
                                            selectedShift.shift.status === "SUBMITTED" ? "bg-blue-900/50 text-blue-400" :
                                            selectedShift.shift.status === "COMPLETED" ? "bg-emerald-900/50 text-emerald-400" :
                                            "bg-neutral-800 text-neutral-400"
                                        }`}>
                                            {selectedShift.shift.absenceType === "SICK" ? "Krank" :
                                             selectedShift.shift.absenceType === "VACATION" ? "Urlaub" :
                                             selectedShift.shift.status === "CONFIRMED" ? "Bestätigt" :
                                             selectedShift.shift.status === "CHANGED" ? "Geändert" :
                                             selectedShift.shift.status === "SUBMITTED" ? "Eingereicht" :
                                             selectedShift.shift.status === "COMPLETED" ? "Abgeschlossen" : "Geplant"}
                                        </span>
                                    </p>
                                </div>
                                {selectedShift.shift.note && (
                                    <div>
                                        <label className="text-xs font-medium text-neutral-500">Notiz</label>
                                        <p className="text-neutral-300 text-sm">{selectedShift.shift.note}</p>
                                    </div>
                                )}
                            </div>
                            <div className="px-6 py-4 border-t border-neutral-800">
                                <button
                                    onClick={closeShiftDetails}
                                    className="w-full bg-violet-600 text-white py-2.5 rounded-xl font-bold hover:bg-violet-700 transition-colors"
                                >
                                    Schließen
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
