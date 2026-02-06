"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { redirect } from "next/navigation"
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns"
import { de } from "date-fns/locale"
import TimesheetDay from "@/components/TimesheetDay"
import MonthlySummary from "@/components/MonthlySummary"
import { ChevronDown, ChevronRight, Shield } from "lucide-react"
import { formatTimeRange } from "@/lib/time-utils"

interface DashboardClient {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    state: string | null
    isActive: boolean
}

interface DashboardTeam {
    id: string
    name: string
    assistantRecipientEmail: string | null
    assistantRecipientName: string | null
    clientId: string | null
    client: DashboardClient | null
}

interface DashboardTimesheet {
    id: string
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    breakMinutes: number
    note: string | null
    absenceType: string | null
    status: string
    employeeId: string
    teamId: string | null
    month: number
    year: number
    lastUpdatedAt: string
    lastUpdatedBy: string | null
    source: string | null
    sheetFileName: string | null
    backupEmployeeId: string | null
    team: DashboardTeam | null
    employee: { name: string | null }
}

interface BackupShift {
    id: string
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    employeeName: string
}

export default function DashboardPage() {
    const { data: session, status } = useSession()

    // Auto-redirect Admin
    if (status === "authenticated" && (session?.user as any)?.role === "ADMIN") {
        redirect("/admin")
    }
    const [timesheets, setTimesheets] = useState<DashboardTimesheet[]>([])
    const [potentialBackupShifts, setPotentialBackupShifts] = useState<BackupShift[]>([])
    const [isBackupCollapsed, setIsBackupCollapsed] = useState(true)
    const [loading, setLoading] = useState(true)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [availableMonths, setAvailableMonths] = useState<{month: number, year: number}[]>([])

    const fetchAvailableMonths = async () => {
        try {
            const res = await fetch(`/api/timesheets?getAvailableMonths=true`)
            if (res.ok) {
                const data = await res.json()
                setAvailableMonths(data)

                // If current month is not available, switch to the closest available month
                const currentMonth = currentDate.getMonth() + 1
                const currentYear = currentDate.getFullYear()
                const hasCurrentMonth = data.some((m: any) => m.month === currentMonth && m.year === currentYear)

                if (!hasCurrentMonth && data.length > 0) {
                    // Find the month closest to today (not just first in array)
                    const today = new Date()
                    const todayValue = today.getFullYear() * 12 + (today.getMonth() + 1)

                    const closest = data.reduce((closest: any, m: any) => {
                        const mValue = m.year * 12 + m.month
                        const closestValue = closest.year * 12 + closest.month

                        const mDiff = Math.abs(mValue - todayValue)
                        const closestDiff = Math.abs(closestValue - todayValue)

                        return mDiff < closestDiff ? m : closest
                    })

                    setCurrentDate(new Date(closest.year, closest.month - 1, 1))
                }
            }
        } catch (err) {
            console.error("Failed to fetch available months", err)
        }
    }

    const updateSingleTimesheet = (updatedTimesheet: any) => {
        setTimesheets(prevTimesheets => {
            const updated = prevTimesheets.map(ts =>
                ts.id === updatedTimesheet.id ? updatedTimesheet : ts
            )

            // Fallback: Falls ID nicht gefunden, full refresh
            if (!updated.some(ts => ts.id === updatedTimesheet.id)) {
                console.warn("Timesheet ID not found, triggering full refresh")
                fetchTimesheets()
                return prevTimesheets
            }

            return updated
        })
    }

    const deleteSingleTimesheet = (id: string) => {
        setTimesheets(prevTimesheets => prevTimesheets.filter(ts => ts.id !== id))
    }

    const fetchTimesheets = async () => {
        setLoading(true)
        const month = currentDate.getMonth() + 1
        const year = currentDate.getFullYear()

        // Save scroll position before fetching
        const scrollY = window.scrollY

        try {
            const res = await fetch(`/api/timesheets?month=${month}&year=${year}`)
            if (res.ok) {
                const data = await res.json()
                // Neues API-Format: { timesheets, potentialBackupShifts }
                setTimesheets(data.timesheets || data)
                setPotentialBackupShifts(data.potentialBackupShifts || [])
                // Restore scroll position after state update
                requestAnimationFrame(() => window.scrollTo(0, scrollY))
            }
        } catch (err) {
            console.error("Failed to fetch timesheets", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (session) {
            fetchAvailableMonths()
        }
    }, [session])

    useEffect(() => {
        if (session) fetchTimesheets()
    }, [session, currentDate])

    if (!session) return null

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <header className="sticky top-0 z-10 border-b bg-white p-4 shadow-sm">
                <div className="mx-auto flex max-w-2xl items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-black">Hallo, {session.user?.name}</h1>
                        {availableMonths.length > 0 ? (
                            <div className="relative inline-block">
                                <select
                                    value={`${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`}
                                    onChange={(e) => {
                                        const [year, month] = e.target.value.split('-').map(Number)
                                        setCurrentDate(new Date(year, month - 1, 1))
                                    }}
                                    className="appearance-none bg-transparent text-sm font-bold pr-6 cursor-pointer focus:outline-none"
                                    style={{ color: '#000000' }}
                                >
                                    {availableMonths.map((m) => (
                                        <option
                                            key={`${m.year}-${m.month}`}
                                            value={`${m.year}-${m.month}`}
                                            style={{ color: '#000000', fontWeight: 'bold' }}
                                        >
                                            {format(new Date(m.year, m.month - 1, 1), "MMMM yyyy", { locale: de })}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-black" />
                            </div>
                        ) : (
                            <p className="text-sm text-gray-900 font-bold">
                                {format(currentDate, "MMMM yyyy", { locale: de })}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="text-sm font-medium text-black hover:text-red-600"
                        >
                            Abmelden
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-2xl p-4">
                {(session.user as any)?.role === "ADMIN" ? (
                    <div className="mt-12 text-center">
                        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <span className="text-3xl font-bold">A</span>
                        </div>
                        <h2 className="text-2xl font-black text-gray-900">Admin Bereich</h2>
                        <p className="mt-2 text-black">Du bist als Administrator angemeldet. Verwalte Dienstpläne und Synchronisierungen im Admin Panel.</p>
                        <a
                            href="/admin"
                            className="mt-8 inline-block rounded-xl bg-blue-600 px-8 py-4 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                        >
                            Zum Admin Panel
                        </a>
                    </div>
                ) : (session.user as any)?.role === "TEAMLEAD" ? (
                    <div className="mt-12 text-center">
                        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                            <span className="text-3xl font-bold">T</span>
                        </div>
                        <h2 className="text-2xl font-black text-gray-900">Teamlead Bereich</h2>
                        <p className="mt-2 text-black">Du bist als Teamlead angemeldet. Überwache dein Team im Teamlead Panel.</p>
                        <a
                            href="/teamlead"
                            className="mt-8 inline-block rounded-xl bg-indigo-600 px-8 py-4 font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
                        >
                            Zum Teamlead Panel
                        </a>
                    </div>
                ) : (
                    <>
                        {/* Statistics Card */}
                        <MonthlySummary
                            timesheets={timesheets}
                            onRefresh={fetchTimesheets}
                            month={currentDate.getMonth() + 1}
                            year={currentDate.getFullYear()}
                        />

                        {/* Quick Actions */}
                        <div className="mt-6 grid grid-cols-1 gap-4">
                            <a
                                href="/dashboard/vacation"
                                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all"
                            >
                                <div>
                                    <h3 className="font-bold text-black">Urlaubsantrag</h3>
                                    <p className="text-sm text-gray-600">Urlaubstage beantragen und verwalten</p>
                                </div>
                                <ChevronRight size={20} className="text-gray-400" />
                            </a>
                        </div>

                        {/* Backup-Schichten Sektion (eingeklappt) */}
                        {potentialBackupShifts.length > 0 && (
                            <div className="mt-6 rounded-xl bg-gray-100 overflow-hidden border border-gray-200">
                                <button
                                    onClick={() => setIsBackupCollapsed(!isBackupCollapsed)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-gray-200 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Shield size={18} className="text-gray-500" />
                                        <span className="font-bold text-gray-700">
                                            Backup-Schichten ({potentialBackupShifts.length})
                                        </span>
                                    </div>
                                    {isBackupCollapsed ? (
                                        <ChevronRight size={20} className="text-gray-500" />
                                    ) : (
                                        <ChevronDown size={20} className="text-gray-500" />
                                    )}
                                </button>

                                {!isBackupCollapsed && (
                                    <div className="px-4 pb-4 space-y-2">
                                        <p className="text-xs text-gray-500 mb-3">
                                            Diese Schichten übernimmst du, falls der Hauptmitarbeiter ausfällt.
                                        </p>
                                        {potentialBackupShifts.map(shift => (
                                            <div key={shift.id} className="flex justify-between items-center text-sm bg-white rounded-lg p-3 shadow-sm">
                                                <span className="text-gray-600">
                                                    Backup für <span className="font-medium text-gray-800">{shift.employeeName}</span>
                                                </span>
                                                <span className="font-medium text-gray-800">
                                                    {format(new Date(shift.date), "EE dd.MM.", { locale: de })} {formatTimeRange(shift.plannedStart, shift.plannedEnd)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Days List */}
                        <div className="mt-6 space-y-4">
                            <h2 className="text-lg font-bold text-black">Tageskarten</h2>
                            {loading ? (
                                <div className="py-10 text-center text-black font-medium">Lade Daten...</div>
                            ) : (
                                timesheets.map((ts) => (
                                    <TimesheetDay
                                        key={ts.id}
                                        timesheet={ts}
                                        onUpdate={updateSingleTimesheet}
                                        onDelete={deleteSingleTimesheet}
                                    />
                                ))
                            )}

                            {!loading && timesheets.length === 0 && (
                                <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-black font-medium">
                                    Keine geplanten Dienste für diesen Monat.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}
