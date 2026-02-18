import useSWR, { preload } from 'swr'
import { useEffect, useRef, useCallback } from 'react'

// SWR fetcher function
const fetcher = (url: string) => fetch(url).then(res => {
    if (res.status === 401) {
        // Session abgelaufen → Login
        window.location.href = "/login"
        throw new Error("Session expired")
    }
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
})

// Helper: Berechne Vormonat und Nachmonat
function getAdjacentMonths(month: number, year: number) {
    const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
    const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
    return [prev, next]
}

// Prefetch benachbarter Monate für sofortige Navigation
// buildUrl nimmt (month, year) und gibt die exakte SWR-Cache-Key-URL zurück
function usePrefetchAdjacentMonths(month: number, year: number, isLoading: boolean, buildUrl: (m: number, y: number) => string) {
    const prefetchedRef = useRef<string>("")

    useEffect(() => {
        // Erst prefetchen wenn aktueller Monat fertig geladen ist
        if (isLoading) return

        const cacheKey = `${month}-${year}`
        if (prefetchedRef.current === cacheKey) return
        prefetchedRef.current = cacheKey

        const adjacent = getAdjacentMonths(month, year)
        // Kurze Verzögerung damit der aktuelle Render nicht blockiert wird
        const timer = setTimeout(() => {
            for (const { month: m, year: y } of adjacent) {
                preload(buildUrl(m, y), fetcher)
            }
        }, 200)

        return () => clearTimeout(timer)
    }, [month, year, isLoading, buildUrl])
}

// SWR configuration for admin pages - Optimized for INSTANT navigation
// WICHTIG: Keine automatischen Retries! Bei Supabase Session Mode Connection Pool Overflow
// würden Retries das Problem nur verschlimmern.
const swrConfig = {
    revalidateOnFocus: false,       // NICHT bei jedem Tab-Wechsel
    revalidateOnReconnect: false,   // Kein Refetch bei Reconnect
    dedupingInterval: 300000,       // 5 Minuten - wie AdminDataProvider (Cache bleibt zwischen Seitenwechseln)
    revalidateIfStale: false,       // KEIN automatischer Refetch - Daten werden nur via mutate() aktualisiert
    keepPreviousData: true,         // Show cached data while loading new data (better UX)
    errorRetryCount: 0,             // KEINE Retries - verhindert Connection Pool Overflow
}

// Dashboard / Timesheets
export function useAdminTimesheets(month: number, year: number, employeeId?: string, teamId?: string) {
    const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        ...(employeeId && { employeeId }),
        ...(teamId && { teamId })
    })

    const { data, error, isLoading, mutate } = useSWR(
        `/api/admin/timesheets?${params}`,
        fetcher,
        swrConfig
    )

    // Prefetch Vor- und Nachmonat
    const buildTimesheetsUrl = useCallback((m: number, y: number) => {
        const p = new URLSearchParams({ month: String(m), year: String(y), ...(employeeId && { employeeId }), ...(teamId && { teamId }) })
        return `/api/admin/timesheets?${p}`
    }, [employeeId, teamId])
    usePrefetchAdjacentMonths(month, year, isLoading, buildTimesheetsUrl)

    return {
        timesheets: data?.timesheets || [],
        teams: data?.teams || [],
        employees: data?.employees || [],
        isLoading,
        isError: error,
        mutate
    }
}

// Schedule / Dienstplan
export function useAdminSchedule(month: number, year: number, teamId?: string) {
    const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        ...(teamId && { teamId })
    })

    const { data, error, isLoading, mutate } = useSWR(
        `/api/admin/schedule?${params}`,
        fetcher,
        swrConfig
    )

    // Prefetch Vor- und Nachmonat für sofortige Navigation
    const buildScheduleUrl = useCallback((m: number, y: number) => {
        const p = new URLSearchParams({ month: String(m), year: String(y), ...(teamId && { teamId }) })
        return `/api/admin/schedule?${p}`
    }, [teamId])
    usePrefetchAdjacentMonths(month, year, isLoading, buildScheduleUrl)

    return {
        shifts: data?.shifts || [],
        employees: data?.employees || [],
        teams: data?.teams || [],
        isLoading,
        isError: error,
        mutate
    }
}

