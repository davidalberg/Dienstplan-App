"use client"

import { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react'
import useSWR from 'swr'

// SWR fetcher function
const fetcher = (url: string) => fetch(url).then(res => {
    if (res.status === 401) {
        window.location.href = "/login"
        throw new Error("Session expired")
    }
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
})

// Preload config - nur beim ersten Mount laden, dann aggressive Caching
const preloadConfig = {
    revalidateOnFocus: false,     // Keine Revalidierung bei Focus
    revalidateOnReconnect: false, // Keine Revalidierung bei Reconnect
    dedupingInterval: 300000,     // 5 Minuten - verhindert doppelte Requests
    revalidateIfStale: false,     // Keine automatische Revalidierung
    focusThrottleInterval: 300000, // 5 Minuten zwischen Focus-Revalidierungen
    errorRetryCount: 1,           // Nur 1x Retry bei Fehlern
}

// Helper: Liest Monat/Jahr aus localStorage oder Fallback auf aktuellen Monat
function getSelectedMonth(): { month: number; year: number } {
    if (typeof window === 'undefined') {
        const now = new Date()
        return { month: now.getMonth() + 1, year: now.getFullYear() }
    }
    try {
        const saved = localStorage.getItem('admin-selected-month')
        if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed.month >= 1 && parsed.month <= 12 && parsed.year >= 2020) {
                return parsed
            }
        }
    } catch { /* ignore */ }
    const now = new Date()
    return { month: now.getMonth() + 1, year: now.getFullYear() }
}

// Types
interface Employee {
    id: string
    name: string
    email: string
    teamId: string | null
}

interface Client {
    id: string
    firstName: string
    lastName: string
    isActive: boolean
    employees: { id: string; name: string }[]
}

interface Team {
    id: string
    name: string
}

interface AdminDataContextType {
    // Master Data
    employees: Employee[]
    clients: Client[]
    teams: Team[]

    // Loading States
    isLoadingEmployees: boolean
    isLoadingClients: boolean
    isLoadingTeams: boolean

    // Combined loading state
    isLoading: boolean

    // Mutations
    mutateEmployees: () => void
    mutateClients: () => void
    mutateTeams: () => void

    // Utility function to get client by ID
    getClientById: (id: string) => Client | undefined

    // Utility function to get employee by ID
    getEmployeeById: (id: string) => Employee | undefined
}

const AdminDataContext = createContext<AdminDataContextType | null>(null)

/**
 * AdminDataProvider - Zentrale Datenverwaltung für Admin-Bereich
 *
 * Lädt Master-Daten (Employees, Clients, Teams) UND monats-spezifische Daten
 * (Submissions, Payroll, Vacations, Timesheets) PARALLEL beim ersten Mount.
 * 7 parallele Requests sind sicher für den Connection Pool (limit=10).
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
    // Monat/Jahr State für Prefetch — aus localStorage initialisiert
    const [selectedMonth, setSelectedMonth] = useState(getSelectedMonth)

    // Lausche auf Monatswechsel (CustomEvent von Admin-Seiten + storage-Event von anderen Tabs)
    useEffect(() => {
        const handleMonthChanged = (e: Event) => {
            const detail = (e as CustomEvent).detail
            if (detail?.month && detail?.year) {
                setSelectedMonth({ month: detail.month, year: detail.year })
            }
        }

        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'admin-selected-month' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue)
                    if (parsed.month >= 1 && parsed.month <= 12) {
                        setSelectedMonth(parsed)
                    }
                } catch { /* ignore */ }
            }
        }

        window.addEventListener('admin-month-changed', handleMonthChanged)
        window.addEventListener('storage', handleStorage)
        return () => {
            window.removeEventListener('admin-month-changed', handleMonthChanged)
            window.removeEventListener('storage', handleStorage)
        }
    }, [])

    // === Master Data (nicht monats-abhängig) ===
    const {
        data: employeesData,
        isLoading: isLoadingEmployees,
        mutate: mutateEmployees
    } = useSWR('/api/admin/employees', fetcher, preloadConfig)

    const {
        data: clientsData,
        isLoading: isLoadingClients,
        mutate: mutateClients
    } = useSWR('/api/clients', fetcher, preloadConfig)

    const {
        data: teamsData,
        isLoading: isLoadingTeams,
        mutate: mutateTeams
    } = useSWR('/api/admin/teams', fetcher, preloadConfig)

    // === Monats-spezifische Prefetches (wärmen SWR-Cache für Seiten) ===
    const { month, year } = selectedMonth

    // Diese Hooks fetchen die Daten in den SWR-Cache, die Seiten nutzen dann denselben Cache-Key
    useSWR(`/api/admin/submissions?month=${month}&year=${year}`, fetcher, preloadConfig)
    useSWR(`/api/admin/payroll?month=${month}&year=${year}`, fetcher, preloadConfig)
    useSWR(`/api/admin/vacations/absences?month=${month}&year=${year}`, fetcher, preloadConfig)
    useSWR(`/api/admin/timesheets?month=${month}&year=${year}`, fetcher, preloadConfig)

    // Extrahiere Daten aus Response
    const employees = employeesData?.employees || []
    const clients = clientsData?.clients || []
    const teams = teamsData?.teams || []

    // Combined loading state - alle 3 müssen fertig sein
    const isLoading = isLoadingEmployees || isLoadingClients || isLoadingTeams

    // Memoize utility functions to prevent re-renders
    const getClientById = useMemo(() => {
        return (id: string) => clients.find((c: Client) => c.id === id)
    }, [clients])

    const getEmployeeById = useMemo(() => {
        return (id: string) => employees.find((e: Employee) => e.id === id)
    }, [employees])

    // Memoize context value
    const value = useMemo(() => ({
        employees,
        clients,
        teams,
        isLoadingEmployees,
        isLoadingClients,
        isLoadingTeams,
        isLoading,
        mutateEmployees,
        mutateClients,
        mutateTeams,
        getClientById,
        getEmployeeById
    }), [
        employees,
        clients,
        teams,
        isLoadingEmployees,
        isLoadingClients,
        isLoadingTeams,
        isLoading,
        mutateEmployees,
        mutateClients,
        mutateTeams,
        getClientById,
        getEmployeeById
    ])

    return (
        <AdminDataContext.Provider value={value}>
            {children}
        </AdminDataContext.Provider>
    )
}

/**
 * useAdminData Hook
 *
 * Zugriff auf zentral gecachte Admin-Daten.
 *
 * @example
 * ```tsx
 * const { employees, clients, isLoading } = useAdminData()
 *
 * // Client lookup
 * const client = getClientById(clientId)
 * ```
 */
export function useAdminData() {
    const context = useContext(AdminDataContext)
    if (!context) {
        throw new Error('useAdminData must be used within AdminDataProvider')
    }
    return context
}
