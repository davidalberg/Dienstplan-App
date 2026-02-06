"use client"

import { createContext, useContext, ReactNode, useMemo, useEffect, useRef } from 'react'
import useSWR, { useSWRConfig } from 'swr'

// SWR fetcher function
const fetcher = (url: string) => fetch(url).then(res => {
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
 * Lädt alle Master-Daten (Employees, Clients, Teams) beim ersten Mount
 * und cached sie aggressiv für die gesamte Session.
 *
 * Vorteile:
 * - Reduziert API-Calls drastisch (nur 1x pro Session)
 * - Alle Admin-Seiten teilen sich dieselben gecachten Daten
 * - Schnellere Navigation zwischen Seiten
 * - Konsistente Daten über alle Komponenten hinweg
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
    // Preload Employees
    const {
        data: employeesData,
        isLoading: isLoadingEmployees,
        mutate: mutateEmployees
    } = useSWR(
        '/api/admin/employees',
        fetcher,
        preloadConfig
    )

    // Preload Clients
    const {
        data: clientsData,
        isLoading: isLoadingClients,
        mutate: mutateClients
    } = useSWR(
        '/api/clients',
        fetcher,
        preloadConfig
    )

    // Preload Teams
    const {
        data: teamsData,
        isLoading: isLoadingTeams,
        mutate: mutateTeams
    } = useSWR(
        '/api/admin/teams',
        fetcher,
        preloadConfig
    )

    // Extrahiere Daten aus Response
    const employees = employeesData?.employees || []
    const clients = clientsData?.clients || []
    const teams = teamsData?.teams || []

    // Combined loading state
    const isLoading = isLoadingEmployees || isLoadingClients || isLoadingTeams

    // ✅ INSTANT UI: Prefetch ALLE Admin-Seiten-Daten im Hintergrund
    const { mutate: globalMutate } = useSWRConfig()
    const hasPrefetched = useRef(false)

    useEffect(() => {
        // Nur einmal prefetchen, nachdem Master-Daten geladen sind
        if (isLoading || hasPrefetched.current) return
        hasPrefetched.current = true

        const currentMonth = new Date().getMonth() + 1
        const currentYear = new Date().getFullYear()

        // Alle Admin-Seiten-Daten im Hintergrund laden
        const prefetchUrls = [
            // Dashboard
            `/api/admin/dashboard`,
            // Stundennachweise-Seite
            `/api/admin/submissions?month=${currentMonth}&year=${currentYear}`,
            `/api/admin/submissions/overview?month=${currentMonth}&year=${currentYear}`,
            // Urlaub/Krank-Seite
            `/api/admin/vacations/absences?month=${currentMonth}&year=${currentYear}`,
            // Lohnliste-Seite
            `/api/admin/payroll?month=${currentMonth}&year=${currentYear}`,
            // Dienstplan-Seite
            `/api/admin/schedule?month=${currentMonth}&year=${currentYear}`,
            // Timesheets-Seite (Employee-Timesheets + Gesamtstundennachweise)
            `/api/admin/timesheets?month=${currentMonth}&year=${currentYear}`,
        ]

        // Prefetch sequentiell um DB Connection Pool nicht zu überlasten
        // Supabase Session Mode hat begrenzte Connections
        const prefetchAll = async () => {
            for (const url of prefetchUrls) {
                await globalMutate(url, fetch(url).then(res => res.ok ? res.json() : null), { revalidate: false })
                    .catch(() => null)
                await new Promise(resolve => setTimeout(resolve, 300))
            }

            // Prefetch Mitarbeiter-Details für Stundennachweise (sequentiell)
            if (clients.length > 0 && employees.length > 0) {
                for (const client of clients as Client[]) {
                    for (const emp of (client.employees || [])) {
                        const url = `/api/admin/submissions/detail?employeeId=${emp.id}&clientId=${client.id}&month=${currentMonth}&year=${currentYear}`
                        await globalMutate(url, fetch(url).then(res => res.ok ? res.json() : null), { revalidate: false })
                            .catch(() => null)
                        await new Promise(resolve => setTimeout(resolve, 200))
                    }
                }
            }

            console.log('[AdminDataProvider] Alle Seiten-Daten vorgeladen')
        }

        // Starte Prefetch nach Verzögerung (UI-Priorität + DB Connection Cooldown)
        const timer = setTimeout(prefetchAll, 2000)
        return () => clearTimeout(timer)
    }, [isLoading, globalMutate, clients, employees])

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