// Clients / Klienten
export function useClients() {
    const { data, error, isLoading, mutate } = useSWR(
        '/api/clients',
        fetcher,
        swrConfig
    )

    return {
        clients: data?.clients || [],
        isLoading,
        isError: error,
        mutate
    }
}

// Employees / Assistenten
export function useAdminEmployees() {
    const { data, error, isLoading, mutate } = useSWR(
        '/api/admin/employees',
        fetcher,
        swrConfig
    )

    return {
        employees: data?.employees || [],
        isLoading,
        isError: error,
        mutate
    }
}

// Teams
export function useTeams() {
    const { data, error, isLoading, mutate } = useSWR(
        '/api/admin/teams',
        fetcher,
        swrConfig
    )

    return {
        teams: data?.teams || [],
        isLoading,
        isError: error,
        mutate
    }
}

// Submissions / Einreichungen
export function useAdminSubmissions(month?: number, year?: number) {
    const params = new URLSearchParams()
    if (month) params.set('month', String(month))
    if (year) params.set('year', String(year))

    const { data, error, isLoading, mutate } = useSWR(
        `/api/admin/submissions?${params}`,
        fetcher,
        swrConfig
    )

    // Prefetch Vor- und Nachmonat
    const effMonth = month || new Date().getMonth() + 1
    const effYear = year || new Date().getFullYear()
    const buildSubmissionsUrl = useCallback((m: number, y: number) => {
        const p = new URLSearchParams()
        p.set('month', String(m))
        p.set('year', String(y))
        return `/api/admin/submissions?${p}`
    }, [])
    usePrefetchAdjacentMonths(effMonth, effYear, isLoading, buildSubmissionsUrl)

    return {
        submissions: data?.submissions || [],
        pendingDienstplaene: data?.pendingDienstplaene || [],
        targetMonth: data?.targetMonth,
        targetYear: data?.targetYear,
        isLoading,
        isError: error,
        mutate
    }
}

// Activity Log / Aktivitätsprotokoll
export function useActivityLog(limit = 50, type?: string, category?: string) {
    const params = new URLSearchParams({ limit: String(limit) })
    if (type) params.set('type', type)
    if (category) params.set('category', category)

    const { data, error, isLoading, mutate } = useSWR(
        `/api/admin/activity?${params}`,
        fetcher,
        {
            ...swrConfig,
            refreshInterval: 300000, // Auto-refresh alle 5 Minuten
        }
    )

    return {
        activities: data?.activities || [],
        total: data?.total || 0,
        isLoading,
        isError: error,
        mutate
    }
}

// Payroll / Lohnliste
export function useAdminPayroll(month: number, year: number) {
    const params = new URLSearchParams({
        month: String(month),
        year: String(year)
    })

    const { data, error, isLoading, mutate } = useSWR(
        `/api/admin/payroll?${params}`,
        fetcher,
        swrConfig
    )

    // Prefetch Vor- und Nachmonat
    const buildPayrollUrl = useCallback((m: number, y: number) =>
        `/api/admin/payroll?month=${m}&year=${y}`, [])
    usePrefetchAdjacentMonths(month, year, isLoading, buildPayrollUrl)

    return {
        payroll: data?.payroll || [],
        totals: data?.totals || {},
        month: data?.month,
        year: data?.year,
        employeeCount: data?.employeeCount || 0,
        isLoading,
        isError: error,
        mutate
    }
}

// Absences / Abwesenheiten (Urlaub, Krank)
export interface AbsenceEntry {
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

export interface AbsenceData {
    absences: AbsenceEntry[]
}

export function useAdminVacations(month: number, year: number) {
    const { data, error, isLoading, mutate } = useSWR<AbsenceData>(
        `/api/admin/vacations/absences?month=${month}&year=${year}`,
        fetcher,
        swrConfig
    )

    // Prefetch Vor- und Nachmonat
    const buildVacationsUrl = useCallback((m: number, y: number) =>
        `/api/admin/vacations/absences?month=${m}&year=${y}`, [])
    usePrefetchAdjacentMonths(month, year, isLoading, buildVacationsUrl)

    return {
        absences: data?.absences || [],
        isLoading,
        isError: error,
        mutate
    }
}
