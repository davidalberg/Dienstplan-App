"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay } from "date-fns"
import { de } from "date-fns/locale"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
    Calendar,
    List,
    Plus,
    Edit2,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    X,
    Save,
    ExternalLink,
    Eye,
    RotateCcw,
    AlertTriangle,
    Info,
    Copy
} from "lucide-react"
import { showToast } from "@/lib/toast-utils"
import { formatTimeRange } from "@/lib/time-utils"
import { useAdminSchedule } from "@/hooks/use-admin-data"
import { useAdminData } from "@/components/AdminDataProvider"
import TimesheetDetail from "@/components/TimesheetDetail"

import ShiftTemplateManager from "@/components/ShiftTemplateManager"
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { toast } from "sonner"
import { useSWRConfig } from "swr"

// Loading fallback component
function ScheduleLoadingFallback() {
    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                <p className="text-neutral-400 font-medium">Dienstplan wird geladen...</p>
            </div>
        </div>
    )
}

// Main export wrapped in Suspense
export default function SchedulePage() {
    return (
        <Suspense fallback={<ScheduleLoadingFallback />}>
            <SchedulePageContent />
        </Suspense>
    )
}

interface Shift {
    id: string
    date: string
    plannedStart: string
    plannedEnd: string
    actualStart: string | null
    actualEnd: string | null
    status: string
    note: string | null
    absenceType: string | null
    employee: {
        id: string
        name: string
        team?: {
            id: string
            name: string
            client?: {
                id: string
                firstName: string
                lastName: string
            } | null
        } | null
    }
    backupEmployee: { id: string; name: string } | null
}

interface Employee {
    id: string
    name: string
    email: string
    teamId: string | null
}

interface Team {
    id: string
    name: string
}

interface Client {
    id: string
    firstName: string
    lastName: string
    isActive: boolean
    employees: { id: string; name: string }[]
}

