"use client"

import { createContext, useContext, ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
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
 * Lädt Master-Daten (Employees, Clients, Teams) SEQUENTIELL beim ersten Mount
 * um den Supabase Connection Pool nicht zu überlasten.
 *
 * WICHTIG: Kein aggressives Prefetching! Supabase Session Mode hat
 * einen kleinen Connection Pool (pool_size). Jede Serverless-Funktion
 * belegt eine Connection - zu viele parallele Requests = Pool Overflow.
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
    // Sequentielles Laden: Erst Employees, dann Clients, dann Teams
    // Verhindert 3 parallele DB-Connections beim Start
    const [loadPhase, setLoadPhase] = useState(0) // 0=employees, 1=clients, 2=teams, 3=done

    // Phase 0: Lade Employees sofort
    const {
        data: employeesData,
        isLoading: isLoadingEmployees,
        mutate: mutateEmployees
    } = useSWR(
        '/api/admin/employees',
        fetcher,
        preloadConfig
    )

    // Phase 1: Lade Clients erst wenn Employees fertig sind
    const {
        data: clientsData,
        isLoading: isLoadingClients,
        mutate: mutateClients
    } = useSWR(
        loadPhase >= 1 ? '/api/clients' : null,
        fetcher,
        preloadConfig
    )

    // Phase 2: Lade Teams erst wenn Clients fertig sind
    const {
        data: teamsData,
        isLoading: isLoadingTeams,
        mutate: mutateTeams
    } = useSWR(
        loadPhase >= 2 ? '/api/admin/teams' : null,
        fetcher,
        preloadConfig
    )

    // Sequentieller Load: Nächste Phase starten wenn aktuelle fertig
    useEffect(() => {
        if (loadPhase === 0 && employeesData && !isLoadingEmployees) {
            setLoadPhase(1)
        }
    }, [loadPhase, employeesData, isLoadingEmployees])

    useEffect(() => {
        if (loadPhase === 1 && clientsData && !isLoadingClients) {
            setLoadPhase(2)
        }
    }, [loadPhase, clientsData, isLoadingClients])

    useEffect(() => {
        if (loadPhase === 2 && teamsData && !isLoadingTeams) {
            setLoadPhase(3)
        }
    }, [loadPhase, teamsData, isLoadingTeams])

    // Extrahiere Daten aus Response
    const employees = employeesData?.employees || []
    const clients = clientsData?.clients || []
    const teams = teamsData?.teams || []

    // Combined loading state
    const isLoading = loadPhase < 3

    // Prefetch: Nur die aktuelle Seite wird vom SWR-Hook der Seite selbst geladen.
    // Kein aggressives Background-Prefetching mehr - das hat den Connection Pool gesprengt.
    // Die Seiten laden ihre Daten on-demand über ihre eigenen SWR-Hooks.

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
