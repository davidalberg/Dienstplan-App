"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp } from "lucide-react"
import StatisticsDetails from "@/components/StatisticsDetails"

interface Discrepancy {
    date: string
    planned: string
    actual: string
    diffText: string
}

interface EmployeeStats {
    plannedHours: number
    actualHours: number
    difference: number
    discrepancies: Discrepancy[]
    totalHours?: number
    nightHours?: number
    sundayHours?: number
    holidayHours?: number
    backupDays?: number
    sickDays?: number
    sickHours?: number
    vacationDays?: number
    vacationHours?: number
}

interface TeamEmployee {
    id: string
    name: string
    email: string
    hasSubmitted: boolean
    stats: EmployeeStats
}

interface TeamData {
    employees: TeamEmployee[]
}

export default function TeamDetailPage() {
    const params = useParams()
    const router = useRouter()
    const source = decodeURIComponent(params.source as string)

    const [data, setData] = useState<TeamData | null>(null)
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    })
    const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())

    const toggleEmployee = (employeeId: string) => {
        setExpandedEmployees(prev => {
            const newSet = new Set(prev)
            if (newSet.has(employeeId)) {
                newSet.delete(employeeId)
            } else {
                newSet.add(employeeId)
            }
            return newSet
        })
    }

    const expandAll = () => {
        if (data?.employees) {
            setExpandedEmployees(new Set(data.employees.map((e: TeamEmployee) => e.id)))
        }
    }

    const collapseAll = () => {
        setExpandedEmployees(new Set())
    }

    useEffect(() => {
        fetchTeamData()
    }, [source, filters])

    const fetchTeamData = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/team-details?source=${encodeURIComponent(source)}&month=${filters.month}&year=${filters.year}`)
            if (res.ok) {
                const result = await res.json()
                setData(result)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleExport = () => {
        const exportUrl = `/api/timesheets/export?source=${encodeURIComponent(source)}&month=${filters.month}&year=${filters.year}`
        const link = document.createElement("a")
        link.href = exportUrl
        link.download = `${source}_${filters.month}_${filters.year}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto max-w-6xl">
                    <p className="text-center text-black py-20">Lade Daten...</p>
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto max-w-6xl">
                    <p className="text-center text-red-600 py-20">Fehler beim Laden der Daten</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-6 flex items-center justify-between">
                    <Link
                        href="/admin"
                        className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
                    >
                        <ArrowLeft size={16} />
                        Zurück zum Admin Panel
                    </Link>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-green-700"
                    >
                        <Download size={20} />
                        Excel Export
                    </button>
                </div>

                <header className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-black">{source}</h1>
                        <p className="text-gray-900 font-bold">Übersicht für {data.employees.length} Mitarbeiter</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={expandAll}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                        >
                            <ChevronDown size={14} />
                            Alle öffnen
                        </button>
                        <button
                            type="button"
                            onClick={collapseAll}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                        >
                            <ChevronUp size={14} />
                            Alle schließen
                        </button>
                    </div>
                </header>

                <div className="mb-6 flex gap-2 items-center bg-white rounded-xl p-4 shadow-sm ring-1 ring-gray-200">
                    <span className="text-sm font-black uppercase text-black">Zeitraum:</span>
                    <input
                        type="number"
                        value={filters.month}
                        onChange={e => setFilters({ ...filters, month: parseInt(e.target.value, 10) })}
                        className="w-16 rounded-lg border border-gray-200 p-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-300">/</span>
                    <input
                        type="number"
                        value={filters.year}
                        onChange={e => setFilters({ ...filters, year: parseInt(e.target.value, 10) })}
                        className="w-20 rounded-lg border border-gray-200 p-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="space-y-4">
                    {data.employees.map((emp: TeamEmployee) => {
                        const isExpanded = expandedEmployees.has(emp.id)
                        return (
                            <div key={emp.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
                                {/* Klickbarer Header */}
                                <button
                                    type="button"
                                    onClick={() => toggleEmployee(emp.id)}
                                    className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-black text-lg">
                                            {emp.name?.charAt(0) || "?"}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-black">{emp.name}</h3>
                                            <p className="text-sm text-black">{emp.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* Kompakte Statistik-Vorschau */}
                                        <div className="hidden sm:flex items-center gap-3 mr-4">
                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                                {emp.stats.plannedHours.toFixed(1)}h Plan
                                            </span>
                                            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                                                {emp.stats.actualHours.toFixed(1)}h Ist
                                            </span>
                                        </div>
                                        {emp.hasSubmitted ? (
                                            <div className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
                                                <CheckCircle size={14} />
                                                Eingereicht
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">
                                                <Clock size={14} />
                                                Ausstehend
                                            </div>
                                        )}
                                        {isExpanded ? (
                                            <ChevronUp size={20} className="text-gray-400" />
                                        ) : (
                                            <ChevronDown size={20} className="text-gray-400" />
                                        )}
                                    </div>
                                </button>

                                {/* Aufklappbarer Inhalt */}
                                {isExpanded && (
                                    <div className="px-6 pb-6 border-t border-gray-100">
                                        <div className="grid grid-cols-3 gap-6 mt-6">
                                            <div className="rounded-xl bg-blue-50 p-4">
                                                <p className="text-xs font-black uppercase text-blue-600 mb-2">Geplante Stunden</p>
                                                <p className="text-2xl font-black text-blue-900">{emp.stats.plannedHours.toFixed(2)} Std.</p>
                                            </div>
                                            <div className="rounded-xl bg-green-50 p-4">
                                                <p className="text-xs font-black uppercase text-green-600 mb-2">Tatsächliche Stunden</p>
                                                <p className="text-2xl font-black text-green-900">{emp.stats.actualHours.toFixed(2)} Std.</p>
                                            </div>
                                            <div className={`rounded-xl p-4 ${emp.stats.difference >= 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
                                                <p className={`text-xs font-black uppercase mb-2 ${emp.stats.difference >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    Differenz
                                                </p>
                                                <p className={`text-2xl font-black ${emp.stats.difference >= 0 ? 'text-amber-900' : 'text-red-900'}`}>
                                                    {emp.stats.difference >= 0 ? '+' : ''}{emp.stats.difference.toFixed(2)} Std.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Detaillierte Statistiken */}
                                        {emp.stats.nightHours !== undefined && (
                                            <div className="mt-6">
                                                <p className="text-xs font-black uppercase text-gray-600 mb-4">Detaillierte Statistiken</p>
                                                <StatisticsDetails stats={emp.stats} variant="detailed" />
                                            </div>
                                        )}

                                        {emp.stats.discrepancies.length > 0 && (
                                            <div className="mt-6 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <AlertCircle size={16} className="text-red-600" />
                                                    <p className="text-sm font-black uppercase text-red-600">
                                                        {emp.stats.discrepancies.length} Zeitliche Abweichung(en)
                                                    </p>
                                                </div>
                                                <div className="space-y-2">
                                                    {emp.stats.discrepancies.map((disc: Discrepancy, idx: number) => (
                                                        <div key={idx} className="text-sm text-red-900">
                                                            <span className="font-bold">{disc.date}:</span> Geplant {disc.planned}, Tatsächlich {disc.actual} ({disc.diffText})
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
