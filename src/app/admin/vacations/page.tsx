"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Thermometer,
    Palmtree,
    User
} from "lucide-react"
import { format } from "date-fns"
import { de } from "date-fns/locale"

interface AbsenceEntry {
    id: string
    date: string
    type: "VACATION" | "SICK"
    hours: number
    employee: {
        id: string
        name: string | null
    }
    note: string | null
}

// Loading Fallback
function VacationsLoading() {
    return (
        <div className="min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                <p className="text-neutral-400 font-medium">Abwesenheiten werden geladen...</p>
            </div>
        </div>
    )
}

// Main Page
export default function VacationsPage() {
    return (
        <Suspense fallback={<VacationsLoading />}>
            <VacationsContent />
        </Suspense>
    )
}

function VacationsContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    // Date state
    const [currentDate, setCurrentDate] = useState(() => {
        const monthParam = searchParams.get('month')
        const yearParam = searchParams.get('year')
        if (monthParam && yearParam) {
            const m = parseInt(monthParam, 10)
            const y = parseInt(yearParam, 10)
            if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
                return new Date(y, m - 1, 1)
            }
        }

        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('admin-selected-month')
                if (saved) {
                    const { month: savedMonth, year: savedYear } = JSON.parse(saved)
                    if (savedMonth >= 1 && savedMonth <= 12 && savedYear >= 2020 && savedYear <= 2100) {
                        return new Date(savedYear, savedMonth - 1, 1)
                    }
                }
            } catch {
                // Ignore
            }
        }

        return new Date()
    })

    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    // Sync URL
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('month', String(month))
        params.set('year', String(year))
        const newUrl = `${pathname}?${params.toString()}`
        router.replace(newUrl, { scroll: false })

        try {
            localStorage.setItem('admin-selected-month', JSON.stringify({ month, year }))
        } catch {
            // Ignore
        }
    }, [month, year, pathname, router, searchParams])

    // Data state
    const [absences, setAbsences] = useState<AbsenceEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<"ALL" | "VACATION" | "SICK">("ALL")

    // Load absences from Dienstplan (timesheets with absenceType)
    useEffect(() => {
        loadAbsences()
    }, [month, year])

    const loadAbsences = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/vacations/absences?month=${month}&year=${year}`)
            if (res.ok) {
                const data = await res.json()
                setAbsences(data.absences || [])
            }
        } catch (error) {
            console.error("Error loading absences:", error)
        } finally {
            setLoading(false)
        }
    }

    const navigateMonth = (delta: number) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
        setCurrentDate(newDate)
    }

    // Filter absences
    const filteredAbsences = absences.filter(a =>
        filter === "ALL" || a.type === filter
    )

    // Group by employee
    const groupedByEmployee = filteredAbsences.reduce((acc, absence) => {
        const empId = absence.employee.id
        if (!acc[empId]) {
            acc[empId] = {
                employee: absence.employee,
                entries: []
            }
        }
        acc[empId].entries.push(absence)
        return acc
    }, {} as Record<string, { employee: { id: string; name: string | null }; entries: AbsenceEntry[] }>)

    // Stats
    const stats = {
        vacation: absences.filter(a => a.type === "VACATION").length,
        sick: absences.filter(a => a.type === "SICK").length,
        vacationHours: absences.filter(a => a.type === "VACATION").reduce((sum, a) => sum + a.hours, 0),
        sickHours: absences.filter(a => a.type === "SICK").reduce((sum, a) => sum + a.hours, 0)
    }

    if (loading && absences.length === 0) {
        return <VacationsLoading />
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Calendar className="text-violet-400" size={28} />
                        Abwesenheits-Übersicht
                    </h1>

                    <a
                        href="https://urlaubs-app.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-600 transition font-medium"
                    >
                        <ExternalLink size={20} />
                        Urlaubs-App
                    </a>
                </div>

                {/* Month Navigation & Stats */}
                <div className="bg-neutral-900 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => navigateMonth(-1)}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="font-bold text-lg min-w-[150px] text-center text-white">
                                {format(currentDate, "MMMM yyyy", { locale: de })}
                            </span>
                            <button
                                onClick={() => navigateMonth(1)}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        {/* Filter */}
                        <div className="flex bg-neutral-800 rounded-lg p-1">
                            <button
                                onClick={() => setFilter("ALL")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                    filter === "ALL" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                Alle
                            </button>
                            <button
                                onClick={() => setFilter("VACATION")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                                    filter === "VACATION" ? "bg-cyan-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <Palmtree size={16} />
                                Urlaub
                            </button>
                            <button
                                onClick={() => setFilter("SICK")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                                    filter === "SICK" ? "bg-red-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <Thermometer size={16} />
                                Krank
                            </button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Urlaubs-Tage</p>
                                    <p className="text-3xl font-bold text-cyan-400 mt-1">{stats.vacation}</p>
                                </div>
                                <Palmtree className="text-cyan-400" size={32} />
                            </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Urlaubs-Stunden</p>
                                    <p className="text-3xl font-bold text-cyan-400 mt-1">{stats.vacationHours.toFixed(1)}h</p>
                                </div>
                                <Calendar className="text-cyan-400" size={32} />
                            </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Krank-Tage</p>
                                    <p className="text-3xl font-bold text-red-400 mt-1">{stats.sick}</p>
                                </div>
                                <Thermometer className="text-red-400" size={32} />
                            </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Krank-Stunden</p>
                                    <p className="text-3xl font-bold text-red-400 mt-1">{stats.sickHours.toFixed(1)}h</p>
                                </div>
                                <Calendar className="text-red-400" size={32} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-4 mb-6">
                    <p className="text-blue-300 text-sm">
                        <strong>Hinweis:</strong> Diese Übersicht zeigt alle Urlaubs- und Krankheitstage aus dem Dienstplan.
                        Für detaillierte Urlaubsberechnungen (Resturlaub, Auszahlung) nutze die <a href="https://urlaubs-app.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">Urlaubs-App</a>.
                    </p>
                </div>

                {/* Absences grouped by employee */}
                <div className="space-y-4">
                    {Object.keys(groupedByEmployee).length === 0 ? (
                        <div className="bg-neutral-900 rounded-xl p-8 text-center text-neutral-500">
                            Keine Abwesenheiten für diesen Monat
                        </div>
                    ) : (
                        Object.values(groupedByEmployee).map(({ employee, entries }) => (
                            <div key={employee.id} className="bg-neutral-900 rounded-xl overflow-hidden">
                                {/* Employee Header */}
                                <div className="px-4 py-3 bg-neutral-800 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center">
                                        <User className="text-white" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold">{employee.name || "Unbenannt"}</p>
                                        <p className="text-neutral-400 text-xs">
                                            {entries.filter(e => e.type === "VACATION").length} Urlaub, {entries.filter(e => e.type === "SICK").length} Krank
                                        </p>
                                    </div>
                                </div>

                                {/* Entries */}
                                <div className="divide-y divide-neutral-800">
                                    {entries.sort((a, b) => a.date.localeCompare(b.date)).map(entry => (
                                        <div key={entry.id} className="px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50 transition">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2 rounded-lg ${
                                                    entry.type === "VACATION"
                                                        ? "bg-cyan-900/50 text-cyan-400"
                                                        : "bg-red-900/50 text-red-400"
                                                }`}>
                                                    {entry.type === "VACATION"
                                                        ? <Palmtree size={18} />
                                                        : <Thermometer size={18} />
                                                    }
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">
                                                        {format(new Date(entry.date), "EEEE, dd. MMMM", { locale: de })}
                                                    </p>
                                                    {entry.note && (
                                                        <p className="text-neutral-400 text-sm">{entry.note}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="bg-neutral-800 px-3 py-1 rounded text-sm font-medium text-neutral-300">
                                                    {entry.hours.toFixed(1)}h
                                                </span>
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                                    entry.type === "VACATION"
                                                        ? "bg-cyan-900/50 text-cyan-400"
                                                        : "bg-red-900/50 text-red-400"
                                                }`}>
                                                    {entry.type === "VACATION" ? "Urlaub" : "Krank"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
