"use client"

import { createContext, useContext, ReactNode, useMemo } from 'react'
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
 * Lädt Master-Daten (Employees, Clients, Teams) PARALLEL beim ersten Mount.
 * 3 parallele Requests sind kein Problem für den Connection Pool (limit=10).
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
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
