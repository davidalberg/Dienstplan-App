"use client"

import { useEffect, useState, DragEvent } from "react"
import {
    Users, Edit2, Trash2, X, Save, Search,
    GripVertical, UserPlus, FolderPlus, Check, ChevronDown, ChevronRight
} from "lucide-react"
import { toast } from "sonner"

interface Employee {
    id: string
    email: string
    name: string
    employeeId: string | null
}

interface Team {
    id: string
    name: string
    clientId: string | null
    client: { id: string; firstName: string; lastName: string } | null
    members: Employee[]
}

interface Client {
    id: string
    firstName: string
    lastName: string
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
    const [teams, setTeams] = useState<Team[]>([])
    const [unassignedEmployees, setUnassignedEmployees] = useState<Employee[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [draggedEmployee, setDraggedEmployee] = useState<{ employee: Employee; fromTeamId: string | null } | null>(null)
    const [dropTarget, setDropTarget] = useState<string | null>(null)
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set(["unassigned"]))

    // Modal states
    const [showCreateTeam, setShowCreateTeam] = useState(false)
    const [showCreateEmployee, setShowCreateEmployee] = useState(false)
    const [showEditEmployee, setShowEditEmployee] = useState<Employee | null>(null)
    const [newTeamName, setNewTeamName] = useState("")
    const [newTeamClientId, setNewTeamClientId] = useState("")
    const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
    const [editingTeamName, setEditingTeamName] = useState("")

    // Employee form
    const [employeeForm, setEmployeeForm] = useState({
        id: "",
        email: "",
        password: "",
        name: "",
        employeeId: "",
        team: "",
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

    // Expand all teams by default after loading
    useEffect(() => {
        if (teams.length > 0) {
            setExpandedTeams(new Set(["unassigned", ...teams.map(t => t.id)]))
        }
    }, [teams.length])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [teamsRes, clientsRes] = await Promise.all([
                fetch("/api/admin/teams"),
                fetch("/api/clients")
            ])

            if (teamsRes.ok) {
                const data = await teamsRes.json()
                setTeams(data.teams || [])
                setUnassignedEmployees(data.unassignedEmployees || [])
            }

            if (clientsRes.ok) {
                const data = await clientsRes.json()
                setClients(data.clients || [])
            }
        } catch (err) {
            console.error(err)
            toast.error("Fehler beim Laden")
        } finally {
            setLoading(false)
        }
    }

    // Drag & Drop handlers
    const handleDragStart = (e: DragEvent, employee: Employee, fromTeamId: string | null) => {
        setDraggedEmployee({ employee, fromTeamId })
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", employee.id)
    }

