"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns"
import { de } from "date-fns/locale"
import TimesheetDay from "@/components/TimesheetDay"
import TimesheetCalendar from "@/components/TimesheetCalendar"
import MonthlySummary from "@/components/MonthlySummary"
import { ChevronDown, ChevronRight, Shield, CalendarDays, Clock, CheckCircle2, RefreshCw, List } from "lucide-react"
import { formatTimeRange } from "@/lib/time-utils"
import ConnectionStatus from "@/components/ConnectionStatus"
import { SkeletonCard } from "@/components/Skeleton"

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
    clientName: string
}

export default function DashboardPage() {
    const { data: session, status } = useSession()

    const router = useRouter()

    // Auto-redirect Admin
    useEffect(() => {
        if (status === "authenticated" && (session?.user as any)?.role === "ADMIN") {
            router.push("/admin")
        }
    }, [status, session, router])

    const [timesheets, setTimesheets] = useState<DashboardTimesheet[]>([])
    const [potentialBackupShifts, setPotentialBackupShifts] = useState<BackupShift[]>([])
    const [isBackupCollapsed, setIsBackupCollapsed] = useState(true)
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [availableMonths, setAvailableMonths] = useState<{month: number, year: number}[]>([])
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
    const [manualToggles, setManualToggles] = useState<Set<string>>(new Set())
    const [viewMode, setViewMode] = useState<"list" | "calendar">("list")

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
                setFetchError(null)
                // Restore scroll position after state update
                requestAnimationFrame(() => window.scrollTo(0, scrollY))
            } else if (res.status === 401) {
                window.location.href = "/login"
            } else {
                setFetchError("Fehler beim Laden der Daten")
            }
        } catch (err) {
            console.error("Failed to fetch timesheets", err)
            setFetchError("Netzwerkfehler - bitte Verbindung prüfen")
        } finally {
            setLoading(false)
        }
    }

    // Auto-expand logic: Only expand today's shift (if it exists and has no absence)
    useEffect(() => {
        if (timesheets.length === 0) return

        const today = new Date().toISOString().slice(0, 10)

        // Find today's shift (any status, no absence)
        const todayShift = timesheets.find(ts =>
            ts.date.slice(0, 10) === today && !ts.absenceType
        )

        setExpandedCards(prev => {
            const next = new Set<string>()
            for (const ts of timesheets) {
                if (manualToggles.has(ts.id)) {
                    // Keep whatever the user set
                    if (prev.has(ts.id)) next.add(ts.id)
                } else if (todayShift && ts.id === todayShift.id) {
                    next.add(ts.id)
                }
            }
            return next
        })
    }, [timesheets])

    const toggleCard = useCallback((id: string) => {
        setManualToggles(prev => new Set(prev).add(id))
        setExpandedCards(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    // After a confirm action: collapse that card, expand next planned
    const handleTimesheetUpdate = useCallback((updatedTimesheet: any) => {
        updateSingleTimesheet(updatedTimesheet)

        // If it just became CONFIRMED, auto-collapse it and open next PLANNED
        if (updatedTimesheet.status === "CONFIRMED" || updatedTimesheet.status === "CHANGED") {
            // Use setTimesheets callback to read fresh state (avoids stale closure)
            setTimesheets(currentTimesheets => {
                setExpandedCards(prev => {
                    const next = new Set(prev)
                    next.delete(updatedTimesheet.id)

                    // Find the next PLANNED shift after this one
                    const idx = currentTimesheets.findIndex(ts => ts.id === updatedTimesheet.id)
                    for (let i = idx + 1; i < currentTimesheets.length; i++) {
                        if (currentTimesheets[i].status === "PLANNED" && !currentTimesheets[i].absenceType) {
                            next.add(currentTimesheets[i].id)
                            // Scroll to it after a brief delay
                            setTimeout(() => {
                                document.getElementById(`ts-${currentTimesheets[i].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
                            }, 350)
                            break
                        }
                    }

                    return next
                })
                // Mark as manually toggled so auto-expand doesn't override
                setManualToggles(prev => {
                    const next = new Set(prev)
                    next.add(updatedTimesheet.id)
                    return next
                })
                return currentTimesheets // Don't modify timesheets, just reading
            })
        }
    }, [])

    // Calendar day click: switch to list, expand card, scroll to it
    const handleCalendarDayClick = useCallback((ts: any) => {
        setViewMode("list")
        setExpandedCards(prev => new Set(prev).add(ts.id))
        setManualToggles(prev => new Set(prev).add(ts.id))
        // Scroll after view switch renders
        setTimeout(() => {
            document.getElementById(`ts-${ts.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 100)
    }, [])

    useEffect(() => {
        if (session) {
            fetchAvailableMonths()
        }
    }, [session])

    useEffect(() => {
        if (session) {
            // Reset manual toggles on month change
            setManualToggles(new Set())
            fetchTimesheets()
        }
    }, [session, currentDate])

    if (!session) return null

    return (
        <div className="pb-20">
            <ConnectionStatus />
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
                        {/* Quick Stats */}
                        {!loading && timesheets.length > 0 && (() => {
                            const shiftCount = timesheets.filter(ts => !ts.absenceType).length
                            const totalHours = timesheets.reduce((sum, ts) => {
                                const start = ts.actualStart || ts.plannedStart
                                const end = ts.actualEnd || ts.plannedEnd
                                if (!start || !end || ts.absenceType) return sum
                                const [sh, sm] = start.split(":").map(Number)
                                const [eh, em] = end.split(":").map(Number)
                                let diff = (eh * 60 + em) - (sh * 60 + sm)
                                if (diff < 0) diff += 24 * 60
                                diff -= (ts.breakMinutes || 0)
                                return sum + Math.max(0, diff) / 60
                            }, 0)
                            const allSubmitted = timesheets.every(ts => ts.status === "SUBMITTED" || ts.status === "COMPLETED")

                            return (
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <div className="rounded-xl bg-white p-3 shadow-sm text-center">
                                        <CalendarDays size={18} className="mx-auto text-blue-500 mb-1" />
                                        <p className="text-lg font-bold text-gray-900">{shiftCount}</p>
                                        <p className="text-[10px] text-gray-500 font-medium">Schichten</p>
                                    </div>
                                    <div className="rounded-xl bg-white p-3 shadow-sm text-center">
                                        <Clock size={18} className="mx-auto text-blue-500 mb-1" />
                                        <p className="text-lg font-bold text-gray-900">{totalHours.toFixed(1)}</p>
                                        <p className="text-[10px] text-gray-500 font-medium">Stunden</p>
                                    </div>
                                    <div className="rounded-xl bg-white p-3 shadow-sm text-center">
                                        <CheckCircle2 size={18} className={`mx-auto mb-1 ${allSubmitted ? "text-green-500" : "text-gray-400"}`} />
                                        <p className={`text-lg font-bold ${allSubmitted ? "text-green-600" : "text-gray-900"}`}>
                                            {allSubmitted ? "Ja" : "Nein"}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-medium">Eingereicht</p>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Monthly Summary + Export */}
                        <MonthlySummary
                            timesheets={timesheets}
                            onRefresh={fetchTimesheets}
                            month={currentDate.getMonth() + 1}
                            year={currentDate.getFullYear()}
                        />

                        {/* Excel Export entfernt - PDF Download ist in MonthlySummary nach Unterschrift */}

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
                                                    Backup bei <span className="font-medium text-gray-800">{shift.clientName}</span>
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

                        {/* View Toggle + Days List / Calendar */}
                        <div className="mt-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold text-black">
                                    {viewMode === "list" ? "Tageskarten" : "Kalender"}
                                </h2>
                                <div className="flex rounded-lg bg-gray-100 p-0.5">
                                    <button
                                        onClick={() => setViewMode("list")}
                                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                                            viewMode === "list"
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-gray-600 hover:text-gray-900"
                                        }`}
                                    >
                                        <List size={14} />
                                        Liste
                                    </button>
                                    <button
                                        onClick={() => setViewMode("calendar")}
                                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                                            viewMode === "calendar"
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-gray-600 hover:text-gray-900"
                                        }`}
                                    >
                                        <CalendarDays size={14} />
                                        Kalender
                                    </button>
                                </div>
                            </div>

                            {fetchError ? (
                                <div className="rounded-xl border-2 border-red-200 bg-red-50 py-6 text-center">
                                    <p className="text-red-700 font-medium">{fetchError}</p>
                                    <button
                                        onClick={fetchTimesheets}
                                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-200 transition-colors"
                                    >
                                        <RefreshCw size={16} />
                                        Erneut laden
                                    </button>
                                </div>
                            ) : loading ? (
                                <div className="space-y-4">
                                    <SkeletonCard />
                                    <SkeletonCard />
                                    <SkeletonCard />
                                </div>
                            ) : viewMode === "calendar" ? (
                                <TimesheetCalendar
                                    timesheets={timesheets}
                                    backupShifts={potentialBackupShifts}
                                    currentDate={currentDate}
                                    onDayClick={handleCalendarDayClick}
                                />
                            ) : (
                                timesheets.map((ts) => (
                                    <div key={ts.id} id={`ts-${ts.id}`}>
                                        <TimesheetDay
                                            timesheet={ts}
                                            onUpdate={handleTimesheetUpdate}
                                            onDelete={deleteSingleTimesheet}
                                            isExpanded={expandedCards.has(ts.id)}
                                            onToggleExpand={() => toggleCard(ts.id)}
                                        />
                                    </div>
                                ))
                            )}

                            {!loading && timesheets.length === 0 && !fetchError && (
                                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 px-6 text-center">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                                        <CalendarDays size={28} className="text-blue-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                                        Keine Schichten in diesem Monat
                                    </h3>
                                    <p className="text-sm text-gray-500 max-w-xs mx-auto">
                                        Du hast noch keine geplanten Dienste für diesen Monat. Dein Admin wird deinen Dienstplan bald erstellen.
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}
