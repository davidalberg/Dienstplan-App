"use client"

import { useEffect, useState } from "react"
import { Clock, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react"

interface OvertimeEntry {
    employeeId: string
    employeeName: string
    weeklyHours: number
    targetHours: number
    actualHours: number
    overtime: number
    sickHours: number
    vacationHours: number
}

interface OvertimeData {
    overtime: OvertimeEntry[]
    totals: {
        totalTarget: number
        totalActual: number
        totalOvertime: number
        totalSick: number
        totalVacation: number
    }
    month: number
    year: number
    employeeCount: number
}

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

export default function OvertimePage() {
    const [data, setData] = useState<OvertimeData | null>(null)
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())

    const fetchData = () => {
        setLoading(true)
        fetch(`/api/admin/overtime?month=${month}&year=${year}`)
            .then(res => res.json())
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fetchData()
    }, [month, year])

    const prevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1) }
        else setMonth(m => m - 1)
    }

    const nextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1) }
        else setMonth(m => m + 1)
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Clock className="text-amber-400" size={28} />
                        Ueberstunden-Report
                    </h1>
                    <div className="flex items-center gap-2">
                        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 transition">
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-white font-medium min-w-[160px] text-center">
                            {MONTH_NAMES[month - 1]} {year}
                        </span>
                        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 transition">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12 text-neutral-400">Lade Daten...</div>
                ) : !data ? (
                    <div className="text-center py-12 text-red-400">Fehler beim Laden</div>
                ) : (
                    <>
                        {/* Zusammenfassung */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                <p className="text-xs text-neutral-500 uppercase">Soll-Stunden</p>
                                <p className="text-2xl font-bold text-white mt-1">{data.totals.totalTarget.toFixed(1)}h</p>
                            </div>
                            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                <p className="text-xs text-neutral-500 uppercase">Ist-Stunden</p>
                                <p className="text-2xl font-bold text-white mt-1">{data.totals.totalActual.toFixed(1)}h</p>
                            </div>
                            <div className={`bg-neutral-900 rounded-xl p-4 border ${
                                data.totals.totalOvertime > 0 ? "border-amber-500/30" :
                                data.totals.totalOvertime < 0 ? "border-blue-500/30" : "border-neutral-800"
                            }`}>
                                <p className="text-xs text-neutral-500 uppercase">Ueberstunden</p>
                                <p className={`text-2xl font-bold mt-1 ${
                                    data.totals.totalOvertime > 0 ? "text-amber-400" :
                                    data.totals.totalOvertime < 0 ? "text-blue-400" : "text-white"
                                }`}>
                                    {data.totals.totalOvertime > 0 ? "+" : ""}{data.totals.totalOvertime.toFixed(1)}h
                                </p>
                            </div>
                            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                <p className="text-xs text-neutral-500 uppercase">Krank</p>
                                <p className="text-2xl font-bold text-red-400 mt-1">{data.totals.totalSick.toFixed(1)}h</p>
                            </div>
                            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                <p className="text-xs text-neutral-500 uppercase">Urlaub</p>
                                <p className="text-2xl font-bold text-cyan-400 mt-1">{data.totals.totalVacation.toFixed(1)}h</p>
                            </div>
                        </div>

                        {/* Tabelle */}
                        <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-neutral-800">
                                        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">Mitarbeiter</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Soll/Woche</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Soll/Monat</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Ist-Stunden</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Ueberstunden</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Krank</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Urlaub</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.overtime.map(entry => (
                                        <tr key={entry.employeeId} className="border-t border-neutral-800/50 hover:bg-neutral-800/30">
                                            <td className="px-4 py-3 text-sm text-white font-medium">{entry.employeeName}</td>
                                            <td className="px-4 py-3 text-sm text-neutral-400 text-right">{entry.weeklyHours}h</td>
                                            <td className="px-4 py-3 text-sm text-neutral-400 text-right">{entry.targetHours.toFixed(1)}h</td>
                                            <td className="px-4 py-3 text-sm text-white text-right font-medium">{entry.actualHours.toFixed(1)}h</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                                                    entry.overtime > 0 ? "text-amber-400" :
                                                    entry.overtime < 0 ? "text-blue-400" : "text-neutral-400"
                                                }`}>
                                                    {entry.overtime > 0 ? <TrendingUp size={14} /> :
                                                     entry.overtime < 0 ? <TrendingDown size={14} /> :
                                                     <Minus size={14} />}
                                                    {entry.overtime > 0 ? "+" : ""}{entry.overtime.toFixed(1)}h
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-right">
                                                {entry.sickHours > 0 ? (
                                                    <span className="text-red-400">{entry.sickHours.toFixed(1)}h</span>
                                                ) : (
                                                    <span className="text-neutral-600">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-right">
                                                {entry.vacationHours > 0 ? (
                                                    <span className="text-cyan-400">{entry.vacationHours.toFixed(1)}h</span>
                                                ) : (
                                                    <span className="text-neutral-600">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {data.overtime.length === 0 && (
                                <div className="text-center py-12 text-neutral-500">
                                    Keine Mitarbeiter-Daten fuer diesen Monat
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