function SchedulePageContent() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const searchParams = useSearchParams()
    const pathname = usePathname()
    const { mutate: globalMutate } = useSWRConfig()
    const [viewMode, setViewMode] = useState<"list" | "calendar">("list")

    // Filter - Initialize from URL params, then localStorage, then current date
    const [currentDate, setCurrentDate] = useState(() => {
        // 1. URL-Parameter haben höchste Priorität
        const monthParam = searchParams.get('month')
        const yearParam = searchParams.get('year')
        if (monthParam && yearParam) {
            const m = parseInt(monthParam, 10)
            const y = parseInt(yearParam, 10)
            if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
                return new Date(y, m - 1, 1)
            }
        }

        // 2. localStorage als Fallback (für Navigation ohne Query-Strings)
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
                // Ignore parse errors
            }
        }

        // 3. Fallback: Aktueller Monat
        return new Date()
    })
    const [selectedTeam, setSelectedTeam] = useState<string>("")
    const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    // Sync URL AND localStorage when month changes
    useEffect(() => {
        // Update URL
        const params = new URLSearchParams(searchParams.toString())
        params.set('month', String(month))
        params.set('year', String(year))
        const newUrl = `${pathname}?${params.toString()}`
        // Use replace to avoid adding to browser history on every change
        router.replace(newUrl, { scroll: false })

        // Persist to localStorage for cross-page navigation
        try {
            localStorage.setItem('admin-selected-month', JSON.stringify({ month, year }))
        } catch {
            // Ignore storage errors (e.g., private browsing)
        }
    }, [month, year, pathname, router, searchParams])

    // ✅ PRELOAD OPTIMIZATION: Nutze zentral gecachte Master-Daten
    const {
        clients,
        employees: globalEmployees,
        teams: globalTeams,
        isLoading: globalDataLoading
    } = useAdminData()

    // SWR für Daten-Caching - lädt nur Shifts + Monat-spezifische Daten
    const {
        shifts: swrShifts,
        employees: swrEmployees,
        teams: swrTeams,
        isLoading,
        mutate
    } = useAdminSchedule(month, year, selectedTeam || undefined)

    // Lokaler State für optimistische Updates
    const [shifts, setShifts] = useState<Shift[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [teams, setTeams] = useState<Team[]>([])
    const [loading, setLoading] = useState(true)

    // Bulk-Delete State
    const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set())
    const [isBulkDeleting, setIsBulkDeleting] = useState(false)

    // Undo Queue für gelöschte Schichten
    const [deletedShifts, setDeletedShifts] = useState<Array<{ id: string; shift: Shift; timeout: NodeJS.Timeout }>>([])

    // AbortController-Map für pending Delete-Requests (abort bei Unmount/Navigation)
    const deleteAbortControllers = useRef<Map<string, AbortController>>(new Map())

    // Sync SWR data to local state
    // ✅ OPTIMIZATION: Nutze globale Employees/Teams wenn Schedule-API keine liefert
    useEffect(() => {
        if (swrShifts !== undefined) setShifts(swrShifts)
        // Fallback zu globalen Daten wenn Schedule-API keine Employees/Teams liefert
        if (swrEmployees && swrEmployees.length > 0) {
            setEmployees(swrEmployees)
        } else if (globalEmployees.length > 0) {
            setEmployees(globalEmployees)
        }
        if (swrTeams && swrTeams.length > 0) {
            setTeams(swrTeams)
        } else if (globalTeams.length > 0) {
            setTeams(globalTeams)
        }
        // Loading ist false wenn SWR UND globale Daten fertig sind
        if (swrShifts !== undefined && !isLoading && !globalDataLoading) {
            setLoading(false)
        }
    }, [swrShifts, swrEmployees, swrTeams, globalEmployees, globalTeams, isLoading, globalDataLoading])

    // Teams bleiben standardmäßig zugeklappt - User entscheidet selbst
    const [hasInitialExpand, setHasInitialExpand] = useState(false)
    useEffect(() => {
        if (shifts.length > 0 && !hasInitialExpand) {
            setHasInitialExpand(true)
        }
    }, [shifts.length, hasInitialExpand])

    // ✅ INSTANT UI: Prefetch ALLE Stundennachweise in EINEM Request
    // Skalierbar für 200+ Mitarbeiter - nur 1 API-Call statt 200
    // Nutzt sessionStorage um Prefetch über Seitenwechsel zu persistieren

    useEffect(() => {
        const cacheKey = `prefetch-${month}-${year}`
        const lastPrefetch = sessionStorage.getItem(cacheKey)
        const now = Date.now()

        // Skip wenn innerhalb der letzten 10 Minuten bereits prefetched
        if (lastPrefetch && (now - parseInt(lastPrefetch, 10)) < 10 * 60 * 1000) {
            return
        }

        const prefetchAll = async () => {
            try {
                const res = await fetch(`/api/admin/schedule/prefetch?month=${month}&year=${year}`)
                if (!res.ok) throw new Error("Prefetch failed")

                const data = await res.json()
                const details = data.details as Record<string, unknown>

                // Schreibe jedes Detail in den SWR-Cache unter dem Original-URL-Key
                Object.entries(details).forEach(([key, detailData]) => {
                    const [employeeId, clientId] = key.split("-")
                    const url = `/api/admin/submissions/detail?employeeId=${employeeId}&clientId=${clientId}&month=${month}&year=${year}`
                    globalMutate(url, detailData, { revalidate: false })
                })

                // Speichere Timestamp in sessionStorage
                sessionStorage.setItem(cacheKey, String(now))
            } catch {
                // Prefetch-Fehler sind nicht kritisch - Daten werden on-demand geladen
            }
        }

        prefetchAll()
    }, [month, year, globalMutate])

    // ✅ PERFORMANCE FIX: Memoize grouping logic (was recalculating on every render)
    const groupedShifts = useMemo(() => {
        const groups: Record<string, { client: Client | null; shifts: Shift[] }> = {}

        shifts.forEach(shift => {
            const client = shift.employee.team?.client
            const clientId = client?.id || "unassigned"

            if (!groups[clientId]) {
                groups[clientId] = {
                    client: client ? {
                        id: client.id,
                        firstName: client.firstName,
                        lastName: client.lastName,
                        isActive: true,
                        employees: []
                    } : null,
                    shifts: []
                }
            }

            groups[clientId].shifts.push(shift)
        })

        // Sortiere nach Klient-Name
        return Object.entries(groups).sort(([aId, a], [bId, b]) => {
            if (aId === "unassigned") return 1 // "Ohne Klient" am Ende
            if (bId === "unassigned") return -1
            const aName = `${a.client?.firstName} ${a.client?.lastName}`
            const bName = `${b.client?.firstName} ${b.client?.lastName}`
            return aName.localeCompare(bName)
        })
    }, [shifts])  // Only recalculate when shifts array changes

    // ✅ PERFORMANCE FIX: Memoize event handler to prevent re-renders
    const toggleClientExpansion = useCallback((clientId: string) => {
        setExpandedClients(prev => {
            const next = new Set(prev)
            if (next.has(clientId)) {
                next.delete(clientId)
            } else {
                next.add(clientId)
            }
            return next
        })
    }, [])

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [editingShift, setEditingShift] = useState<Shift | null>(null)
    const [showTemplateManager, setShowTemplateManager] = useState(false)
    const [selectedClientId, setSelectedClientId] = useState<string>("")
    const [formData, setFormData] = useState({
        employeeId: "",
        date: "",
        plannedStart: "08:00",
        plannedEnd: "16:00",
        backupEmployeeId: "",
        note: "",
        absenceType: "", // "" | "SICK" | "VACATION"
        // Für Wiederholung
        isRepeating: false,
        repeatEndDate: "",
        repeatDays: [1, 2, 3, 4, 5] as number[] // Mo-Fr default
    })

    // Multi-Datum State für Plus-Button
    const [additionalDates, setAdditionalDates] = useState<
        { date: string; plannedStart: string; plannedEnd: string }[]
    >([])

    // TimesheetDetail Modal State
    const [showTimesheetDetail, setShowTimesheetDetail] = useState(false)
    const [selectedTimesheetData, setSelectedTimesheetData] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)

    // Keyboard Shortcuts Help Modal State
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
    const [hasSeenShortcutsTip, setHasSeenShortcutsTip] = useState(false)

    // Smart Defaults State
    const [suggestedTimes, setSuggestedTimes] = useState<{
        start: string
        end: string
        confidence: number
    } | null>(null)
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)

    // Conflict Validation State
    interface Conflict {
        type: string
        message: string
        severity: "error" | "warning"
    }
    const [conflicts, setConflicts] = useState<Conflict[]>([])
    const [validating, setValidating] = useState(false)

    // Alte fetchData-Funktion durch mutate() ersetzen
    const fetchData = useCallback(() => mutate(), [mutate])

    // Feature 1: Load smart time defaults when employee selected
    const loadSmartDefaults = async (employeeId: string) => {
        if (!employeeId || editingShift) return // Nur bei Neuanlage

        setLoadingSuggestions(true)
        try {
            const res = await fetch(`/api/admin/employees/${employeeId}/recent-shifts`)
            if (res.ok) {
                const data = await res.json()
                if (data.confidence > 0.5) { // Nur wenn >50% Confidence
                    setSuggestedTimes({
                        start: data.suggestedStart,
                        end: data.suggestedEnd,
                        confidence: data.confidence
                    })
                    // Auto-apply suggestions
                    setFormData(prev => ({
                        ...prev,
                        plannedStart: data.suggestedStart,
                        plannedEnd: data.suggestedEnd
                    }))
                } else {
                    setSuggestedTimes(null)
                }
            }
        } catch (error) {
            console.error("Error loading smart defaults:", error)
        } finally {
            setLoadingSuggestions(false)
        }
    }

    // Feature 2: Validate shift for conflicts (debounced)
    const validateShift = useCallback(async () => {
        if (!formData.employeeId || !formData.date || !formData.plannedStart || !formData.plannedEnd) {
            setConflicts([])
            return
        }

        setValidating(true)
        try {
            const res = await fetch("/api/admin/schedule/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: formData.employeeId,
                    date: formData.date,
                    plannedStart: formData.plannedStart,
                    plannedEnd: formData.plannedEnd,
                    backupEmployeeId: formData.backupEmployeeId || undefined,
                    excludeShiftId: editingShift?.id || undefined
                })
            })

            if (res.ok) {
                const data = await res.json()
                setConflicts(data.conflicts || [])
            } else {
                setConflicts([])
            }
        } catch (error) {
            console.error("Error validating shift:", error)
            setConflicts([])
        } finally {
            setValidating(false)
        }
    }, [formData.employeeId, formData.date, formData.plannedStart, formData.plannedEnd, formData.backupEmployeeId, editingShift?.id])

    // Debounced validation effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (showModal && selectedClientId) {
                validateShift()
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [showModal, selectedClientId, validateShift])

    // Unified close function: resets ALL modal-related state
    const closeModal = useCallback(() => {
        setShowModal(false)
        setEditingShift(null)
        setSelectedClientId("")
        setSuggestedTimes(null)
        setConflicts([])
        setValidating(false)
        setLoadingSuggestions(false)
        setFormData({
            employeeId: "",
            date: "",
            plannedStart: "08:00",
            plannedEnd: "16:00",
            backupEmployeeId: "",
            note: "",
            absenceType: "",
            isRepeating: false,
            repeatEndDate: "",
            repeatDays: [1, 2, 3, 4, 5]
        })
        setAdditionalDates([])
    }, [])

    const handleCreateOrUpdate = useCallback(async () => {
        // Frontend-Validierung
        if (!formData.employeeId) {
            showToast("error", "Bitte waehlen Sie einen Mitarbeiter aus")
            return
        }
        if (!formData.date) {
            showToast("error", "Bitte waehlen Sie ein Datum aus")
            return
        }
        if (!formData.plannedStart || !formData.plannedEnd) {
            showToast("error", "Start- und Endzeit sind erforderlich")
            return
        }

        // Wiederholung: Enddatum pruefen
        if (formData.isRepeating) {
            if (!formData.repeatEndDate) {
                showToast("error", "Bitte waehlen Sie ein Enddatum fuer die Wiederholung")
                return
            }
            if (formData.repeatDays.length === 0) {
                showToast("error", "Bitte waehlen Sie mindestens einen Wochentag aus")
                return
            }
        }

        // Multi-Datum: Alle Einträge validieren
        if (additionalDates.length > 0) {
            for (let i = 0; i < additionalDates.length; i++) {
                const entry = additionalDates[i]
                if (!entry.date) {
                    showToast("error", `Bitte Datum für Termin ${i + 2} auswählen`)
                    return
                }
                if (!entry.plannedStart || !entry.plannedEnd) {
                    showToast("error", `Start- und Endzeit für Termin ${i + 2} sind erforderlich`)
                    return
                }
            }
        }

        try {
            if (editingShift) {
                // ✅ OPTIMISTIC UPDATE: Sofort UI aktualisieren und Modal schließen
                const originalShift = shifts.find(s => s.id === editingShift.id)
                const optimisticBackup = formData.backupEmployeeId
                    ? { id: formData.backupEmployeeId, name: employees.find(e => e.id === formData.backupEmployeeId)?.name || "" }
                    : null

                // 1. Sofort UI aktualisieren
                setShifts(prev => prev.map(s => {
                    if (s.id === editingShift.id) {
                        return {
                            ...s,
                            plannedStart: formData.plannedStart,
                            plannedEnd: formData.plannedEnd,
                            note: formData.note || null,
                            absenceType: formData.absenceType || null,
                            backupEmployee: optimisticBackup
                        }
                    }
                    return s
                }))

                // 2. Modal sofort schließen und Formular zurücksetzen
                closeModal()
                showToast("success", "Schicht aktualisiert")

                // 3. API-Call im Hintergrund (kein await blockiert UI)
                fetch("/api/admin/schedule", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: editingShift.id,
                        plannedStart: formData.plannedStart,
                        plannedEnd: formData.plannedEnd,
                        backupEmployeeId: formData.backupEmployeeId || null,
                        note: formData.note || null,
                        absenceType: formData.absenceType || null
                    })
                }).then(async (res) => {
                    if (!res.ok) {
                        // Rollback bei Fehler
                        if (originalShift) {
                            setShifts(prev => prev.map(s =>
                                s.id === editingShift.id ? originalShift : s
                            ))
                        }
                        const data = await res.json().catch(() => ({}))
                        showToast("error", data.error || "Fehler beim Speichern")
                    } else {
                        // Background-Revalidierung für Konsistenz
                        mutate()
                    }
                }).catch(() => {
                    // Rollback bei Netzwerkfehler
                    if (originalShift) {
                        setShifts(prev => prev.map(s =>
                            s.id === editingShift.id ? originalShift : s
                        ))
                    }
                    showToast("error", "Netzwerkfehler")
                })

                return // Früher Return, da async im Hintergrund läuft
            }

            // ✅ CREATE: Optimistic UI - Modal sofort schließen, API im Hintergrund
            const selectedClient = clients.find(c => c.id === selectedClientId)
            const selectedEmployee = employees.find(e => e.id === formData.employeeId)
            const team = teams.find(t => t.id === selectedEmployee?.teamId)
            const backupEmp = formData.backupEmployeeId
                ? { id: formData.backupEmployeeId, name: employees.find(e => e.id === formData.backupEmployeeId)?.name || "" }
                : null

            const employeeData = {
                id: formData.employeeId,
                name: selectedEmployee?.name || "Mitarbeiter",
                team: team ? {
                    id: team.id,
                    name: team.name,
                    client: selectedClient ? {
                        id: selectedClient.id,
                        firstName: selectedClient.firstName,
                        lastName: selectedClient.lastName
                    } : null
                } : null
            }

            // Generate optimistic shifts with temp IDs
            const tempPrefix = `temp_${Date.now()}_`
            const optimisticShifts: Shift[] = []

            // Sammle alle Datum+Zeiten-Paare (Multi-Datum oder Single/Repeat)
            const isMultiDate = additionalDates.length > 0 && !formData.isRepeating
            const allDateEntries = isMultiDate
                ? [
                    { date: formData.date, plannedStart: formData.plannedStart, plannedEnd: formData.plannedEnd },
                    ...additionalDates
                  ]
                : null

            if (formData.isRepeating && formData.repeatEndDate) {
                // Bulk: generate dates from startDate to endDate filtered by repeatDays
                const allDays = eachDayOfInterval({
                    start: new Date(formData.date),
                    end: new Date(formData.repeatEndDate)
                })
                const targetDays = formData.repeatDays // 0=Sun, 1=Mon, ...
                const matchingDays = allDays.filter(d => targetDays.includes(getDay(d)))

                matchingDays.forEach((day, idx) => {
                    optimisticShifts.push({
                        id: `${tempPrefix}${idx}`,
                        date: format(day, "yyyy-MM-dd"),
                        plannedStart: formData.plannedStart,
                        plannedEnd: formData.plannedEnd,
                        actualStart: null,
                        actualEnd: null,
                        status: "PLANNED",
                        note: formData.note || null,
                        absenceType: formData.absenceType || null,
                        employee: employeeData,
                        backupEmployee: backupEmp
                    })
                })
            } else if (allDateEntries) {
                // Multi-Datum: Optimistic shifts für alle Einträge
                allDateEntries.forEach((entry, idx) => {
                    optimisticShifts.push({
                        id: `${tempPrefix}${idx}`,
                        date: entry.date,
                        plannedStart: entry.plannedStart,
                        plannedEnd: entry.plannedEnd,
                        actualStart: null,
                        actualEnd: null,
                        status: "PLANNED",
                        note: formData.note || null,
                        absenceType: formData.absenceType || null,
                        employee: employeeData,
                        backupEmployee: backupEmp
                    })
                })
            } else {
                // Single shift
                optimisticShifts.push({
                    id: `${tempPrefix}0`,
                    date: formData.date,
                    plannedStart: formData.plannedStart,
                    plannedEnd: formData.plannedEnd,
                    actualStart: null,
                    actualEnd: null,
                    status: "PLANNED",
                    note: formData.note || null,
                    absenceType: formData.absenceType || null,
                    employee: employeeData,
                    backupEmployee: backupEmp
                })
            }

            // 1. Sofort in State einfügen
            setShifts(prev => [...prev, ...optimisticShifts].sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            ))

            // 2. Modal sofort schließen und Formular zurücksetzen
            closeModal()
            const toastMsg = optimisticShifts.length > 1
                ? `${optimisticShifts.length} Schichten erstellt`
                : "Schicht erstellt"
            showToast("success", toastMsg)

            const tempIds = optimisticShifts.map(s => s.id)

            if (allDateEntries) {
                // Multi-Datum: Parallele einzelne POSTs via Promise.all
                const requests = allDateEntries.map((entry, idx) => {
                    const body: Record<string, unknown> = {
                        employeeId: formData.employeeId,
                        date: entry.date,
                        plannedStart: entry.plannedStart,
                        plannedEnd: entry.plannedEnd,
                        backupEmployeeId: formData.backupEmployeeId || null,
                        note: formData.note || null,
                        absenceType: formData.absenceType || null,
                    }
                    return fetch("/api/admin/schedule", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body)
                    }).then(async (res) => {
                        if (!res.ok) {
                            const data = await res.json().catch(() => ({}))
                            return { success: false, tempId: tempIds[idx], error: data.error }
                        }
                        const data = await res.json().catch(() => ({}))
                        return { success: true, tempId: tempIds[idx], data }
                    }).catch(() => {
                        return { success: false, tempId: tempIds[idx], error: "Netzwerkfehler" }
                    })
                })

                Promise.all(requests).then((results) => {
                    const failed = results.filter(r => !r.success)
                    const succeeded = results.filter(r => r.success)

                    // Rollback gescheiterte Shifts
                    if (failed.length > 0) {
                        const failedIds = failed.map(r => r.tempId)
                        setShifts(prev => prev.filter(s => !failedIds.includes(s.id)))
                        showToast("error", `${failed.length} von ${results.length} Schichten konnten nicht erstellt werden`)
                    }

                    // Ersetze temp IDs mit echten IDs für erfolgreiche Shifts
                    succeeded.forEach(r => {
                        const responseData = (r as { data?: { id?: string; date?: string; status?: string } }).data
                        if (responseData?.id) {
                            const realId = responseData.id
                            const realDate = responseData.date
                            const realStatus = responseData.status
                            setShifts(prev => prev.map(s =>
                                s.id === r.tempId ? { ...s, id: realId, date: realDate || s.date, status: realStatus || s.status } : s
                            ))
                        }
                    })

                    // Background-Revalidierung für Konsistenz
                    mutate()
                })
            } else {
                // 3. API-Call im Hintergrund (Single oder Repeat)
                const body: Record<string, unknown> = {
                    employeeId: formData.employeeId,
                    plannedStart: formData.plannedStart,
                    plannedEnd: formData.plannedEnd,
                    backupEmployeeId: formData.backupEmployeeId || null,
                    note: formData.note || null,
                    absenceType: formData.absenceType || null,
                }

                if (formData.isRepeating && formData.repeatEndDate) {
                    body.bulk = true
                    body.startDate = formData.date
                    body.endDate = formData.repeatEndDate
                    body.repeatDays = formData.repeatDays
                } else {
                    body.date = formData.date
                }

                fetch("/api/admin/schedule", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                }).then(async (res) => {
                    if (!res.ok) {
                        // Rollback: remove optimistic shifts
                        setShifts(prev => prev.filter(s => !tempIds.includes(s.id)))
                        const data = await res.json().catch(() => ({}))
                        showToast("error", data.error || "Fehler beim Erstellen")
                        return
                    }

                    const responseData = await res.json().catch(() => ({}))

                    // Replace temp IDs with real IDs from server
                    if (responseData.shifts && Array.isArray(responseData.shifts)) {
                        // Bulk response - replace all temp shifts with real data
                        setShifts(prev => {
                            const withoutTemp = prev.filter(s => !tempIds.includes(s.id))
                            const realShifts: Shift[] = responseData.shifts.map((s: Shift) => ({
                                id: s.id,
                                date: s.date,
                                plannedStart: s.plannedStart || formData.plannedStart,
                                plannedEnd: s.plannedEnd || formData.plannedEnd,
                                actualStart: s.actualStart || null,
                                actualEnd: s.actualEnd || null,
                                status: s.status || "PLANNED",
                                note: s.note || null,
                                absenceType: s.absenceType || null,
                                employee: s.employee || employeeData,
                                backupEmployee: s.backupEmployee || backupEmp
                            }))
                            return [...withoutTemp, ...realShifts].sort((a, b) =>
                                new Date(a.date).getTime() - new Date(b.date).getTime()
                            )
                        })
                    } else if (responseData.id) {
                        // Single response - replace temp shift with real data
                        setShifts(prev => prev.map(s =>
                            s.id === tempIds[0] ? {
                                ...s,
                                id: responseData.id,
                                date: responseData.date || s.date,
                                status: responseData.status || s.status,
                            } : s
                        ))
                    }

                    // Background-Revalidierung für Konsistenz
                    mutate()
                }).catch(() => {
                    // Rollback bei Netzwerkfehler
                    setShifts(prev => prev.filter(s => !tempIds.includes(s.id)))
                    showToast("error", "Netzwerkfehler - bitte prüfen Sie Ihre Verbindung")
                })
            }

            return // Früher Return, da async im Hintergrund läuft
        } catch (err) {
            console.error("[handleCreateOrUpdate] Error:", err)
            showToast("error", "Netzwerkfehler - bitte pruefen Sie Ihre Verbindung")
        } finally {
            setLoading(false)
        }
    }, [editingShift, formData, additionalDates, fetchData, mutate, clients, employees, teams, selectedClientId, shifts, closeModal])

    // Cleanup-Funktion für Undo-Queue
    useEffect(() => {
        return () => {
            // Cleanup timeouts bei Komponenten-Unmount
            deletedShifts.forEach(({ timeout }) => clearTimeout(timeout))

            // Alle pending Delete-Requests abbrechen bei Unmount
            deleteAbortControllers.current.forEach((controller) => controller.abort())
            deleteAbortControllers.current.clear()
        }
    }, [deletedShifts])

    // Undo-Handler
    const handleUndo = useCallback((id: string) => {
        const deletedItem = deletedShifts.find(item => item.id === id)
        if (!deletedItem) return

        // Clear timeout
        clearTimeout(deletedItem.timeout)

        // Pending Delete-Request abbrechen falls bereits gestartet
        const controller = deleteAbortControllers.current.get(id)
        if (controller) {
            controller.abort()
            deleteAbortControllers.current.delete(id)
        }

        // Remove from deleted queue
        setDeletedShifts(prev => prev.filter(item => item.id !== id))

        // Restore shift in UI
        setShifts(prev => [...prev, deletedItem.shift])

        showToast("success", "Schicht wiederhergestellt")
    }, [deletedShifts])

    // Helper: Invalidate all related caches after DELETE
    const invalidateRelatedCaches = useCallback(() => {
        // Schedule-Cache (local)
        mutate()

        // Abhängige Caches global invalidieren (Submissions, Timesheets)
        globalMutate(
            (key) => typeof key === 'string' && (
                key.startsWith('/api/admin/submissions') ||
                key.startsWith('/api/admin/timesheets')
            ),
            undefined,
            { revalidate: true }
        )
    }, [mutate, globalMutate])

    // Commit-Delete: Tatsächlich löschen nach Timeout
    const commitDelete = useCallback(async (id: string) => {
        // AbortController fuer diesen Delete-Request erstellen
        const controller = new AbortController()
        deleteAbortControllers.current.set(id, controller)

        try {
            const res = await fetch(`/api/admin/schedule?id=${id}`, {
                method: "DELETE",
                signal: controller.signal
            })

            // Controller nach erfolgreichem Fetch entfernen
            deleteAbortControllers.current.delete(id)

            if (res.ok) {
                // Remove from deleted queue
                setDeletedShifts(prev => prev.filter(item => item.id !== id))

                // Revalidate all related SWR caches
                invalidateRelatedCaches()
            } else {
                // Rollback bei Fehler - use functional update to avoid stale closure
                setDeletedShifts(prev => {
                    const deletedItem = prev.find(item => item.id === id)
                    if (deletedItem) {
                        setShifts(shifts => [...shifts, deletedItem.shift])
                    }
                    return prev.filter(item => item.id !== id)
                })
                showToast("error", "Fehler beim Löschen")
            }
        } catch (err) {
            // Controller entfernen
            deleteAbortControllers.current.delete(id)

            // Bei Abort (Unmount/Navigation) kein Rollback/Toast noetig
            if (err instanceof DOMException && err.name === "AbortError") {
                return
            }

            // Rollback bei echtem Fehler - use functional update to avoid stale closure
            setDeletedShifts(prev => {
                const deletedItem = prev.find(item => item.id === id)
                if (deletedItem) {
                    setShifts(shifts => [...shifts, deletedItem.shift])
                }
                return prev.filter(item => item.id !== id)
            })
            showToast("error", "Netzwerkfehler")
        }
    }, [invalidateRelatedCaches])

    // ✅ PERFORMANCE FIX: Memoize event handler with Undo functionality
    const handleDelete = useCallback((id: string) => {
        const shiftToDelete = shifts.find(s => s.id === id)
        if (!shiftToDelete) return

        // Bestätigungsdialog
        if (!window.confirm("Schicht wirklich löschen?")) {
            return
        }

        // Optimistic removal from UI
        setShifts(prev => prev.filter(s => s.id !== id))

        // Schedule commit-delete after 5 seconds
        const timeout = setTimeout(() => {
            commitDelete(id)
        }, 5000)

        // Add to deleted queue
        setDeletedShifts(prev => [...prev, { id, shift: shiftToDelete, timeout }])

        // Show undo toast using sonner's action feature
        toast.warning("Schicht gelöscht", {
            duration: 5000,
            icon: "⚠",
            action: {
                label: "Rückgängig",
                onClick: () => handleUndo(id)
            }
        })
    }, [shifts, commitDelete, handleUndo])

    const handleBulkDelete = async () => {
        if (selectedShiftIds.size === 0 || isBulkDeleting) return

        if (!window.confirm(`Wirklich ${selectedShiftIds.size} Schichten löschen?`)) {
            return
        }

        setIsBulkDeleting(true)
        try {
            const res = await fetch("/api/admin/schedule/bulk-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shiftIds: Array.from(selectedShiftIds) })
            })

            const data = await res.json()

            if (res.ok) {
                showToast("success", `${data.deleted} Schichten gelöscht`)
                setSelectedShiftIds(new Set())

                // Optimistisches Update
                setShifts(prev => prev.filter(s => !selectedShiftIds.has(s.id)))

                // Alle abhängigen Caches invalidieren
                invalidateRelatedCaches()
            } else {
                showToast("error", data.error || "Fehler beim Löschen")
            }
        } catch (error) {
            console.error("Bulk delete error:", error)
            showToast("error", "Fehler beim Löschen")
        } finally {
            setIsBulkDeleting(false)
        }
    }

    // ✅ PERFORMANCE FIX: Memoize event handler for checkbox performance
    const toggleShiftSelection = useCallback((shiftId: string) => {
        setSelectedShiftIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(shiftId)) {
                newSet.delete(shiftId)
            } else {
                newSet.add(shiftId)
            }
            return newSet
        })
    }, [])

    // ✅ PERFORMANCE FIX: Memoize event handler
    const toggleSelectAll = useCallback(() => {
        if (selectedShiftIds.size === shifts.length) {
            setSelectedShiftIds(new Set())
        } else {
            setSelectedShiftIds(new Set(shifts.map(s => s.id)))
        }
    }, [selectedShiftIds.size, shifts])

    // ✅ Toggle nur Schichten eines bestimmten Teams/Clients
    const toggleSelectTeam = useCallback((teamShifts: Shift[]) => {
        const teamShiftIds = teamShifts.map(s => s.id)
        const allTeamSelected = teamShiftIds.every(id => selectedShiftIds.has(id))

        setSelectedShiftIds(prev => {
            const newSet = new Set(prev)
            if (allTeamSelected) {
                // Alle Team-Schichten abwählen
                teamShiftIds.forEach(id => newSet.delete(id))
            } else {
                // Alle Team-Schichten auswählen
                teamShiftIds.forEach(id => newSet.add(id))
            }
            return newSet
        })
    }, [selectedShiftIds])

    const openCreateModal = (date?: Date) => {
        setEditingShift(null)
        setSelectedClientId("")
        setSuggestedTimes(null) // Reset suggestions
        setConflicts([]) // Reset conflicts
        setAdditionalDates([]) // Reset multi-date
        setFormData({
            employeeId: "",
            date: date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
            plannedStart: "08:00",
            plannedEnd: "16:00",
            backupEmployeeId: "",
            note: "",
            absenceType: "",
            isRepeating: false,
            repeatEndDate: "",
            repeatDays: [1, 2, 3, 4, 5]
        })
        setShowModal(true)
    }

    // Schicht erstellen mit vorausgewähltem Client (Skip Stufe 1)
    const openCreateModalForClient = (clientId: string) => {
        setEditingShift(null)
        setSelectedClientId(clientId)
        setSuggestedTimes(null)
        setConflicts([])
        setAdditionalDates([])
        setFormData({
            employeeId: "",
            date: format(new Date(), "yyyy-MM-dd"),
            plannedStart: "08:00",
            plannedEnd: "16:00",
            backupEmployeeId: "",
            note: "",
            absenceType: "",
            isRepeating: false,
            repeatEndDate: "",
            repeatDays: [1, 2, 3, 4, 5]
        })
        setShowModal(true)
    }

    const openEditModal = (shift: Shift) => {
        setEditingShift(shift)
        setSuggestedTimes(null) // No suggestions in edit mode
        setConflicts([]) // Reset conflicts
        // Beim Bearbeiten ist der Client bereits implizit gewählt (durch den Mitarbeiter)
        const employee = employees.find(e => e.id === shift.employee.id)
        const selectedClient = clients.find(c => c.employees.some(e => e.id === shift.employee.id))
        setSelectedClientId(selectedClient?.id || "")
        setFormData({
            employeeId: shift.employee.id,
            date: format(new Date(shift.date), "yyyy-MM-dd"),
            plannedStart: shift.plannedStart || "08:00",
            plannedEnd: shift.plannedEnd || "16:00",
            backupEmployeeId: shift.backupEmployee?.id || "",
            note: shift.note || "",
            absenceType: shift.absenceType || "",
            isRepeating: false,
            repeatEndDate: "",
            repeatDays: [1, 2, 3, 4, 5]
        })
        setShowModal(true)
    }

    // Multi-Datum Handlers
    const addAdditionalDate = () => {
        const lastEntry = additionalDates.length > 0
            ? additionalDates[additionalDates.length - 1]
            : { date: formData.date, plannedStart: formData.plannedStart, plannedEnd: formData.plannedEnd }
        // Nächsten Tag berechnen basierend auf letztem Datum
        let nextDate = ""
        if (lastEntry.date) {
            const lastDate = new Date(lastEntry.date)
            lastDate.setDate(lastDate.getDate() + 1)
            nextDate = format(lastDate, "yyyy-MM-dd")
        }
        setAdditionalDates(prev => [...prev, {
            date: nextDate,
            plannedStart: lastEntry.plannedStart,
            plannedEnd: lastEntry.plannedEnd
        }])
        // Wiederholung deaktivieren
        if (formData.isRepeating) {
            setFormData(prev => ({ ...prev, isRepeating: false, repeatEndDate: "", repeatDays: [1, 2, 3, 4, 5] }))
        }
    }

    const removeAdditionalDate = (index: number) => {
        setAdditionalDates(prev => prev.filter((_, i) => i !== index))
    }

    const updateAdditionalDate = (index: number, field: string, value: string) => {
        setAdditionalDates(prev => prev.map((entry, i) =>
            i === index ? { ...entry, [field]: value } : entry
        ))
    }

    // ✅ PERFORMANCE: Prefetch TimesheetDetail data on hover
    // Nutzt globalMutate um direkt in den SWR-Cache zu schreiben
    const prefetchTimesheetDetail = useCallback((employeeId: string, clientId: string) => {
        const url = `/api/admin/submissions/detail?employeeId=${employeeId}&clientId=${clientId}&month=${month}&year=${year}`
        // Prefetch und in SWR-Cache speichern (revalidate: false verhindert doppelten Request)
        globalMutate(url, fetch(url).then(res => res.json()), { revalidate: false })
    }, [month, year, globalMutate])

    // ✅ PERFORMANCE FIX: Memoize event handler
    const openTimesheetPreview = useCallback((shift: Shift) => {
        // Validierung: clientId ist REQUIRED für TimesheetDetail
        const clientId = shift.employee?.team?.client?.id

        if (!shift.employee?.id) {
            showToast("error", "Mitarbeiter-Daten nicht verfügbar")
            return
        }

        if (!clientId) {
            showToast("error", "Klient-Zuordnung fehlt für diesen Mitarbeiter")
            return
        }

        setSelectedTimesheetData({
            employeeId: shift.employee.id,
            clientId: clientId
        })
        setShowTimesheetDetail(true)
    }, [])

    const closeTimesheetPreview = () => {
        setShowTimesheetDetail(false)
        setSelectedTimesheetData(null)
    }

    const navigateMonth = (delta: number) => {
        // Pending Delete-Timeouts und API-Requests abbrechen bei Monatswechsel
        deletedShifts.forEach(({ timeout }) => clearTimeout(timeout))
        deleteAbortControllers.current.forEach((controller) => controller.abort())
        deleteAbortControllers.current.clear()
        setDeletedShifts([])

        // Wichtig: Zuerst auf den 1. des Monats setzen, um Month-Skipping zu vermeiden
        // (z.B. 31. Januar + 1 Monat = 3. März, weil 31. Februar nicht existiert)
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
        setCurrentDate(newDate)
        setExpandedClients(new Set()) // Alle Teams zugeklappt beim Monatswechsel
        setHasInitialExpand(false)
    }

    // Duplicate Shift Handler - Direkt nächsten Tag duplizieren (kein Modal)
    const handleQuickDuplicate = useCallback((shift: Shift) => {
        // Nächsten freien Tag finden (ab morgen des Schicht-Datums)
        const shiftDate = new Date(shift.date)
        let targetDate = new Date(shiftDate)
        targetDate.setDate(targetDate.getDate() + 1)

        // Prüfe ob der Mitarbeiter an dem Tag schon eine Schicht hat
        const employeeShiftDates = new Set(
            shifts.filter(s => s.employee.id === shift.employee.id).map(s => s.date.split("T")[0])
        )
        // Maximal 30 Tage voraus suchen
        for (let i = 0; i < 30; i++) {
            const dateStr = format(targetDate, "yyyy-MM-dd")
            if (!employeeShiftDates.has(dateStr)) break
            targetDate.setDate(targetDate.getDate() + 1)
        }

        const targetDateStr = format(targetDate, "yyyy-MM-dd")

        // 1. Build optimistic shift with temp ID
        const tempId = `temp_${Date.now()}_dup`
        const optimisticShift: Shift = {
            id: tempId,
            date: targetDateStr,
            plannedStart: shift.plannedStart,
            plannedEnd: shift.plannedEnd,
            actualStart: null,
            actualEnd: null,
            status: "PLANNED",
            note: shift.note || null,
            absenceType: shift.absenceType || null,
            employee: { ...shift.employee },
            backupEmployee: shift.backupEmployee ? { ...shift.backupEmployee } : null
        }

        // 2. Instantly add to state
        setShifts(prev => [...prev, optimisticShift].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        ))

        // 3. Show toast immediately
        const dayName = format(targetDate, "EEE dd.MM.", { locale: de })
        showToast("success", `Schicht dupliziert → ${dayName}`)

        // 4. API call in background (non-blocking)
        fetch("/api/admin/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                employeeId: shift.employee.id,
                date: targetDateStr,
                plannedStart: shift.plannedStart,
                plannedEnd: shift.plannedEnd,
                backupEmployeeId: shift.backupEmployee?.id || null,
                note: shift.note || null,
                absenceType: shift.absenceType || null
            })
        }).then(async (res) => {
            if (!res.ok) {
                // Rollback: remove optimistic shift
                setShifts(prev => prev.filter(s => s.id !== tempId))
                const data = await res.json().catch(() => ({}))
                showToast("error", data.error || "Fehler beim Duplizieren")
                return
            }

            const responseData = await res.json().catch(() => ({}))

            // Replace temp ID with real ID from server
            if (responseData.id) {
                setShifts(prev => prev.map(s =>
                    s.id === tempId ? {
                        ...s,
                        id: responseData.id,
                        date: responseData.date || s.date,
                        status: responseData.status || s.status,
                    } : s
                ))
            }

            // Background revalidation for consistency
            mutate()
        }).catch(() => {
            // Rollback on network error
            setShifts(prev => prev.filter(s => s.id !== tempId))
            showToast("error", "Netzwerkfehler beim Duplizieren")
        })
    }, [shifts, mutate])

    // Keyboard Shortcuts Handlers
    const handleCloseModal = useCallback(() => {
        if (showModal) {
            closeModal()
        } else if (showShortcutsHelp) {
            setShowShortcutsHelp(false)
        } else if (showTimesheetDetail) {
            closeTimesheetPreview()
        }
    }, [showModal, showShortcutsHelp, showTimesheetDetail, closeModal])

    const handleSaveShortcut = useCallback(() => {
        if (showModal) {
            handleCreateOrUpdate()
        }
    }, [showModal, handleCreateOrUpdate])

    // Initialize keyboard shortcuts
    useKeyboardShortcuts({
        onNewShift: () => !showModal && openCreateModal(),
        onEscape: handleCloseModal,
        onSave: handleSaveShortcut,
        onPrevMonth: () => !showModal && navigateMonth(-1),
        onNextMonth: () => !showModal && navigateMonth(1),
        onToday: () => !showModal && setCurrentDate(new Date()),
        onListView: () => !showModal && setViewMode("list"),
        onCalendarView: () => !showModal && setViewMode("calendar"),
        onHelp: () => setShowShortcutsHelp(true)
    }, true)

    // Show shortcuts tip on first visit
    useEffect(() => {
        const hasSeenTip = localStorage.getItem("hasSeenShortcutsTip")
        if (!hasSeenTip) {
            setTimeout(() => {
                showToast("info", "Drücke '?' für Tastenkombinationen")
                localStorage.setItem("hasSeenShortcutsTip", "true")
                setHasSeenShortcutsTip(true)
            }, 1500)
        } else {
            setHasSeenShortcutsTip(true)
        }
    }, [])

    const toggleRepeatDay = (day: number) => {
        setFormData(prev => ({
            ...prev,
            repeatDays: prev.repeatDays.includes(day)
                ? prev.repeatDays.filter(d => d !== day)
                : [...prev.repeatDays, day].sort()
        }))
    }

    // Kalender-Daten
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // ✅ PERFORMANCE FIX: Memoize shiftsByDate for calendar view
    const shiftsByDate = useMemo(() => {
        return shifts.reduce((acc, shift) => {
            const dateKey = format(new Date(shift.date), "yyyy-MM-dd")
            if (!acc[dateKey]) acc[dateKey] = []
            acc[dateKey].push(shift)
            return acc
        }, {} as Record<string, Shift[]>)
    }, [shifts])

    const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]

    // ✅ INSTANT UI FIX: Zeige Spinner NUR bei initialem Laden
    // Nach dem ersten Laden: SWR revalidiert im Hintergrund ohne UI-Freeze
    const isInitialLoad = status === "loading" || (loading && shifts.length === 0)


    if (isInitialLoad) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                    <p className="text-neutral-400 font-medium">Dienstplan wird geladen...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Calendar className="text-blue-400" size={28} />
                        Dienstplan-Editor
                    </h1>

                    <div className="flex items-center gap-3">
                        {/* View Toggle */}
                        <div className="flex bg-neutral-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode("list")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                    viewMode === "list" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <List size={16} className="inline mr-2" />
                                Liste
                            </button>
                            <button
                                onClick={() => setViewMode("calendar")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                    viewMode === "calendar" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <Calendar size={16} className="inline mr-2" />
                                Kalender
                            </button>
                        </div>

                        {/* Bulk Delete Button (nur in Listen-Ansicht sichtbar) */}
                        {viewMode === "list" && selectedShiftIds.size > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                disabled={isBulkDeleting}
                                className="flex items-center gap-2 bg-red-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                            >
                                {isBulkDeleting ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Trash2 size={20} />
                                )}
                                <span className="hidden sm:inline">
                                    {isBulkDeleting ? "Lösche..." : `${selectedShiftIds.size} Schichten löschen`}
                                </span>
                                <span className="sm:hidden">{selectedShiftIds.size}</span>
                            </button>
                        )}

                        <button
                            onClick={() => setShowTemplateManager(true)}
                            className="flex items-center gap-2 bg-violet-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-violet-700 transition font-medium"
                        >
                            <Calendar size={20} />
                            <span className="hidden sm:inline">Vorlagen</span>
                        </button>

                        <button
                            onClick={() => openCreateModal()}
                            className="flex items-center gap-2 bg-green-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium"
                        >
                            <Plus size={20} />
                            <span className="hidden sm:inline">Neue Schicht</span>
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-neutral-900 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Month Navigation */}
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

                        {/* Team Filter */}
                        <select
                            value={selectedTeam}
                            onChange={(e) => setSelectedTeam(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-medium text-white"
                        >
                            <option value="">Alle Teams</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="text-sm text-neutral-400">
                        <span className="font-bold text-white">{shifts.length}</span> Schichten
                    </div>
                </div>

                {/* Content */}
                {viewMode === "list" ? (
                    /* Listen-Ansicht mit Klient-Gruppierung */
                    <div className="space-y-4">
                        {shifts.length === 0 ? (
                            <div className="bg-neutral-900 rounded-xl p-8 text-center text-neutral-500">
                                Keine Schichten für diesen Monat
                            </div>
                        ) : (
                            groupedShifts.map(([clientId, group]) => {
                                const isExpanded = expandedClients.has(clientId)
                                const clientName = group.client
                                    ? `${group.client.firstName} ${group.client.lastName}`
                                    : "Ohne Klient"

                                return (
                                    <div key={clientId} className="bg-neutral-900 rounded-xl overflow-hidden">
                                        {/* Klient Header */}
                                        <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
                                            <button
                                                onClick={() => toggleClientExpansion(clientId)}
                                                className="flex-1 flex items-center gap-3"
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="text-neutral-400" size={20} />
                                                ) : (
                                                    <ChevronRight className="text-neutral-400" size={20} />
                                                )}
                                                <span className="text-lg font-semibold text-white">
                                                    {clientName}
                                                </span>
                                                <span className="bg-violet-600/20 text-violet-400 px-2.5 py-0.5 rounded-full text-xs font-bold">
                                                    {group.shifts.length}
                                                </span>
                                            </button>
                                            <div className="flex items-center gap-1">
                                                {clientId !== "unassigned" && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            openCreateModalForClient(clientId)
                                                        }}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-violet-400 hover:bg-violet-900/20 transition-colors"
                                                        title="Schicht erstellen"
                                                    >
                                                        <Plus size={14} />
                                                        <span className="hidden sm:inline">Schicht</span>
                                                    </button>
                                                )}
                                                {clientId !== "unassigned" && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            router.push(`/admin/submissions?clientId=${clientId}&month=${month}&year=${year}`)
                                                        }}
                                                        className="p-2 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-violet-400 transition-colors"
                                                        aria-label="Zu den Nachweisen"
                                                        title="Zu den Nachweisen"
                                                    >
                                                        <ExternalLink size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Schichten-Tabelle (nur wenn expanded) */}
                                        {isExpanded && (
                                            <table className="w-full">
                                                <thead className="bg-neutral-800">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left w-12">
                                                            <input
                                                                type="checkbox"
                                                                checked={group.shifts.length > 0 && group.shifts.every(s => selectedShiftIds.has(s.id))}
                                                                onChange={() => toggleSelectTeam(group.shifts)}
                                                                className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 checked:bg-violet-600 checked:border-violet-600 accent-violet-600 focus:ring-1 focus:ring-violet-500/50 focus:ring-offset-0 cursor-pointer"
                                                                aria-label={`Alle Schichten von ${clientName} auswählen`}
                                                            />
                                                        </th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Datum</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Mitarbeiter</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Geplant</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Gearbeitet</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Backup</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Status</th>
                                                        <th className="px-3 py-2 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wide">Aktionen</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-800">
                                                    {group.shifts.map(shift => {
                                                        const isSelected = selectedShiftIds.has(shift.id)
                                                        return (
                                                            <tr
                                                                key={shift.id}
                                                                onMouseEnter={() => {
                                                                    const clientId = shift.employee?.team?.client?.id
                                                                    if (shift.employee?.id && clientId) {
                                                                        prefetchTimesheetDetail(shift.employee.id, clientId)
                                                                    }
                                                                }}
                                                                className={`transition ${
                                                                    isSelected
                                                                        ? "bg-violet-900/20 border-l-2 border-violet-600"
                                                                        : "hover:bg-neutral-800/50"
                                                                }`}
                                                            >
                                                                <td className="px-3 py-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleShiftSelection(shift.id)}
                                                                        className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 checked:bg-violet-600 checked:border-violet-600 accent-violet-600 focus:ring-1 focus:ring-violet-500/50 focus:ring-offset-0 cursor-pointer"
                                                                        aria-label={`Schicht vom ${format(new Date(shift.date), "dd.MM.")} auswählen`}
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-2 font-medium text-white text-sm">
                                                                    {format(new Date(shift.date), "EEE, dd.MM.", { locale: de })}
                                                                </td>
                                                                <td className="px-3 py-2 text-sm">
                                                                    <button
                                                                        onClick={() => router.push(`/admin/assistants?employeeId=${shift.employee.id}`)}
                                                                        className="text-violet-400 hover:text-violet-300 transition-colors duration-150 cursor-pointer"
                                                                        title="Assistent bearbeiten"
                                                                    >
                                                                        {shift.employee.name}
                                                                    </button>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="bg-neutral-800 px-2 py-0.5 rounded text-xs font-medium text-neutral-300">
                                                                            {formatTimeRange(shift.plannedStart, shift.plannedEnd)}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 text-sm">
                                                                    {shift.actualStart && shift.actualEnd &&
                                                                     (shift.actualStart !== shift.plannedStart || shift.actualEnd !== shift.plannedEnd) ? (
                                                                        <span className="bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded text-xs font-medium">
                                                                            {formatTimeRange(shift.actualStart, shift.actualEnd)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-neutral-500">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-neutral-400 text-sm">
                                                                    {shift.backupEmployee?.name || "-"}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                                                        shift.absenceType === "SICK" ? "bg-red-900/50 text-red-400" :
                                                                        shift.absenceType === "VACATION" ? "bg-cyan-900/50 text-cyan-400" :
                                                                        shift.status === "CONFIRMED" ? "bg-green-900/50 text-green-400" :
                                                                        shift.status === "CHANGED" ? "bg-amber-900/50 text-amber-400" :
                                                                        shift.status === "SUBMITTED" ? "bg-blue-900/50 text-blue-400" :
                                                                        shift.status === "COMPLETED" ? "bg-emerald-900/50 text-emerald-400" :
                                                                        "bg-neutral-800 text-neutral-400"
                                                                    }`}>
                                                                        {shift.absenceType === "SICK" ? "Krank" :
                                                                         shift.absenceType === "VACATION" ? "Urlaub" :
                                                                         shift.status === "CONFIRMED" ? "Bestätigt" :
                                                                         shift.status === "CHANGED" ? "Geändert" :
                                                                         shift.status === "SUBMITTED" ? "Eingereicht" :
                                                                         shift.status === "COMPLETED" ? "Abgeschlossen" : "Geplant"}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                    <div className="flex gap-1 justify-end">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                openTimesheetPreview(shift)
                                                                            }}
                                                                            className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition"
                                                                            title="Stundennachweis anzeigen"
                                                                        >
                                                                            <Eye size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                handleQuickDuplicate(shift)
                                                                            }}
                                                                            className="p-1.5 text-neutral-500 hover:text-green-400 hover:bg-green-900/30 rounded transition"
                                                                            title="Schicht duplizieren (nächster freier Tag)"
                                                                        >
                                                                            <Copy size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => openEditModal(shift)}
                                                                            className="p-1.5 text-neutral-500 hover:text-blue-400 hover:bg-blue-900/30 rounded transition"
                                                                            title="Schicht bearbeiten"
                                                                        >
                                                                            <Edit2 size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDelete(shift.id)}
                                                                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                                                                            title="Schicht löschen"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                ) : (
                    /* Kalender-Ansicht */
                    <div className="bg-neutral-900 rounded-xl p-4">
                        {/* Wochentage Header */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {dayNames.map(day => (
                                <div key={day} className="text-center text-xs font-bold text-neutral-500 py-2 uppercase tracking-wide">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Kalender Grid */}
                        <div className="grid grid-cols-7 gap-1">
                            {/* Leere Zellen für Tage vor Monatsanfang */}
                            {Array.from({ length: getDay(monthStart) }).map((_, i) => (
                                <div key={`empty-${i}`} className="min-h-[80px] bg-neutral-950 rounded-lg" />
                            ))}

                            {/* Tage des Monats */}
                            {calendarDays.map(day => {
                                const dateKey = format(day, "yyyy-MM-dd")
                                const dayShifts = shiftsByDate[dateKey] || []
                                const isToday = isSameDay(day, new Date())

                                return (
                                    <div
                                        key={dateKey}
                                        className={`min-h-[80px] border rounded-lg p-1.5 cursor-pointer hover:bg-neutral-800 transition ${
                                            isToday ? "border-blue-500 border-2 bg-blue-950/20" : "border-neutral-800 bg-neutral-900"
                                        }`}
                                        onClick={() => openCreateModal(day)}
                                    >
                                        <div className={`text-xs font-bold mb-1 ${isToday ? "text-blue-400" : "text-neutral-400"}`}>
                                            {format(day, "d")}
                                        </div>
                                        <div className="space-y-0.5">
                                            {dayShifts.slice(0, 3).map(shift => (
                                                    <div
                                                        key={shift.id}
                                                        className="text-[10px] bg-blue-900/50 text-blue-300 px-1 py-0.5 rounded cursor-pointer hover:bg-blue-900 flex items-center gap-1"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            openEditModal(shift)
                                                        }}
                                                        title={`${shift.employee.name} ${shift.plannedStart}-${shift.plannedEnd}`}
                                                    >
                                                        <span className="truncate flex-1">{shift.employee.name.split(" ")[0]}</span>
                                                    </div>
                                                ))}
                                            {dayShifts.length > 3 && (
                                                <div className="text-[10px] text-neutral-500">
                                                    +{dayShifts.length - 3} mehr
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Modal für Schicht erstellen/bearbeiten */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                        <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-neutral-800">
                            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">
                                    {editingShift ? "Schicht bearbeiten" : "Neue Schicht"}
                                </h2>
                                <button onClick={closeModal} className="text-neutral-500 hover:text-white transition">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Stufe 1: Klient-Auswahl (nur bei Neuanlage ohne bereits gewählten Client) */}
                                {!editingShift && !selectedClientId ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-2">
                                                Klient auswählen *
                                            </label>
                                            <p className="text-xs text-neutral-500 mb-3">
                                                Wählen Sie zunächst den Klienten aus, für den die Schicht geplant werden soll.
                                            </p>
                                            <select
                                                value={selectedClientId}
                                                onChange={(e) => setSelectedClientId(e.target.value)}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                                autoFocus
                                            >
                                                <option value="">Klient wählen...</option>
                                                {clients
                                                    .filter(c => c.isActive)
                                                    .map(client => (
                                                        <option key={client.id} value={client.id}>
                                                            {client.firstName} {client.lastName}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>

                                        {clients.filter(c => c.isActive).length === 0 && (
                                            <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
                                                <p className="text-sm text-amber-300">
                                                    Keine aktiven Klienten gefunden. Bitte erstellen Sie zunächst einen Klienten.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Stufe 2: Alle weiteren Felder */
                                    <>
                                        {/* Gewählter Klient (Anzeige, änderbar) */}
                                        {!editingShift && selectedClientId && (
                                            <div className="bg-violet-900/20 border border-violet-700 rounded-lg p-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs text-violet-400 font-medium">Klient</p>
                                                    <p className="text-sm text-white font-semibold">
                                                        {clients.find(c => c.id === selectedClientId)?.firstName}{" "}
                                                        {clients.find(c => c.id === selectedClientId)?.lastName}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setSelectedClientId("")
                                                        setFormData({ ...formData, employeeId: "", backupEmployeeId: "" })
                                                    }}
                                                    className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                                                >
                                                    Ändern
                                                </button>
                                            </div>
                                        )}

                                        {/* Mitarbeiter (gefiltert nach Klient) */}
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                Mitarbeiter *
                                            </label>
                                            <select
                                                value={formData.employeeId}
                                                onChange={(e) => {
                                                    const newEmployeeId = e.target.value
                                                    setFormData({ ...formData, employeeId: newEmployeeId })
                                                    if (newEmployeeId && !editingShift) {
                                                        loadSmartDefaults(newEmployeeId)
                                                    }
                                                }}
                                                disabled={!!editingShift}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 disabled:opacity-50 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            >
                                                <option value="">Auswählen...</option>
                                                {(() => {
                                                    const selectedClient = clients.find(c => c.id === selectedClientId)
                                                    const availableEmployees = selectedClient?.employees || []

                                                    if (availableEmployees.length === 0) {
                                                        return <option disabled>Keine Mitarbeiter zugeordnet</option>
                                                    }

                                                    return availableEmployees.map(emp => (
                                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                                    ))
                                                })()}
                                            </select>
                                            {selectedClientId && clients.find(c => c.id === selectedClientId)?.employees.length === 0 && (
                                                <p className="text-xs text-amber-400 mt-1">
                                                    Diesem Klienten sind noch keine Mitarbeiter zugeordnet.
                                                </p>
                                            )}
                                            {loadingSuggestions && (
                                                <div className="flex items-center gap-2 mt-2 text-xs text-neutral-500">
                                                    <div className="animate-spin rounded-full h-3 w-3 border-b border-violet-500"></div>
                                                    Lade Zeitvorschläge...
                                                </div>
                                            )}
                                            {suggestedTimes && !loadingSuggestions && (
                                                <div className="flex items-center gap-2 mt-2 p-2 bg-blue-900/20 border border-blue-700 rounded text-xs text-blue-300">
                                                    <Info size={14} />
                                                    Vorgeschlagene Zeiten basierend auf Historie ({Math.round(suggestedTimes.confidence * 100)}% Übereinstimmung)
                                                </div>
                                            )}
                                        </div>

                                        {/* Datum */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="block text-sm font-medium text-neutral-400">
                                                    Datum *
                                                </label>
                                                {formData.date && (
                                                    <span className="text-sm text-violet-400 font-medium">
                                                        {format(new Date(formData.date + "T12:00:00"), "EEEE", { locale: de })}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                disabled={!!editingShift}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 disabled:opacity-50 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            />
                                        </div>

                                        {/* Zeiten */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                    Start
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="08:00"
                                                    value={formData.plannedStart}
                                                    onChange={(e) => {
                                                        let val = e.target.value.replace(/[^0-9:]/g, '')
                                                        // Auto-format: Nach 2 Ziffern Doppelpunkt einfügen
                                                        if (val.length === 2 && !val.includes(':') && formData.plannedStart.length < 2) {
                                                            val = val + ':'
                                                        }
                                                        if (val.length <= 5) {
                                                            setFormData({ ...formData, plannedStart: val })
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        // Format korrigieren beim Verlassen
                                                        const val = e.target.value
                                                        const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                                        if (match) {
                                                            const h = match[1].padStart(2, '0')
                                                            const m = (match[2] || '00').padStart(2, '0')
                                                            if (parseInt(h, 10) <= 24 && parseInt(m, 10) <= 59) {
                                                                setFormData({ ...formData, plannedStart: `${h}:${m}` })
                                                            }
                                                        }
                                                    }}
                                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                    Ende
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="16:00"
                                                    value={formData.plannedEnd}
                                                    onChange={(e) => {
                                                        let val = e.target.value.replace(/[^0-9:]/g, '')
                                                        // Auto-format: Nach 2 Ziffern Doppelpunkt einfügen
                                                        if (val.length === 2 && !val.includes(':') && formData.plannedEnd.length < 2) {
                                                            val = val + ':'
                                                        }
                                                        if (val.length <= 5) {
                                                            setFormData({ ...formData, plannedEnd: val })
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        // Format korrigieren beim Verlassen
                                                        const val = e.target.value
                                                        const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                                        if (match) {
                                                            const h = match[1].padStart(2, '0')
                                                            const m = (match[2] || '00').padStart(2, '0')
                                                            if (parseInt(h, 10) <= 24 && parseInt(m, 10) <= 59) {
                                                                setFormData({ ...formData, plannedEnd: `${h}:${m}` })
                                                            }
                                                        }
                                                    }}
                                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors font-mono"
                                                />
                                            </div>
                                        </div>

                                        {/* Multi-Datum: Plus-Button + zusätzliche Termine (nur Neuanlage, nicht bei Wiederholung) */}
                                        {!editingShift && !formData.isRepeating && (
                                            <div className="space-y-3">
                                                {/* Zusätzliche Termine */}
                                                {additionalDates.length > 0 && (
                                                    <div className="border-t border-neutral-800 pt-3 space-y-3">
                                                        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                                            Zusätzliche Termine
                                                        </span>
                                                        {additionalDates.map((entry, idx) => (
                                                            <div key={idx} className="bg-neutral-800/50 rounded-lg p-3 space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <input
                                                                                type="date"
                                                                                value={entry.date}
                                                                                onChange={(e) => updateAdditionalDate(idx, "date", e.target.value)}
                                                                                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors text-sm"
                                                                            />
                                                                            {entry.date && (
                                                                                <span className="text-xs text-violet-400 font-medium whitespace-nowrap">
                                                                                    {format(new Date(entry.date + "T12:00:00"), "EEE", { locale: de })}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeAdditionalDate(idx)}
                                                                        className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                                                        title="Termin entfernen"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="block text-xs text-neutral-500 mb-1">Start</label>
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            placeholder="08:00"
                                                                            value={entry.plannedStart}
                                                                            onChange={(e) => {
                                                                                let val = e.target.value.replace(/[^0-9:]/g, '')
                                                                                if (val.length === 2 && !val.includes(':') && entry.plannedStart.length < 2) {
                                                                                    val = val + ':'
                                                                                }
                                                                                if (val.length <= 5) {
                                                                                    updateAdditionalDate(idx, "plannedStart", val)
                                                                                }
                                                                            }}
                                                                            onBlur={(e) => {
                                                                                const val = e.target.value
                                                                                const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                                                                if (match) {
                                                                                    const h = match[1].padStart(2, '0')
                                                                                    const m = (match[2] || '00').padStart(2, '0')
                                                                                    if (parseInt(h, 10) <= 24 && parseInt(m, 10) <= 59) {
                                                                                        updateAdditionalDate(idx, "plannedStart", `${h}:${m}`)
                                                                                    }
                                                                                }
                                                                            }}
                                                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors font-mono text-sm"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs text-neutral-500 mb-1">Ende</label>
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            placeholder="16:00"
                                                                            value={entry.plannedEnd}
                                                                            onChange={(e) => {
                                                                                let val = e.target.value.replace(/[^0-9:]/g, '')
                                                                                if (val.length === 2 && !val.includes(':') && entry.plannedEnd.length < 2) {
                                                                                    val = val + ':'
                                                                                }
                                                                                if (val.length <= 5) {
                                                                                    updateAdditionalDate(idx, "plannedEnd", val)
                                                                                }
                                                                            }}
                                                                            onBlur={(e) => {
                                                                                const val = e.target.value
                                                                                const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                                                                if (match) {
                                                                                    const h = match[1].padStart(2, '0')
                                                                                    const m = (match[2] || '00').padStart(2, '0')
                                                                                    if (parseInt(h, 10) <= 24 && parseInt(m, 10) <= 59) {
                                                                                        updateAdditionalDate(idx, "plannedEnd", `${h}:${m}`)
                                                                                    }
                                                                                }
                                                                            }}
                                                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors font-mono text-sm"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Plus-Button */}
                                                <button
                                                    type="button"
                                                    onClick={addAdditionalDate}
                                                    className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-neutral-700 rounded-lg text-sm text-neutral-400 hover:text-violet-400 hover:border-violet-500/50 hover:bg-violet-900/10 transition-colors"
                                                >
                                                    <Plus size={16} />
                                                    Weiteres Datum hinzufügen
                                                </button>
                                            </div>
                                        )}

                                        {/* Conflict Warnings - Fixed height container prevents jumping */}
                                        <div className="min-h-[44px]">
                                            {validating && (
                                                <div className="flex items-center gap-2 p-2 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-400">
                                                    <div className="animate-spin rounded-full h-3 w-3 border-b border-violet-500"></div>
                                                    Prüfe auf Konflikte...
                                                </div>
                                            )}
                                            {!validating && conflicts.length > 0 && (
                                                <div className="space-y-2">
                                                    {conflicts.map((conflict, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`flex items-start gap-2 p-2 border rounded text-sm ${
                                                                conflict.severity === "error"
                                                                    ? "bg-red-900/20 border-red-700 text-red-400"
                                                                    : "bg-amber-900/20 border-amber-700 text-amber-400"
                                                            }`}
                                                        >
                                                            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                                                            <span>{conflict.message}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Backup */}
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                Backup-Mitarbeiter
                                            </label>
                                            <select
                                                value={formData.backupEmployeeId}
                                                onChange={(e) => setFormData({ ...formData, backupEmployeeId: e.target.value })}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            >
                                                <option value="">Kein Backup</option>
                                                {(() => {
                                                    const selectedClient = clients.find(c => c.id === selectedClientId)
                                                    const availableEmployees = selectedClient?.employees.filter(e => e.id !== formData.employeeId) || []

                                                    return availableEmployees.map(emp => (
                                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                                    ))
                                                })()}
                                            </select>
                                        </div>

                                        {/* Notiz */}
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                Notiz
                                            </label>
                                            <textarea
                                                value={formData.note}
                                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors resize-none"
                                                rows={2}
                                                placeholder="Optionale Notizen zur Schicht..."
                                            />
                                        </div>

                                        {/* Abwesenheitstyp */}
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                Abwesenheitstyp
                                            </label>
                                            <select
                                                value={formData.absenceType}
                                                onChange={(e) => setFormData({ ...formData, absenceType: e.target.value })}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            >
                                                <option value="">Normal (Arbeit)</option>
                                                <option value="VACATION">Urlaub</option>
                                                <option value="SICK">Krank</option>
                                            </select>
                                            <p className="text-xs text-neutral-500 mt-1">
                                                Bei Urlaub wird automatisch mit Urlaubs-App synchronisiert
                                            </p>
                                        </div>

                                        {/* Wiederholung (nur bei Neuanlage) */}
                                        {!editingShift && (
                                            <div className="border-t border-neutral-800 pt-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.isRepeating}
                                                        disabled={additionalDates.length > 0}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, isRepeating: e.target.checked })
                                                            if (e.target.checked) {
                                                                setAdditionalDates([])
                                                            }
                                                        }}
                                                        className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 checked:bg-violet-600 checked:border-violet-600 accent-violet-600 focus:ring-1 focus:ring-violet-500/50 focus:ring-offset-0 disabled:opacity-40"
                                                    />
                                                    <span className={`text-sm font-medium ${additionalDates.length > 0 ? "text-neutral-500" : "text-neutral-300"}`}>
                                                        Schicht wiederholen
                                                        {additionalDates.length > 0 && (
                                                            <span className="text-xs text-neutral-600 ml-1">(deaktiviert bei Mehrfach-Datum)</span>
                                                        )}
                                                    </span>
                                                </label>

                                                {formData.isRepeating && (
                                                    <div className="mt-3 space-y-3 pl-6">
                                                        <div>
                                                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                                Bis Datum
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={formData.repeatEndDate}
                                                                onChange={(e) => setFormData({ ...formData, repeatEndDate: e.target.value })}
                                                                min={formData.date}
                                                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-neutral-400 mb-2">
                                                                Wochentage
                                                            </label>
                                                            <div className="flex gap-1">
                                                                {dayNames.map((name, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        type="button"
                                                                        onClick={() => toggleRepeatDay(idx)}
                                                                        className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                                                                            formData.repeatDays.includes(idx)
                                                                                ? "bg-violet-600 text-white hover:bg-violet-700"
                                                                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                                                                        }`}
                                                                    >
                                                                        {name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 px-6 py-4 flex gap-3">
                                {!editingShift && !selectedClientId ? (
                                    /* Stufe 1: Nur Abbrechen-Button */
                                    <button
                                        onClick={closeModal}
                                        className="flex-1 border border-neutral-700 py-2.5 rounded-xl font-bold text-neutral-400 hover:bg-neutral-800 transition-colors"
                                    >
                                        Abbrechen
                                    </button>
                                ) : (
                                    /* Stufe 2: Speichern + Abbrechen */
                                    <>
                                        <button
                                            onClick={handleCreateOrUpdate}
                                            disabled={loading}
                                            className="flex-1 bg-violet-600 text-white py-2.5 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Save size={18} />
                                            {loading ? "Speichert..." : "Speichern"}
                                        </button>
                                        <button
                                            onClick={closeModal}
                                            className="flex-1 border border-neutral-700 py-2.5 rounded-xl font-bold text-neutral-400 hover:bg-neutral-800 transition-colors"
                                        >
                                            Abbrechen
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Timesheet Detail Modal */}
                {showTimesheetDetail && selectedTimesheetData && (
                    <TimesheetDetail
                        employeeId={selectedTimesheetData.employeeId}
                        clientId={selectedTimesheetData.clientId}
                        month={month}
                        year={year}
                        onClose={closeTimesheetPreview}
                    />
                )}

                {/* Keyboard Shortcuts Help Modal */}
                {showShortcutsHelp && (
                    <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
                )}

                {/* Shift Template Manager */}
                <ShiftTemplateManager
                    isOpen={showTemplateManager}
                    onClose={() => setShowTemplateManager(false)}
                    employees={employees}
                    clients={clients}
                    currentMonth={month}
                    currentYear={year}
                    onTemplateApplied={() => {
                        mutate()
                        setShowTemplateManager(false)
                    }}
                />
            </div>
        </div>
    )
}