    const handleDragOver = (e: DragEvent, teamId: string | null) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setDropTarget(teamId)
    }

    const handleDragLeave = () => {
        setDropTarget(null)
    }

    const handleDrop = async (e: DragEvent, toTeamId: string | null) => {
        e.preventDefault()
        setDropTarget(null)

        if (!draggedEmployee) return
        if (draggedEmployee.fromTeamId === toTeamId) {
            setDraggedEmployee(null)
            return
        }

        const { employee, fromTeamId } = draggedEmployee
        setDraggedEmployee(null)

        // Optimistic update
        if (fromTeamId) {
            setTeams(prev => prev.map(t =>
                t.id === fromTeamId
                    ? { ...t, members: t.members.filter(m => m.id !== employee.id) }
                    : t
            ))
        } else {
            setUnassignedEmployees(prev => prev.filter(e => e.id !== employee.id))
        }

        if (toTeamId) {
            setTeams(prev => prev.map(t =>
                t.id === toTeamId
                    ? { ...t, members: [...t.members, employee] }
                    : t
            ))
        } else {
            setUnassignedEmployees(prev => [...prev, employee])
        }

        // API call
        try {
            const res = await fetch("/api/admin/teams", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "assignEmployee",
                    employeeId: employee.id,
                    teamId: toTeamId
                })
            })

            if (!res.ok) {
                throw new Error("Failed to assign")
            }

            toast.success(`${employee.name} wurde verschoben`)
        } catch {
            // Rollback on error
            fetchData()
            toast.error("Fehler beim Verschieben")
        }
    }

    const handleCreateTeam = async () => {
        if (!newTeamName.trim()) {
            toast.error("Teamname erforderlich")
            return
        }

        try {
            const res = await fetch("/api/admin/teams", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newTeamName,
                    clientId: newTeamClientId || null
                })
            })

            if (res.ok) {
                toast.success("Team erstellt")
                setShowCreateTeam(false)
                setNewTeamName("")
                setNewTeamClientId("")
                fetchData()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Erstellen")
        }
    }

    const handleDeleteTeam = async (team: Team) => {
        const hasMembers = team.members.length > 0
        const message = hasMembers
            ? `Team "${team.name}" hat ${team.members.length} Mitarbeiter. Diese werden in "Ohne Team" verschoben. Fortfahren?`
            : `Team "${team.name}" wirklich löschen?`

        if (!confirm(message)) return

        try {
            const res = await fetch(`/api/admin/teams?id=${team.id}&force=true`, {
                method: "DELETE"
            })

            if (res.ok) {
                toast.success("Team gelöscht")
                fetchData()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Löschen")
        }
    }

    const handleRenameTeam = async (teamId: string) => {
        if (!editingTeamName.trim()) {
            setEditingTeamId(null)
            return
        }

        try {
            const res = await fetch("/api/admin/teams", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId,
                    name: editingTeamName
                })
            })

            if (res.ok) {
                toast.success("Team umbenannt")
                setEditingTeamId(null)
                fetchData()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Umbenennen")
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
                        team: fullEmployee.team?.name || "",
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
            team: "",
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

    const toggleTeamExpanded = (teamId: string) => {
        setExpandedTeams(prev => {
            const next = new Set(prev)
            if (next.has(teamId)) {
                next.delete(teamId)
            } else {
                next.add(teamId)
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

    const totalEmployees = teams.reduce((acc, t) => acc + t.members.length, 0) + unassignedEmployees.length

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
                            {totalEmployees} Mitarbeiter in {teams.length} Teams - Drag & Drop zum Verschieben
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowCreateTeam(true)}
                            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition flex items-center gap-2"
                        >
                            <FolderPlus size={18} />
                            Neues Team
                        </button>
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

                {/* Teams */}
                <div className="space-y-4">
                    {/* Ohne Team Section */}
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
                                    onClick={() => toggleTeamExpanded("unassigned")}
                                    className="p-1 hover:bg-neutral-800 rounded transition"
                                >
                                    {expandedTeams.has("unassigned") ? (
                                        <ChevronDown size={18} className="text-neutral-400" />
                                    ) : (
                                        <ChevronRight size={18} className="text-neutral-400" />
                                    )}
                                </button>
                                <span className="font-medium text-white">Ohne Team</span>
                                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                                    {filterEmployees(unassignedEmployees).length}
                                </span>
                            </div>
                        </div>

                        {expandedTeams.has("unassigned") && (
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

                    {/* Team Sections */}
                    {teams.map((team) => (
                        <div
                            key={team.id}
                            className={`bg-neutral-900 border rounded-xl overflow-hidden transition-colors ${
                                dropTarget === team.id ? "border-blue-500 bg-blue-500/10" : "border-neutral-800"
                            }`}
                            onDragOver={(e) => handleDragOver(e, team.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, team.id)}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                                <div className="flex items-center gap-3 flex-1">
                                    <button
                                        onClick={() => toggleTeamExpanded(team.id)}
                                        className="p-1 hover:bg-neutral-800 rounded transition"
                                    >
                                        {expandedTeams.has(team.id) ? (
                                            <ChevronDown size={18} className="text-neutral-400" />
                                        ) : (
                                            <ChevronRight size={18} className="text-neutral-400" />
                                        )}
                                    </button>

                                    {editingTeamId === team.id ? (
                                        <div className="flex items-center gap-2 flex-1">
                                            <input
                                                type="text"
                                                value={editingTeamName}
                                                onChange={(e) => setEditingTeamName(e.target.value)}
                                                className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-sm"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleRenameTeam(team.id)
                                                    if (e.key === "Escape") setEditingTeamId(null)
                                                }}
                                            />
                                            <button
                                                onClick={() => handleRenameTeam(team.id)}
                                                className="p-1 text-green-400 hover:bg-neutral-800 rounded"
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button
                                                onClick={() => setEditingTeamId(null)}
                                                className="p-1 text-neutral-400 hover:bg-neutral-800 rounded"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="font-medium text-white">{team.name}</span>
                                            {team.client && (
                                                <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded">
                                                    {team.client.firstName} {team.client.lastName}
                                                </span>
                                            )}
                                            <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                                                {filterEmployees(team.members).length}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {editingTeamId !== team.id && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                setEditingTeamId(team.id)
                                                setEditingTeamName(team.name)
                                            }}
                                            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"
                                            title="Umbenennen"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTeam(team)}
                                            className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded transition"
                                            title="Löschen"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {expandedTeams.has(team.id) && (
                                <div className="p-2 min-h-[60px]">
                                    {filterEmployees(team.members).length === 0 ? (
                                        <div className="text-center py-4 text-neutral-500 text-sm">
                                            {searchQuery ? "Keine Treffer" : "Assistenten hierher ziehen"}
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {filterEmployees(team.members).map((employee) => (
                                                <EmployeeCard
                                                    key={employee.id}
                                                    employee={employee}
                                                    onDragStart={(e) => handleDragStart(e, employee, team.id)}
                                                    onEdit={() => openEditEmployee(employee)}
                                                    onDelete={() => handleDeleteEmployee(employee)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Create Team Modal */}
                {showCreateTeam && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateTeam(false)} />
                        <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-xl font-bold text-white mb-4">Neues Team erstellen</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1">Teamname *</label>
                                    <input
                                        type="text"
                                        value={newTeamName}
                                        onChange={(e) => setNewTeamName(e.target.value)}
                                        placeholder="z.B. Team Max Mustermann"
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1">Klient (optional)</label>
                                    <select
                                        value={newTeamClientId}
                                        onChange={(e) => setNewTeamClientId(e.target.value)}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Kein Klient</option>
                                        {clients.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.firstName} {c.lastName}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-neutral-500 mt-1">
                                        Verknüpft das Team mit einem Assistenznehmer
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreateTeam(false)}
                                    className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition"
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={handleCreateTeam}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                                >
                                    Erstellen
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Team</label>
                                            <select
                                                value={employeeForm.team}
                                                onChange={(e) => setEmployeeForm({ ...employeeForm, team: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">Kein Team</option>
                                                {teams.map((t) => (
                                                    <option key={t.id} value={t.name}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-span-2">
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
