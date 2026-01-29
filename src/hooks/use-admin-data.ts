import useSWR from 'swr'

// SWR fetcher function
const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
})

// SWR configuration for admin pages
const swrConfig = {
    revalidateOnFocus: true,     // Refetch when window regains focus
    revalidateOnReconnect: true,
    dedupingInterval: 2000,      // Dedupe requests within 2 seconds (reduced from 5s for faster updates)
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
        '/api/teams',
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
            refreshInterval: 30000, // Auto-refresh alle 30 Sekunden
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
