"use client"

import { useState } from "react"
import {
    Users,
    Clock,
    AlertCircle,
    CheckCircle2,
    Activity,
    Palmtree,
    HeartPulse,
    CalendarCheck,
    ChevronRight,
    Sunrise,
    CalendarDays,
    UserX
} from "lucide-react"
import Link from "next/link"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
})

interface TodayShift {
    id: string
    employeeName: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    status: string
}

interface DashboardData {
    todayShifts: TodayShift[]
    tomorrowShifts: TodayShift[]
    tomorrowDate: string
    pendingActions: {
        submissions: number
        unsignedEmployees: number
        vacationRequests: number
    }
    monthStats: {
        month: number
        year: number
        totalShifts: number
        completedShifts: number
        sickDays: number
        vacationDays: number
        completionRate: number
    }
    totalEmployees: number
    recentActivities: {
        id: string
        type: string
        category: string
        action: string
        userName: string | null
        createdAt: string
    }[]
    sickByEmployee: { employeeName: string; days: number }[]
    upcomingVacations: { employeeName: string; startDate: string; endDate: string }[]
    employeesWithoutShifts: { id: string; name: string }[]
    weekPreview: { date: string; shiftCount: number }[]
}

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

const DAY_NAMES_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]

function ShiftList({ shifts, emptyMessage }: { shifts: TodayShift[]; emptyMessage: string }) {
    if (shifts.length === 0) {
        return <p className="text-neutral-500 text-sm py-4 text-center">{emptyMessage}</p>
    }
    return (
        <>
            {shifts.map(shift => (
                <div key={shift.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-800/50">
                    <span className="text-sm text-white font-medium">{shift.employeeName}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-neutral-400">
                            {shift.actualStart || shift.plannedStart} - {shift.actualEnd || shift.plannedEnd}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${
                            shift.status === "CONFIRMED" || shift.status === "COMPLETED" ? "bg-green-400" :
                            shift.status === "CHANGED" ? "bg-amber-400" : "bg-neutral-500"
                        }`} />
                    </div>
                </div>
            ))}
        </>
    )
}

export default function AdminDashboardPage() {
    const [absenceTab, setAbsenceTab] = useState<"sick" | "vacation">("sick")

    const { data, isLoading, error } = useSWR<DashboardData>(
        '/api/admin/dashboard',
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            revalidateIfStale: false,
            keepPreviousData: true,
        }
    )

    // Nur beim allerersten Laden Spinner zeigen (kein data im Cache)
    if (!data && isLoading) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-neutral-400">Dashboard wird geladen...</div>
            </div>
        )
    }

    if (error && !data) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6">
                <p className="text-red-400">Fehler beim Laden des Dashboards</p>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-neutral-400">Dashboard wird geladen...</div>
            </div>
        )
    }

    const totalPending = data.pendingActions.submissions +
        data.pendingActions.unsignedEmployees

    const tomorrowDateObj = new Date(data.tomorrowDate)
    const tomorrowLabel = `${DAY_NAMES_SHORT[tomorrowDateObj.getDay()]}, ${tomorrowDateObj.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                    <span className="text-sm text-neutral-500">
                        {MONTH_NAMES[data.monthStats.month - 1]} {data.monthStats.year}
                    </span>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Heute im Dienst */}
                    <div className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-violet-500/10">
                                <Users size={20} className="text-violet-400" />
                            </div>
                            <span className="text-sm text-neutral-400">Heute im Dienst</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{data.todayShifts.length}</p>
                        <p className="text-xs text-neutral-500 mt-1">
                            von {data.totalEmployees} Mitarbeitern
                        </p>
                    </div>

                    {/* Ausstehende Aktionen */}
                    <div className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-lg ${totalPending > 0 ? "bg-amber-500/10" : "bg-green-500/10"}`}>
                                {totalPending > 0
                                    ? <AlertCircle size={20} className="text-amber-400" />
                                    : <CheckCircle2 size={20} className="text-green-400" />
                                }
                            </div>
                            <span className="text-sm text-neutral-400">Ausstehend</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{totalPending}</p>
                        <div className="text-xs text-neutral-500 mt-1 space-y-0.5">
                            {data.pendingActions.submissions > 0 && (
                                <p>{data.pendingActions.submissions} Stundennachweise</p>
                            )}
                        </div>
                    </div>

                    {/* Monats-Fortschritt */}
                    <div className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <CalendarCheck size={20} className="text-blue-400" />
                            </div>
                            <span className="text-sm text-neutral-400">Bestaetigt</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{data.monthStats.completionRate}%</p>
                        <p className="text-xs text-neutral-500 mt-1">
                            {data.monthStats.completedShifts} / {data.monthStats.totalShifts} Schichten
                        </p>
                    </div>

                    {/* Abwesenheiten */}
                    <div className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-red-500/10">
                                <HeartPulse size={20} className="text-red-400" />
                            </div>
                            <span className="text-sm text-neutral-400">Abwesenheiten</span>
                        </div>
                        <div className="flex gap-4">
                            <div>
                                <p className="text-2xl font-bold text-white">{data.monthStats.sickDays}</p>
                                <p className="text-xs text-neutral-500">Krank</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-white">{data.monthStats.vacationDays}</p>
                                <p className="text-xs text-neutral-500">Urlaub</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Reihe 2: Heute im Dienst + Neueste Aktivitaeten */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Heute im Dienst - Detail */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Clock size={18} className="text-violet-400" />
                                Heute im Dienst
                            </h2>
                            <Link href="/admin/schedule" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                                Zum Kalender <ChevronRight size={14} />
                            </Link>
                        </div>
                        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                            <ShiftList shifts={data.todayShifts} emptyMessage="Heute keine Schichten geplant" />
                        </div>
                    </div>

                    {/* Neueste Aktivitaeten */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Activity size={18} className="text-violet-400" />
                                Neueste Aktivitaeten
                            </h2>
                        </div>
                        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                            {data.recentActivities.length === 0 ? (
                                <p className="text-neutral-500 text-sm py-4 text-center">Keine Aktivitaeten</p>
                            ) : (
                                data.recentActivities.map(act => (
                                    <div key={act.id} className="flex items-start gap-3 py-2">
                                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                            act.type === "SUCCESS" ? "bg-green-400" :
                                            act.type === "ERROR" ? "bg-red-400" :
                                            act.type === "WARNING" ? "bg-amber-400" : "bg-blue-400"
                                        }`} />
                                        <div className="min-w-0">
                                            <p className="text-sm text-neutral-200 truncate">{act.action}</p>
                                            <p className="text-xs text-neutral-500">
                                                {act.userName && `${act.userName} - `}
                                                {new Date(act.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Reihe 3: Morgen im Dienst + Abwesenheiten-Detail */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Morgen im Dienst */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Sunrise size={18} className="text-amber-400" />
                                Morgen im Dienst
                                <span className="text-sm font-normal text-neutral-500">{tomorrowLabel}</span>
                            </h2>
                            <Link href="/admin/schedule" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                                Zum Kalender <ChevronRight size={14} />
                            </Link>
                        </div>
                        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                            <ShiftList shifts={data.tomorrowShifts} emptyMessage="Morgen keine Schichten geplant" />
                        </div>
                    </div>

                    {/* Abwesenheiten-Detail */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        <div className="p-4 border-b border-neutral-800">
                            <h2 className="text-lg font-semibold text-white mb-3">Abwesenheiten</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAbsenceTab("sick")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                        absenceTab === "sick"
                                            ? "bg-red-500/20 text-red-400"
                                            : "bg-neutral-800 text-neutral-400 hover:text-neutral-300"
                                    }`}
                                >
                                    <HeartPulse size={14} />
                                    Krank ({data.sickByEmployee.length})
                                </button>
                                <button
                                    onClick={() => setAbsenceTab("vacation")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                        absenceTab === "vacation"
                                            ? "bg-cyan-500/20 text-cyan-400"
                                            : "bg-neutral-800 text-neutral-400 hover:text-neutral-300"
                                    }`}
                                >
                                    <Palmtree size={14} />
                                    Urlaub ({data.upcomingVacations.length})
                                </button>
                            </div>
                        </div>
                        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                            {absenceTab === "sick" ? (
                                data.sickByEmployee.length === 0 ? (
                                    <p className="text-neutral-500 text-sm py-4 text-center">Keine Krankmeldungen diesen Monat</p>
                                ) : (
                                    data.sickByEmployee.map((entry, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-800/50">
                                            <span className="text-sm text-white font-medium">{entry.employeeName}</span>
                                            <span className="text-sm text-red-400 font-medium">
                                                {entry.days} {entry.days === 1 ? "Tag" : "Tage"}
                                            </span>
                                        </div>
                                    ))
                                )
                            ) : (
                                data.upcomingVacations.length === 0 ? (
                                    <p className="text-neutral-500 text-sm py-4 text-center">Kein Urlaub in den naechsten 14 Tagen</p>
                                ) : (
                                    data.upcomingVacations.map((v, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-800/50">
                                            <span className="text-sm text-white font-medium">{v.employeeName}</span>
                                            <span className="text-sm text-cyan-400">
                                                {new Date(v.startDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} - {new Date(v.endDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                                            </span>
                                        </div>
                                    ))
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* Reihe 4: Wochenvorschau */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Wochenplan-Vorschau */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <CalendarDays size={18} className="text-blue-400" />
                                Wochenvorschau
                            </h2>
                            <Link href="/admin/schedule" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                                Zum Kalender <ChevronRight size={14} />
                            </Link>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-7 gap-2">
                                {data.weekPreview.map((day, i) => {
                                    const d = new Date(day.date)
                                    const isToday = i === 0
                                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                                    return (
                                        <div
                                            key={day.date}
                                            className={`flex flex-col items-center p-2 rounded-lg ${
                                                isToday ? "bg-violet-500/20 border border-violet-500/30" :
                                                isWeekend ? "bg-neutral-800/30" : "bg-neutral-800/50"
                                            }`}
                                        >
                                            <span className={`text-xs font-medium ${isToday ? "text-violet-400" : "text-neutral-500"}`}>
                                                {DAY_NAMES_SHORT[d.getDay()]}
                                            </span>
                                            <span className={`text-xs ${isToday ? "text-violet-300" : "text-neutral-500"}`}>
                                                {d.getDate()}.
                                            </span>
                                            <span className={`text-lg font-bold mt-1 ${
                                                day.shiftCount === 0 ? "text-neutral-600" :
                                                isToday ? "text-violet-400" : "text-white"
                                            }`}>
                                                {day.shiftCount}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mitarbeiter ohne Schichten - Warnung */}
                {data.employeesWithoutShifts.length > 0 && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <UserX size={20} className="text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-400">
                                    {data.employeesWithoutShifts.length} {data.employeesWithoutShifts.length === 1 ? "Mitarbeiter" : "Mitarbeiter"} ohne Schichten diesen Monat
                                </p>
                                <p className="text-xs text-neutral-500 mt-1">
                                    {data.employeesWithoutShifts.map(e => e.name || "Unbekannt").join(", ")}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
