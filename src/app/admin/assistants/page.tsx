"use client"

import { useEffect, useState, DragEvent } from "react"
import {
    Users, Edit2, Trash2, X, Save, Search,
    GripVertical, UserPlus, ChevronDown, ChevronRight
} from "lucide-react"
import { toast } from "sonner"

interface Employee {
    id: string
    email: string
    name: string | null
    employeeId: string | null
    clients: Array<{ id: string; firstName: string; lastName: string }>
}

interface Client {
    id: string
    firstName: string
    lastName: string
    displayOrder: number
    employees: Array<{ id: string; name: string | null; email: string }>
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

export default function AssistantsPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [allEmployees, setAllEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [draggedEmployee, setDraggedEmployee] = useState<{ employee: Employee; fromClientId: string | null } | null>(null)
    const [draggedClient, setDraggedClient] = useState<Client | null>(null)
    const [dropTarget, setDropTarget] = useState<string | null>(null)
    const [clientDropTarget, setClientDropTarget] = useState<string | null>(null)
    const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set(["unassigned"]))

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
        nightPremiumEnabled: true,
        nightPremiumPercent: 25,
        sundayPremiumEnabled: true,
        sundayPremiumPercent: 30,
        holidayPremiumEnabled: true,
        holidayPremiumPercent: 125
    })

    useEffect(() => {
        fetchData()
    }, [])

    // Expand all clients by default after loading
    useEffect(() => {
        if (clients.length > 0) {
            setExpandedClients(new Set(["unassigned", ...clients.map(c => c.id)]))
        }
    }, [clients.length])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [clientsRes, employeesRes] = await Promise.all([
                fetch("/api/clients?isActive=true"),
                fetch("/api/admin/employees")
            ])

            if (clientsRes.ok) {
                const data = await clientsRes.json()
                setClients(data.clients || [])
            }

            if (employeesRes.ok) {
                const data = await employeesRes.json()
                setAllEmployees(data.employees || [])
            }
        } catch (err) {
            console.error(err)
            toast.error("Fehler beim Laden")
        } finally {
            setLoading(false)
        }
    }

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
            toast.success(`${employee.name || employee.email} → ${targetName}`)
        } catch {
            // Rollback on error
            fetchData()
            toast.error("Fehler beim Verschieben")
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

            toast.success("Reihenfolge gespeichert")
        } catch {
            // Rollback on error
            fetchData()
            toast.error("Fehler beim Speichern der Reihenfolge")
        }
    }

    const handleCreateEmployee = async () => {
        if (!employeeForm.email || !employeeForm.name) {
            toast.error("Email und Name sind erforderlich")
            return
        }
        if (!employeeForm.password) {
            toast.error("Passwort ist erforderlich")
            return
        }

        try {
            const res = await fetch("/api/admin/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(employeeForm)
            })

            if (res.ok) {
                toast.success("Assistent erstellt")
                setShowCreateEmployee(false)
                resetEmployeeForm()
                fetchData()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Erstellen")
        }
    }

    const handleEditEmployee = async () => {
        if (!employeeForm.email || !employeeForm.name) {
            toast.error("Email und Name sind erforderlich")
            return
        }

        try {
            const res = await fetch("/api/admin/employees", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(employeeForm)
            })

            if (res.ok) {
                toast.success("Assistent aktualisiert")
                setShowEditEmployee(null)
                resetEmployeeForm()
                fetchData()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Speichern")
        }
    }

    const handleDeleteEmployee = async (employee: Employee) => {
        if (!confirm(`Assistent "${employee.name}" wirklich löschen?`)) return

        try {
            const res = await fetch(`/api/admin/employees?id=${employee.id}`, {
                method: "DELETE"
            })

            if (res.ok) {
                toast.success("Assistent gelöscht")
                fetchData()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Löschen")
        }
    }

    const openEditEmployee = async (employee: Employee) => {
        try {
            const res = await fetch("/api/admin/employees")
            if (res.ok) {
                const data = await res.json()
                const fullEmployee = data.employees.find((e: any) => e.id === employee.id)
                if (fullEmployee) {
                    setEmployeeForm({
                        id: fullEmployee.id,
                        email: fullEmployee.email,
                        password: "",
                        name: fullEmployee.name || "",
                        employeeId: fullEmployee.employeeId || "",
                        entryDate: fullEmployee.entryDate ? new Date(fullEmployee.entryDate).toISOString().split('T')[0] : "",
                        exitDate: fullEmployee.exitDate ? new Date(fullEmployee.exitDate).toISOString().split('T')[0] : "",
                        hourlyWage: fullEmployee.hourlyWage || 0,
                        travelCostType: fullEmployee.travelCostType || "NONE",
                        nightPremiumEnabled: fullEmployee.nightPremiumEnabled,
                        nightPremiumPercent: fullEmployee.nightPremiumPercent || 25,
                        sundayPremiumEnabled: fullEmployee.sundayPremiumEnabled,
                        sundayPremiumPercent: fullEmployee.sundayPremiumPercent || 30,
                        holidayPremiumEnabled: fullEmployee.holidayPremiumEnabled,
                        holidayPremiumPercent: fullEmployee.holidayPremiumPercent || 125
                    })
                    setShowEditEmployee(employee)
                }
            }
        } catch {
            toast.error("Fehler beim Laden")
        }
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
            nightPremiumEnabled: true,
            nightPremiumPercent: 25,
            sundayPremiumEnabled: true,
            sundayPremiumPercent: 30,
            holidayPremiumEnabled: true,
            holidayPremiumPercent: 125
        })
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

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
                <div className="text-neutral-500">Laden...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-neutral-950 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Users className="text-blue-400" size={28} />
                            Assistenten
                        </h1>
                        <p className="text-neutral-500 text-sm mt-1">
                            {totalEmployees} Assistenzkräfte - Drag & Drop zum Verschieben
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            resetEmployeeForm()
                            setShowCreateEmployee(true)
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
                    >
                        <UserPlus size={18} />
                        Neuer Assistent
                    </button>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <input
                            type="text"
                            placeholder="Assistenten suchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Client Sections (Klienten = Teams) */}
                <div className="space-y-4">
                    {/* Ohne Klient Section */}
                    <div
                        className={`bg-neutral-900 border rounded-xl overflow-hidden transition-colors ${
                            dropTarget === "unassigned" ? "border-blue-500 bg-blue-500/10" : "border-neutral-800"
                        }`}
                        onDragOver={(e) => handleDragOver(e, null)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, null)}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => toggleClientExpanded("unassigned")}
                                    className="p-1 hover:bg-neutral-800 rounded transition"
                                >
                                    {expandedClients.has("unassigned") ? (
                                        <ChevronDown size={18} className="text-neutral-400" />
                                    ) : (
                                        <ChevronRight size={18} className="text-neutral-400" />
                                    )}
                                </button>
                                <span className="font-medium text-white">Ohne Klient</span>
                                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                                    {filterEmployees(unassignedEmployees).length}
                                </span>
                            </div>
                        </div>

                        {expandedClients.has("unassigned") && (
                            <div className="p-2 min-h-[60px]">
                                {filterEmployees(unassignedEmployees).length === 0 ? (
                                    <div className="text-center py-4 text-neutral-500 text-sm">
                                        {searchQuery ? "Keine Treffer" : "Assistenten hierher ziehen"}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filterEmployees(unassignedEmployees).map((employee) => (
                                            <EmployeeCard
                                                key={employee.id}
                                                employee={employee}
                                                onDragStart={(e) => handleDragStart(e, employee, null)}
                                                onEdit={() => openEditEmployee(employee)}
                                                onDelete={() => handleDeleteEmployee(employee)}
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
                                className={`bg-neutral-900 border rounded-xl overflow-hidden transition-colors ${
                                    dropTarget === client.id
                                        ? "border-blue-500 bg-blue-500/10"
                                        : clientDropTarget === client.id
                                            ? "border-purple-500 bg-purple-500/10"
                                            : "border-neutral-800"
                                }`}
                            >
                                <div className="flex items-center justify-between p-4 border-b border-neutral-800 cursor-grab active:cursor-grabbing">
                                    <div className="flex items-center gap-3 flex-1">
                                        <GripVertical size={16} className="text-neutral-600 hover:text-neutral-400" />
                                        <button
                                            onClick={() => toggleClientExpanded(client.id)}
                                            className="p-1 hover:bg-neutral-800 rounded transition"
                                        >
                                            {expandedClients.has(client.id) ? (
                                                <ChevronDown size={18} className="text-neutral-400" />
                                            ) : (
                                                <ChevronRight size={18} className="text-neutral-400" />
                                            )}
                                        </button>

                                        <div className={`w-8 h-8 rounded-full ${getAvatarColor(client.firstName + client.lastName)} flex items-center justify-center`}>
                                            <span className="text-white text-sm font-medium">
                                                {client.firstName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>

                                        <span className="font-medium text-white">
                                            {client.firstName} {client.lastName}
                                        </span>
                                        <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                                            {clientEmployees.length}
                                        </span>
                                    </div>
                                </div>

                                {expandedClients.has(client.id) && (
                                    <div className="p-2 min-h-[60px]">
                                        {clientEmployees.length === 0 ? (
                                            <div className="text-center py-4 text-neutral-500 text-sm">
                                                {searchQuery ? "Keine Treffer" : "Assistenten hierher ziehen"}
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {clientEmployees.map((employee) => (
                                                    <EmployeeCard
                                                        key={employee.id}
                                                        employee={employee}
                                                        onDragStart={(e) => handleDragStart(e, employee, client.id)}
                                                        onEdit={() => openEditEmployee(employee)}
                                                        onDelete={() => handleDeleteEmployee(employee)}
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
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                {showEditEmployee ? "Passwort (leer = keine Änderung)" : "Passwort *"}
                                            </label>
                                            <input
                                                type="password"
                                                value={employeeForm.password}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
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
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Austrittsdatum</label>
                                            <input
                                                type="date"
                                                value={employeeForm.exitDate}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, exitDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                                        checked={(employeeForm as any)[item.enabled]}
                                                        onChange={(e) => setEmployeeForm({ ...employeeForm, [item.enabled]: e.target.checked })}
                                                        className="w-4 h-4 text-blue-600 rounded"
                                                    />
                                                    <span className="text-sm text-neutral-300">{item.label}</span>
                                                </label>
                                                {(employeeForm as any)[item.enabled] && (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={(employeeForm as any)[item.percent]}
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
                                        className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition"
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        onClick={showEditEmployee ? handleEditEmployee : handleCreateEmployee}
                                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center justify-center gap-2"
                                    >
                                        <Save size={18} />
                                        {showEditEmployee ? "Speichern" : "Erstellen"}
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
    onDragStart,
    onEdit,
    onDelete
}: {
    employee: Employee
    onDragStart: (e: DragEvent<HTMLDivElement>) => void
    onEdit: () => void
    onDelete: () => void
}) {
    return (
        <div
            draggable
            onDragStart={onDragStart}
            className="flex items-center gap-3 p-3 bg-neutral-800/50 hover:bg-neutral-800 rounded-lg cursor-grab active:cursor-grabbing group transition"
        >
            <GripVertical size={16} className="text-neutral-600 group-hover:text-neutral-400" />

            <div className={`w-9 h-9 rounded-full ${getAvatarColor(employee.name || employee.email)} flex items-center justify-center shrink-0`}>
                <span className="text-white text-sm font-medium">
                    {(employee.name || employee.email).charAt(0).toUpperCase()}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{employee.name || "Unbenannt"}</p>
                <p className="text-neutral-500 text-xs truncate">{employee.email}</p>
            </div>

            {/* Show if employee has multiple clients */}
            {employee.clients && employee.clients.length > 1 && (
                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                    +{employee.clients.length - 1} Klient{employee.clients.length > 2 ? "en" : ""}
                </span>
            )}

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onEdit()
                    }}
                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition"
                    title="Bearbeiten"
                >
                    <Edit2 size={14} />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                    className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded transition"
                    title="Löschen"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    )
}
