"use client"

import { Suspense, useEffect, useState, DragEvent } from "react"
import { useSearchParams } from "next/navigation"
import {
    Users, Edit2, Trash2, X, Save, Search,
    GripVertical, UserPlus, ChevronDown, ChevronRight, Mail, Loader2
} from "lucide-react"
import { showToast } from "@/lib/toast-utils"
import { useClients, useAdminEmployees, useTeams } from "@/hooks/use-admin-data"

interface Employee {
    id: string
    email: string
    name: string | null
    employeeId: string | null
    hourlyWage: number | null
    vacationDays: number
    sickDays: number
    entryDate: string | null
    exitDate: string | null
    travelCostType: string
    nightPremiumEnabled: boolean
    nightPremiumPercent: number
    sundayPremiumEnabled: boolean
    sundayPremiumPercent: number
    holidayPremiumEnabled: boolean
    holidayPremiumPercent: number
    clients: Array<{ id: string; firstName: string; lastName: string }>
}

interface Client {
    id: string
    firstName: string
    lastName: string
    displayOrder: number
    isActive: boolean
    employees: Array<{ id: string; name: string | null; email: string }>
}

interface Team {
    id: string
    name: string
    clientId: string | null
}

function getAvatarColor(name: string): string {
    const colors = [
        "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-red-500",
        "bg-pink-500", "bg-indigo-500", "bg-teal-500", "bg-orange-500",
        "bg-cyan-500", "bg-purple-500"
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}

// Loading Fallback for Suspense
function AssistantsLoading() {
    return (
        <div className="min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
            <div className="text-neutral-500">Laden...</div>
        </div>
    )
}

// Main Page wrapped in Suspense for useSearchParams
export default function AssistantsPage() {
    return (
        <Suspense fallback={<AssistantsLoading />}>
            <AssistantsContent />
        </Suspense>
    )
}

function AssistantsContent() {
    // URL-Parameter für direktes Öffnen des Edit-Modals
    const searchParams = useSearchParams()

    // SWR Hooks für automatisches Caching
    const { clients: swrClients, isLoading: clientsLoading, mutate: mutateClients } = useClients()
    const { employees: swrEmployees, isLoading: employeesLoading, mutate: mutateEmployees } = useAdminEmployees()
    const { teams: swrTeams, isLoading: teamsLoading } = useTeams()

    // Lokaler State für optimistische Updates
    const [clients, setClients] = useState<Client[]>([])
    const [allEmployees, setAllEmployees] = useState<Employee[]>([])

    // Loading State abgeleitet von SWR
    const loading = clientsLoading || employeesLoading || teamsLoading
    const [searchQuery, setSearchQuery] = useState("")
    const [draggedEmployee, setDraggedEmployee] = useState<{ employee: Employee; fromClientId: string | null } | null>(null)
    const [draggedClient, setDraggedClient] = useState<Client | null>(null)
    const [dropTarget, setDropTarget] = useState<string | null>(null)
    const [clientDropTarget, setClientDropTarget] = useState<string | null>(null)
    const [expandedClients, setExpandedClients] = useState<Set<string>>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('admin-expanded-assistants')
                if (saved) return new Set(JSON.parse(saved))
            } catch { /* ignore */ }
        }
        return new Set()
    })

    useEffect(() => {
        try {
            localStorage.setItem('admin-expanded-assistants', JSON.stringify([...expandedClients]))
        } catch { /* ignore */ }
    }, [expandedClients])

    const [highlightedEmployees, setHighlightedEmployees] = useState<Set<string>>(new Set())

    // Modal states
    const [showCreateEmployee, setShowCreateEmployee] = useState(false)
    const [showEditEmployee, setShowEditEmployee] = useState<Employee | null>(null)

    // Employee form
    const [employeeForm, setEmployeeForm] = useState({
        id: "",
        email: "",
        password: "",
        name: "",
        employeeId: "",
        entryDate: "",
        exitDate: "",
        hourlyWage: 0,
        travelCostType: "NONE",
        teamId: "",
        nightPremiumEnabled: true,
        nightPremiumPercent: 25,
        sundayPremiumEnabled: true,
        sundayPremiumPercent: 30,
        holidayPremiumEnabled: true,
        holidayPremiumPercent: 125
    })
    const [sendInvitation, setSendInvitation] = useState(true)
    const [invitingEmployeeId, setInvitingEmployeeId] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)


    // Sync SWR data to local state
    useEffect(() => {
        if (swrClients) {
            // Filter nur aktive Klienten
            setClients(swrClients.filter((c: Client) => c.isActive))
        }
    }, [swrClients])

    useEffect(() => {
        if (swrEmployees) {
            setAllEmployees(swrEmployees)
        }
    }, [swrEmployees])

    // All client tabs start collapsed (no auto-expand)

    // Auto-open edit modal if employeeId in URL params
    useEffect(() => {
        const employeeId = searchParams.get("employeeId")
        if (employeeId && allEmployees.length > 0 && !showEditEmployee) {
            const employee = allEmployees.find(e => e.id === employeeId)
            if (employee) {
                openEditEmployee(employee)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, allEmployees])

    // Active search with highlight and auto-expand
    useEffect(() => {
        if (!searchQuery.trim()) {
            setHighlightedEmployees(new Set())
            return
        }

        const query = searchQuery.toLowerCase()
        const matchingEmployees = new Set<string>()
        const clientsToExpand = new Set<string>(["unassigned"])

        allEmployees.forEach(emp => {
            const matches =
                emp.name?.toLowerCase().includes(query) ||
                emp.email?.toLowerCase().includes(query)

            if (matches) {
                matchingEmployees.add(emp.id)

                // Expand clients that contain this employee
                if (emp.clients && emp.clients.length > 0) {
                    emp.clients.forEach(c => clientsToExpand.add(c.id))
                } else {
                    clientsToExpand.add("unassigned")
                }
            }
        })

        setHighlightedEmployees(matchingEmployees)
        setExpandedClients(clientsToExpand)
    }, [searchQuery, allEmployees])

    // Get unassigned employees (those not assigned to any client)
    const unassignedEmployees = allEmployees.filter(e => !e.clients || e.clients.length === 0)

    // Get employees for a specific client
    const getEmployeesForClient = (clientId: string) => {
        return allEmployees.filter(e => e.clients?.some(c => c.id === clientId))
    }

    // Drag & Drop handlers for employees
    const handleDragStart = (e: DragEvent, employee: Employee, fromClientId: string | null) => {
        setDraggedEmployee({ employee, fromClientId })
        setDraggedClient(null)
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", employee.id)
    }

    const handleDragOver = (e: DragEvent, clientId: string | null) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        if (draggedEmployee) {
            setDropTarget(clientId)
        }
    }

    const handleDragLeave = () => {
        setDropTarget(null)
    }

    const handleDrop = async (e: DragEvent, toClientId: string | null) => {
        e.preventDefault()
        setDropTarget(null)

        if (!draggedEmployee) return
        if (draggedEmployee.fromClientId === toClientId) {
            setDraggedEmployee(null)
            return
        }

        const { employee, fromClientId } = draggedEmployee
        setDraggedEmployee(null)

        // Optimistic update
        setAllEmployees(prev => prev.map(emp => {
            if (emp.id !== employee.id) return emp

            let newClients = [...(emp.clients || [])]

            // Remove from old client
            if (fromClientId) {
                newClients = newClients.filter(c => c.id !== fromClientId)
            }

            // Add to new client
            if (toClientId) {
                const targetClient = clients.find(c => c.id === toClientId)
                if (targetClient && !newClients.some(c => c.id === toClientId)) {
                    newClients.push({
                        id: targetClient.id,
                        firstName: targetClient.firstName,
                        lastName: targetClient.lastName
                    })
                }
            }

            return { ...emp, clients: newClients }
        }))

        // API call
        try {
            const res = await fetch("/api/admin/employee-assignment", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: employee.id,
                    fromClientId,
                    toClientId
                })
            })

            if (!res.ok) {
                throw new Error("Failed to assign")
            }

            const targetName = toClientId
                ? clients.find(c => c.id === toClientId)?.firstName + " " + clients.find(c => c.id === toClientId)?.lastName
                : "Ohne Klient"
            showToast("success", `${employee.name || employee.email} → ${targetName}`)
        } catch {
            // Rollback on error
            mutateEmployees()
            showToast("error", "Fehler beim Verschieben")
        }
    }

    // Drag & Drop handlers for clients (reordering)
    const handleClientDragStart = (e: DragEvent, client: Client) => {
        setDraggedClient(client)
        setDraggedEmployee(null)
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", client.id)
    }

    const handleClientDragOver = (e: DragEvent, clientId: string) => {
        e.preventDefault()
        if (draggedClient && draggedClient.id !== clientId) {
            setClientDropTarget(clientId)
        }
    }

    const handleClientDragLeave = () => {
        setClientDropTarget(null)
    }

    const handleClientDrop = async (e: DragEvent, targetClientId: string) => {
        e.preventDefault()
        setClientDropTarget(null)

        if (!draggedClient || draggedClient.id === targetClientId) {
            setDraggedClient(null)
            return
        }

        const draggedId = draggedClient.id
        setDraggedClient(null)

        // Find indices
        const currentIndex = clients.findIndex(c => c.id === draggedId)
        const targetIndex = clients.findIndex(c => c.id === targetClientId)

        if (currentIndex === -1 || targetIndex === -1) return

        // Optimistic reorder
        const newClients = [...clients]
        const [removed] = newClients.splice(currentIndex, 1)
        newClients.splice(targetIndex, 0, removed)
        setClients(newClients)

        // API call to save new order
        try {
            const res = await fetch("/api/clients/reorder", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientIds: newClients.map(c => c.id)
                })
            })

            if (!res.ok) {
                throw new Error("Failed to reorder")
            }

            showToast("success", "Reihenfolge gespeichert")
        } catch {
            // Rollback on error
            mutateClients()
            showToast("error", "Fehler beim Speichern der Reihenfolge")
        }
    }

    const handleCreateEmployee = async () => {
        if (!employeeForm.email || !employeeForm.name) {
            showToast("error", "Email und Name sind erforderlich")
            return
        }
        if (!sendInvitation && !employeeForm.password) {
            showToast("error", "Passwort ist erforderlich (oder Einladung per E-Mail senden)")
            return
        }

        setIsSaving(true)
        try {
            const formData = { ...employeeForm }
            if (sendInvitation) {
                // Don't send password when inviting via email
                formData.password = ""
            }

            const res = await fetch("/api/admin/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                const data = await res.json()

                if (sendInvitation && data.employee?.id) {
                    // Send invitation email
                    try {
                        const inviteRes = await fetch("/api/admin/employees/invite", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ employeeId: data.employee.id })
                        })
                        if (inviteRes.ok) {
                            showToast("success", "Assistent erstellt & Einladung gesendet")
                        } else {
                            showToast("success", "Assistent erstellt (Einladung konnte nicht gesendet werden)")
                        }
                    } catch {
                        showToast("success", "Assistent erstellt (Einladung konnte nicht gesendet werden)")
                    }
                } else {
                    showToast("success", "Assistent erstellt")
                }

                setShowCreateEmployee(false)
                resetEmployeeForm()
                mutateEmployees()
            } else {
                const err = await res.json()
                showToast("error", err.error)
            }
        } catch {
            showToast("error", "Fehler beim Erstellen")
        } finally {
            setIsSaving(false)
        }
    }

    const handleSendInvitation = async (employeeId: string) => {
        setInvitingEmployeeId(employeeId)
        try {
            const res = await fetch("/api/admin/employees/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId })
            })

            if (res.ok) {
                showToast("success", "Einladung gesendet")
            } else {
                const err = await res.json()
                showToast("error", err.error || "Fehler beim Senden")
            }
        } catch {
            showToast("error", "Fehler beim Senden der Einladung")
        }
        setInvitingEmployeeId(null)
    }

    const handleEditEmployee = async () => {
        if (!employeeForm.email || !employeeForm.name) {
            showToast("error", "Email und Name sind erforderlich")
            return
        }

        // Track if email changed
        const originalEmail = showEditEmployee?.email
        const emailChanged = originalEmail && originalEmail !== employeeForm.email

        setIsSaving(true)
        try {
            const res = await fetch("/api/admin/employees", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(employeeForm)
            })

            if (res.ok) {
                if (emailChanged) {
                    showToast("success", "E-Mail geändert. Sende neue Einladung...")
                    // Automatically send invitation to new email
                    try {
                        const inviteRes = await fetch("/api/admin/employees/invite", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ employeeId: employeeForm.id })
                        })
                        if (inviteRes.ok) {
                            showToast("success", "Einladung an neue E-Mail gesendet")
                        } else {
                            showToast("error", "Einladung konnte nicht gesendet werden")
                        }
                    } catch {
                        showToast("error", "Einladung konnte nicht gesendet werden")
                    }
                } else {
                    showToast("success", "Assistent aktualisiert")
                }
                setShowEditEmployee(null)
                resetEmployeeForm()
                mutateEmployees()
            } else {
                const err = await res.json()
                showToast("error", err.error)
            }
        } catch {
            showToast("error", "Fehler beim Speichern")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteEmployee = async (employee: Employee, force = false) => {
        if (!force && !confirm(`Assistent "${employee.name}" wirklich löschen?`)) return

        try {
            const url = force
                ? `/api/admin/employees?id=${employee.id}&force=true`
                : `/api/admin/employees?id=${employee.id}`
            const res = await fetch(url, { method: "DELETE" })

            if (res.ok) {
                showToast("success", "Assistent gelöscht")
                mutateEmployees()
            } else {
                const err = await res.json()
                if (err.needsConfirmation) {
                    if (confirm(`${err.error}`)) {
                        await handleDeleteEmployee(employee, true)
                    }
                } else {
                    showToast("error", err.error)
                }
            }
        } catch {
            showToast("error", "Fehler beim Löschen")
        }
    }

    const openEditEmployee = (employee: Employee) => {
        // Daten aus lokalem State holen (bereits von SWR geladen)
        const fullEmployee = allEmployees.find(e => e.id === employee.id)

        if (!fullEmployee) {
            showToast("error", "Mitarbeiter nicht gefunden")
            return
        }

        setEmployeeForm({
            id: fullEmployee.id,
            email: fullEmployee.email,
            password: "",
            name: fullEmployee.name || "",
            employeeId: fullEmployee.employeeId || "",
            entryDate: fullEmployee.entryDate
                ? new Date(fullEmployee.entryDate).toISOString().split('T')[0]
                : "",
            exitDate: fullEmployee.exitDate
                ? new Date(fullEmployee.exitDate).toISOString().split('T')[0]
                : "",
            hourlyWage: fullEmployee.hourlyWage || 0,
            travelCostType: fullEmployee.travelCostType || "NONE",
            teamId: "",
            nightPremiumEnabled: fullEmployee.nightPremiumEnabled,
            nightPremiumPercent: fullEmployee.nightPremiumPercent || 25,
            sundayPremiumEnabled: fullEmployee.sundayPremiumEnabled,
            sundayPremiumPercent: fullEmployee.sundayPremiumPercent || 30,
            holidayPremiumEnabled: fullEmployee.holidayPremiumEnabled,
            holidayPremiumPercent: fullEmployee.holidayPremiumPercent || 125
        })
        setShowEditEmployee(employee)
    }

    const resetEmployeeForm = () => {
        setEmployeeForm({
            id: "",
            email: "",
            password: "",
            name: "",
            employeeId: "",
            entryDate: "",
            exitDate: "",
            hourlyWage: 0,
            travelCostType: "NONE",
            teamId: "",
            nightPremiumEnabled: true,
            nightPremiumPercent: 25,
            sundayPremiumEnabled: true,
            sundayPremiumPercent: 30,
            holidayPremiumEnabled: true,
            holidayPremiumPercent: 125
        })
        setSendInvitation(true)
    }

    const toggleClientExpanded = (clientId: string) => {
        setExpandedClients(prev => {
            const next = new Set(prev)
            if (next.has(clientId)) {
                next.delete(clientId)
            } else {
                next.add(clientId)
            }
            return next
        })
    }

    // Filter employees based on search
    const filterEmployees = (employees: Employee[]) => {
        if (!searchQuery) return employees
        const query = searchQuery.toLowerCase()
        return employees.filter(e =>
            e.name?.toLowerCase().includes(query) ||
            e.email?.toLowerCase().includes(query)
        )
    }

    const totalEmployees = allEmployees.length

    if (loading && allEmployees.length === 0) {
        return (
            <div className="min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-neutral-500">Laden...</div>
            </div>
        )
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h1 className="text-xl font-bold text-white flex items-center gap-2">
                            <Users className="text-blue-400" size={22} />
                            Assistenten
                        </h1>
                        <p className="text-neutral-500 text-xs mt-0.5 leading-tight">
                            {totalEmployees} Assistenzkräfte - Drag & Drop zum Verschieben
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            resetEmployeeForm()
                            setShowCreateEmployee(true)
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition flex items-center gap-1.5"
                    >
                        <UserPlus size={16} />
                        Neuer Assistent
                    </button>
                </div>

                {/* Search */}
                <div className="mb-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                        <input
                            type="text"
                            placeholder="Assistenten suchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-sm bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                </div>

                {/* Client Sections (Klienten = Teams) */}
                <div className="space-y-3">
                    {/* Ohne Klient Section */}
                    <div
                        className={`bg-neutral-900 border rounded-xl overflow-hidden transition-all duration-200 ${
                            dropTarget === "unassigned" ? "border-violet-500 bg-violet-500/5 shadow-lg shadow-violet-500/20" : "border-neutral-800"
                        }`}
                        onDragOver={(e) => handleDragOver(e, null)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, null)}
                    >
                        {/* Klient Header */}
                        <button
                            onClick={() => toggleClientExpanded("unassigned")}
                            className="w-full flex items-center gap-2 p-2.5 hover:bg-neutral-800/50 transition-colors duration-150 group"
                        >
                            <div className="flex items-center gap-2 flex-1">
                                {/* Chevron Icon */}
                                <div className="text-neutral-400 group-hover:text-neutral-300 transition-colors">
                                    {expandedClients.has("unassigned") ? (
                                        <ChevronDown size={16} strokeWidth={2} />
                                    ) : (
                                        <ChevronRight size={16} strokeWidth={2} />
                                    )}
                                </div>

                                {/* Klient Name */}
                                <h3 className="text-base font-semibold text-white">
                                    Ohne Klient
                                </h3>

                                {/* Badge mit Anzahl */}
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-800 rounded-full">
                                    <Users size={12} className="text-neutral-400" />
                                    <span className="text-xs font-medium text-neutral-300">
                                        {filterEmployees(unassignedEmployees).length}
                                    </span>
                                </div>
                            </div>
                        </button>

                        {/* Mitarbeiter-Liste */}
                        {expandedClients.has("unassigned") && (
                            <div className="border-t border-neutral-800">
                                {filterEmployees(unassignedEmployees).length === 0 ? (
                                    <div className="text-center py-4 px-3">
                                        <p className="text-neutral-500 text-xs">
                                            {searchQuery ? "Keine Treffer" : "Assistenten hierher ziehen"}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="p-2 space-y-1.5">
                                        {filterEmployees(unassignedEmployees).map((employee) => (
                                            <EmployeeCard
                                                key={employee.id}
                                                employee={employee}
                                                onEdit={() => openEditEmployee(employee)}
                                                onDelete={() => handleDeleteEmployee(employee)}
                                                onInvite={() => handleSendInvitation(employee.id)}
                                                isHighlighted={highlightedEmployees.has(employee.id)}
                                                isInviting={invitingEmployeeId === employee.id}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Client Sections (Klienten als Teams) */}
                    {clients.map((client) => {
                        const clientEmployees = filterEmployees(getEmployeesForClient(client.id))
                        return (
                            <div
                                key={client.id}
                                className={`bg-neutral-900 border rounded-xl overflow-hidden transition-all duration-200 ${
                                    dropTarget === client.id
                                        ? "border-violet-500 bg-violet-500/5 shadow-lg shadow-violet-500/20"
                                        : clientDropTarget === client.id
                                            ? "border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/20"
                                            : "border-neutral-800"
                                }`}
                                draggable
                                onDragStart={(e) => handleClientDragStart(e, client)}
                                onDragOver={(e) => {
                                    handleDragOver(e, client.id)
                                    handleClientDragOver(e, client.id)
                                }}
                                onDragLeave={() => {
                                    handleDragLeave()
                                    handleClientDragLeave()
                                }}
                                onDrop={(e) => {
                                    if (draggedClient) {
                                        handleClientDrop(e, client.id)
                                    } else {
                                        handleDrop(e, client.id)
                                    }
                                }}
                            >
                                {/* Klient Header */}
                                <div className="flex items-center gap-2 p-2.5 group">
                                    {/* Drag Handle - only for dragging */}
                                    <div
                                        className="text-neutral-600 group-hover:text-neutral-400 transition-colors cursor-grab active:cursor-grabbing"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <GripVertical size={16} strokeWidth={2} />
                                    </div>

                                    {/* Clickable area - entire header except drag handle */}
                                    <div
                                        onClick={() => toggleClientExpanded(client.id)}
                                        className="flex items-center gap-2 flex-1 cursor-pointer hover:bg-neutral-800/50 transition-colors duration-150 rounded-lg px-2 py-1 -ml-1"
                                    >
                                        {/* Chevron Icon */}
                                        <div className="text-neutral-400">
                                            {expandedClients.has(client.id) ? (
                                                <ChevronDown size={16} strokeWidth={2} />
                                            ) : (
                                                <ChevronRight size={16} strokeWidth={2} />
                                            )}
                                        </div>

                                        {/* Avatar */}
                                        <div className={`w-7 h-7 rounded-full ${getAvatarColor(client.firstName + client.lastName)} flex items-center justify-center shrink-0`}>
                                            <span className="text-white text-sm font-semibold">
                                                {client.firstName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>

                                        {/* Klient Name */}
                                        <h3 className="text-base font-semibold text-white flex-1">
                                            {client.firstName} {client.lastName}
                                        </h3>

                                        {/* Badge mit Anzahl */}
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-800 rounded-full">
                                            <Users size={12} className="text-neutral-400" />
                                            <span className="text-xs font-medium text-neutral-300">
                                                {clientEmployees.length}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Mitarbeiter-Liste */}
                                {expandedClients.has(client.id) && (
                                    <div className="border-t border-neutral-800">
                                        {clientEmployees.length === 0 ? (
                                            <div className="text-center py-4 px-3">
                                                <p className="text-neutral-500 text-xs">
                                                    {searchQuery ? "Keine Treffer" : "Assistenten hierher ziehen"}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="p-2 space-y-1.5">
                                                {clientEmployees.map((employee) => (
                                                    <EmployeeCard
                                                        key={employee.id}
                                                        employee={employee}
                                                        onEdit={() => openEditEmployee(employee)}
                                                        onDelete={() => handleDeleteEmployee(employee)}
                                                        onInvite={() => handleSendInvitation(employee.id)}
                                                        isHighlighted={highlightedEmployees.has(employee.id)}
                                                        isInviting={invitingEmployeeId === employee.id}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {clients.length === 0 && (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
                            <p className="text-neutral-500">Keine aktiven Klienten vorhanden.</p>
                            <p className="text-neutral-600 text-sm mt-1">
                                Erstelle zuerst Klienten unter &quot;Klienten&quot;.
                            </p>
                        </div>
                    )}
                </div>

                {/* Create/Edit Employee Modal */}
                {(showCreateEmployee || showEditEmployee) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60" onClick={() => {
                            setShowCreateEmployee(false)
                            setShowEditEmployee(null)
                        }} />
                        <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">
                                    {showEditEmployee ? "Assistent bearbeiten" : "Assistent erstellen"}
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowCreateEmployee(false)
                                        setShowEditEmployee(null)
                                    }}
                                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Basis-Informationen */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Basis-Informationen</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Name *</label>
                                            <input
                                                type="text"
                                                value={employeeForm.name}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Email *</label>
                                            <input
                                                type="email"
                                                value={employeeForm.email}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Mitarbeiter-ID</label>
                                            <input
                                                type="text"
                                                value={employeeForm.employeeId}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, employeeId: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            {!showEditEmployee && (
                                                <div className="mb-2">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={sendInvitation}
                                                            onChange={(e) => setSendInvitation(e.target.checked)}
                                                            className="w-4 h-4 text-blue-600 rounded"
                                                        />
                                                        <span className="text-sm text-neutral-300">Einladung per E-Mail senden</span>
                                                    </label>
                                                </div>
                                            )}
                                            {(showEditEmployee || !sendInvitation) && (
                                                <>
                                                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                        {showEditEmployee ? "Passwort (leer = keine Änderung)" : "Passwort *"}
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={employeeForm.password}
                                                        onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </>
                                            )}
                                            {!showEditEmployee && sendInvitation && (
                                                <p className="text-xs text-blue-400 mt-1">
                                                    Der Mitarbeiter erhält eine E-Mail und kann sein eigenes Passwort erstellen.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Beschäftigungsdaten */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Beschäftigungsdaten</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Eintrittsdatum</label>
                                            <input
                                                type="date"
                                                value={employeeForm.entryDate}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, entryDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Austrittsdatum</label>
                                            <input
                                                type="date"
                                                value={employeeForm.exitDate}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, exitDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Stundenlohn (EUR)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={employeeForm.hourlyWage}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, hourlyWage: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Team-Zuweisung */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Team-Zuweisung</h3>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-1">Team</label>
                                        <select
                                            value={employeeForm.teamId}
                                            onChange={(e) => setEmployeeForm({ ...employeeForm, teamId: e.target.value })}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Kein Team</option>
                                            {(swrTeams || []).map((team: Team) => (
                                                <option key={team.id} value={team.id}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Fahrtkosten */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Fahrtkosten</h3>
                                    <div className="flex gap-4">
                                        {[
                                            { value: "NONE", label: "Keine" },
                                            { value: "DEUTSCHLANDTICKET", label: "Deutschlandticket" },
                                            { value: "AUTO", label: "Auto" }
                                        ].map((opt) => (
                                            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="travelCostType"
                                                    value={opt.value}
                                                    checked={employeeForm.travelCostType === opt.value}
                                                    onChange={(e) => setEmployeeForm({ ...employeeForm, travelCostType: e.target.value })}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                <span className="text-sm text-neutral-300">{opt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Zuschläge */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Zuschläge</h3>
                                    <div className="space-y-3">
                                        {[
                                            { key: "night", label: "Nachtzuschlag", enabled: "nightPremiumEnabled", percent: "nightPremiumPercent" },
                                            { key: "sunday", label: "Sonntagszuschlag", enabled: "sundayPremiumEnabled", percent: "sundayPremiumPercent" },
                                            { key: "holiday", label: "Feiertagszuschlag", enabled: "holidayPremiumEnabled", percent: "holidayPremiumPercent" }
                                        ].map((item) => (
                                            <div key={item.key} className="flex items-center gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer min-w-[180px]">
                                                    <input
                                                        type="checkbox"
                                                        checked={(employeeForm as Record<string, boolean | number | string>)[item.enabled] as boolean}
                                                        onChange={(e) => setEmployeeForm({ ...employeeForm, [item.enabled]: e.target.checked })}
                                                        className="w-4 h-4 text-blue-600 rounded"
                                                    />
                                                    <span className="text-sm text-neutral-300">{item.label}</span>
                                                </label>
                                                {(employeeForm as Record<string, boolean | number | string>)[item.enabled] && (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={(employeeForm as Record<string, boolean | number | string>)[item.percent] as number}
                                                            onChange={(e) => setEmployeeForm({ ...employeeForm, [item.percent]: parseFloat(e.target.value) || 0 })}
                                                            className="w-20 px-3 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm text-neutral-500">%</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3 pt-4 border-t border-neutral-800">
                                    <button
                                        onClick={() => {
                                            setShowCreateEmployee(false)
                                            setShowEditEmployee(null)
                                        }}
                                        disabled={isSaving}
                                        className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        onClick={showEditEmployee ? handleEditEmployee : handleCreateEmployee}
                                        disabled={isSaving}
                                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Speichert...
                                            </>
                                        ) : (
                                            <>
                                                <Save size={18} />
                                                {showEditEmployee ? "Speichern" : "Erstellen"}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// Employee Card Component
function EmployeeCard({
    employee,
    onEdit,
    onDelete,
    onInvite,
    isHighlighted = false,
    isInviting = false
}: {
    employee: Employee
    onEdit: () => void
    onDelete: () => void
    onInvite: () => void
    isHighlighted?: boolean
    isInviting?: boolean
}) {
    return (
        <div
            className={`flex items-center gap-2 p-2 rounded-lg group transition-all duration-200 ${
                isHighlighted
                    ? "bg-violet-500/10 border-2 border-violet-500 shadow-lg shadow-violet-500/50"
                    : "bg-neutral-800/30 hover:bg-neutral-800/60 border border-transparent hover:border-neutral-700"
            }`}
        >
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full ${getAvatarColor(employee.name || employee.email)} flex items-center justify-center shrink-0 shadow-sm`}>
                <span className="text-white text-xs font-semibold">
                    {(employee.name || employee.email).charAt(0).toUpperCase()}
                </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-1.5 lg:gap-3 items-center">
                {/* Name & Email */}
                <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate leading-tight">
                        {employee.name || "Unbenannt"}
                    </p>
                    <p className="text-neutral-400 text-xs truncate mt-0.5 leading-tight">
                        {employee.email}
                    </p>
                </div>

                {/* Hourly Wage */}
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">Stundenlohn</span>
                    <span className="text-xs font-semibold text-white leading-tight">
                        {employee.hourlyWage ? `${employee.hourlyWage.toFixed(2)} €` : "-"}
                    </span>
                </div>

                {/* Vacation Days */}
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">Urlaubstage</span>
                    <span className="text-xs font-semibold text-white leading-tight">
                        {employee.vacationDays || 0}
                    </span>
                </div>

                {/* Sick Days */}
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">Kranktage</span>
                    <span className="text-xs font-semibold text-white leading-tight">
                        {employee.sickDays || 0}
                    </span>
                </div>
            </div>

            {/* Multiple Clients Badge */}
            {employee.clients && employee.clients.length > 1 && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-md shrink-0">
                    <span className="text-[10px] font-medium text-violet-400">
                        +{employee.clients.length - 1} Klient{employee.clients.length > 2 ? "en" : ""}
                    </span>
                </div>
            )}

            {/* Action Buttons - Hover to reveal */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onInvite()
                    }}
                    disabled={isInviting}
                    className="p-1.5 text-neutral-400 hover:text-blue-400 hover:bg-neutral-700 rounded-md transition-colors disabled:opacity-50"
                    title="Einladung senden"
                    aria-label="Einladung per E-Mail senden"
                >
                    {isInviting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} strokeWidth={2} />}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onEdit()
                    }}
                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-colors"
                    title="Bearbeiten"
                    aria-label="Assistent bearbeiten"
                >
                    <Edit2 size={14} strokeWidth={2} />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                    className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded-md transition-colors"
                    title="Löschen"
                    aria-label="Assistent löschen"
                >
                    <Trash2 size={14} strokeWidth={2} />
                </button>
            </div>
        </div>
    )
}
