"use client"

import {
    Users,
    Clock,
    AlertCircle,
    CheckCircle2,
    Activity,
    Palmtree,
    HeartPulse,
    CalendarCheck,
    ChevronRight
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
    clientCoverage: {
        id: string
        name: string
        employeeCount: number
    }[]
}

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

export default function AdminDashboardPage() {
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

    if (isLoading) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-neutral-400">Dashboard wird geladen...</div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6">
                <p className="text-red-400">Fehler beim Laden des Dashboards</p>
            </div>
        )
    }

    const totalPending = data.pendingActions.submissions +
        data.pendingActions.unsignedEmployees

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
                            {data.todayShifts.length === 0 ? (
                                <p className="text-neutral-500 text-sm py-4 text-center">Heute keine Schichten geplant</p>
                            ) : (
                                data.todayShifts.map(shift => (
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
                                ))
                            )}
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

                {/* Quick Actions & Klienten-Abdeckung */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Quick Actions */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
                        <h2 className="text-lg font-semibold text-white mb-4">Schnellzugriff</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <Link href="/admin/schedule" className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors">
                                <CalendarCheck size={18} className="text-violet-400" />
                                <span className="text-sm text-neutral-200">Schicht erstellen</span>
                            </Link>
                            <Link href="/admin/employee-timesheets" className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors">
                                <CheckCircle2 size={18} className="text-green-400" />
                                <span className="text-sm text-neutral-200">Nachweise pruefen</span>
                            </Link>
                            <Link href="/admin/vacations" className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors">
                                <Palmtree size={18} className="text-cyan-400" />
                                <span className="text-sm text-neutral-200">Urlaub / Krank</span>
                            </Link>
                        </div>
                    </div>

                    {/* Klienten-Abdeckung */}
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        <div className="p-4 border-b border-neutral-800">
                            <h2 className="text-lg font-semibold text-white">Klienten-Abdeckung</h2>
                        </div>
                        <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                            {data.clientCoverage.map(client => (
                                <div key={client.id} className="flex items-center justify-between py-1.5">
                                    <span className="text-sm text-neutral-300">{client.name}</span>
                                    <span className={`text-sm font-medium ${
                                        client.employeeCount === 0 ? "text-red-400" :
                                        client.employeeCount < 2 ? "text-amber-400" : "text-green-400"
                                    }`}>
                                        {client.employeeCount} MA
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
