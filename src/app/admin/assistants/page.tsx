"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { Users, Edit2, Trash2, Plus, X, Save, Search, ArrowUpDown } from "lucide-react"

interface Employee {
    id: string
    email: string
    name: string
    employeeId: string | null
    team: { name: string } | null
    teamId: string | null
    entryDate: string | null
    exitDate: string | null
    hourlyWage: number
    travelCostType: string
    nightPremiumEnabled: boolean
    nightPremiumPercent: number
    sundayPremiumEnabled: boolean
    sundayPremiumPercent: number
    holidayPremiumEnabled: boolean
    holidayPremiumPercent: number
    _count: { timesheets: number }
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
    const { data: session } = useSession()
    const [employees, setEmployees] = useState<Employee[]>([])
    const [teams, setTeams] = useState<Array<{ sheetFileName: string }>>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<"active" | "inactive">("active")
    const [searchQuery, setSearchQuery] = useState("")
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
    const [showModal, setShowModal] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
    const [formData, setFormData] = useState({
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
        fetchEmployees()
        fetchTeams()
    }, [])

    const fetchEmployees = async () => {
        try {
            const res = await fetch("/api/admin/employees")
            if (res.ok) {
                const data = await res.json()
                setEmployees(data.employees || [])
            }
        } catch (err) {
            console.error(err)
        }
    }

    const fetchTeams = async () => {
        try {
            const res = await fetch("/api/admin/dienstplan-config")
            if (res.ok) {
                const data = await res.json()
                setTeams(data.configs || [])
            }
        } catch (err) {
            console.error(err)
        }
    }

    const isEmployeeActive = (emp: Employee): boolean => {
        if (!emp.exitDate) return true
        return new Date(emp.exitDate) > new Date()
    }

    const handleCreate = () => {
        setEditingEmployee(null)
        setFormData({
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
        setShowModal(true)
    }

    const handleEdit = (emp: Employee) => {
        setEditingEmployee(emp)
        setFormData({
            id: emp.id,
            email: emp.email,
            password: "",
            name: emp.name || "",
            employeeId: emp.employeeId || "",
            team: emp.team?.name || "",
            entryDate: emp.entryDate ? new Date(emp.entryDate).toISOString().split('T')[0] : "",
            exitDate: emp.exitDate ? new Date(emp.exitDate).toISOString().split('T')[0] : "",
            hourlyWage: emp.hourlyWage || 0,
            travelCostType: emp.travelCostType || "NONE",
            nightPremiumEnabled: emp.nightPremiumEnabled,
            nightPremiumPercent: emp.nightPremiumPercent || 25,
            sundayPremiumEnabled: emp.sundayPremiumEnabled,
            sundayPremiumPercent: emp.sundayPremiumPercent || 30,
            holidayPremiumEnabled: emp.holidayPremiumEnabled,
            holidayPremiumPercent: emp.holidayPremiumPercent || 125
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!formData.email || !formData.name) {
            alert("Email und Name sind erforderlich")
            return
        }
        if (!editingEmployee && !formData.password) {
            alert("Passwort ist erforderlich")
            return
        }

        setLoading(true)
        try {
            const method = editingEmployee ? "PUT" : "POST"
            const res = await fetch("/api/admin/employees", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                setShowModal(false)
                fetchEmployees()
            } else {
                const err = await res.json()
                alert(`Fehler: ${err.error}`)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (emp: Employee) => {
        if (emp._count.timesheets > 0) {
            alert(`${emp.name} hat ${emp._count.timesheets} Stundeneinträge und kann nicht gelöscht werden.`)
            return
        }
        if (!confirm(`Assistent "${emp.name}" wirklich löschen?`)) return

        setLoading(true)
        try {
            const res = await fetch(`/api/admin/employees?id=${emp.id}`, { method: "DELETE" })
            if (res.ok) {
                fetchEmployees()
            } else {
                const err = await res.json()
                if (err.needsConfirmation && confirm(`${err.error}\n\nTrotzdem fortfahren?`)) {
                    await fetch(`/api/admin/employees?id=${emp.id}&force=true`, { method: "DELETE" })
                    fetchEmployees()
                } else if (!err.needsConfirmation) {
                    alert(`Fehler: ${err.error}`)
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const filteredEmployees = employees
        .filter(emp => isEmployeeActive(emp) === (activeTab === "active"))
        .filter(emp => {
            if (!searchQuery) return true
            const name = emp.name?.toLowerCase() || ""
            const email = emp.email?.toLowerCase() || ""
            const query = searchQuery.toLowerCase()
            return name.includes(query) || email.includes(query)
        })
        .sort((a, b) => {
            const nameA = (a.name || "").toLowerCase()
            const nameB = (b.name || "").toLowerCase()
            return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
        })

    const activeCount = employees.filter(emp => isEmployeeActive(emp)).length
    const inactiveCount = employees.filter(emp => !isEmployeeActive(emp)).length

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Users className="text-blue-400" size={28} />
                        Assistenten
                    </h1>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === "active"
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                        }`}
                    >
                        Aktiv ({activeCount})
                    </button>
                    <button
                        onClick={() => setActiveTab("inactive")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === "inactive"
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                        }`}
                    >
                        Ausgeschieden ({inactiveCount})
                    </button>
                </div>

                {/* Search and Sort */}
                <div className="flex gap-3 mb-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <input
                            type="text"
                            placeholder="Suchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-700 transition flex items-center gap-2"
                    >
                        <ArrowUpDown size={16} />
                        {sortOrder === "asc" ? "A-Z" : "Z-A"}
                    </button>
                </div>

                {/* Employee List */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                    {filteredEmployees.length === 0 ? (
                        <div className="text-center py-12 text-neutral-500">
                            {searchQuery ? "Keine Assistenten gefunden" : `Keine ${activeTab === "active" ? "aktiven" : "ausgeschiedenen"} Assistenten`}
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-800">
                            {filteredEmployees.map((emp) => (
                                <div key={emp.id} className="flex items-center gap-4 p-4 hover:bg-neutral-800/50 transition group">
                                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(emp.name || emp.email)} flex items-center justify-center shrink-0`}>
                                        <span className="text-white font-medium">
                                            {(emp.name || emp.email).charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">{emp.name || "Unbenannt"}</p>
                                        <p className="text-neutral-500 text-sm truncate">{emp.email}</p>
                                    </div>
                                    {emp.team && (
                                        <span className="hidden sm:inline-block px-2 py-1 bg-neutral-800 text-neutral-400 text-xs rounded truncate max-w-[150px]">
                                            {emp.team.name}
                                        </span>
                                    )}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button
                                            onClick={() => handleEdit(emp)}
                                            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition"
                                            title="Bearbeiten"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(emp)}
                                            className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded transition"
                                            title="Löschen"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add Button */}
                <div className="flex justify-center mt-6">
                    <button
                        onClick={handleCreate}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <Plus size={20} />
                        Hinzufügen
                    </button>
                </div>

                {/* Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
                        <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">
                                    {editingEmployee ? "Assistent bearbeiten" : "Assistent erstellen"}
                                </h2>
                                <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition">
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
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Email *</label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Mitarbeiter-ID</label>
                                            <input
                                                type="text"
                                                value={formData.employeeId}
                                                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Team (Dienstplan)</label>
                                            <select
                                                value={formData.team}
                                                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">Kein Team</option>
                                                {teams.map((t) => (
                                                    <option key={t.sheetFileName} value={t.sheetFileName}>{t.sheetFileName}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                {editingEmployee ? "Passwort (leer = keine Änderung)" : "Passwort *"}
                                            </label>
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                                                value={formData.entryDate}
                                                onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Austrittsdatum</label>
                                            <input
                                                type="date"
                                                value={formData.exitDate}
                                                onChange={(e) => setFormData({ ...formData, exitDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Stundenlohn (EUR)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.hourlyWage}
                                                onChange={(e) => setFormData({ ...formData, hourlyWage: parseFloat(e.target.value) || 0 })}
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
                                                    checked={formData.travelCostType === opt.value}
                                                    onChange={(e) => setFormData({ ...formData, travelCostType: e.target.value })}
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
                                                        checked={(formData as any)[item.enabled]}
                                                        onChange={(e) => setFormData({ ...formData, [item.enabled]: e.target.checked })}
                                                        className="w-4 h-4 text-blue-600 rounded"
                                                    />
                                                    <span className="text-sm text-neutral-300">{item.label}</span>
                                                </label>
                                                {(formData as any)[item.enabled] && (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={(formData as any)[item.percent]}
                                                            onChange={(e) => setFormData({ ...formData, [item.percent]: parseFloat(e.target.value) || 0 })}
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
                                        onClick={() => setShowModal(false)}
                                        className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition"
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center justify-center gap-2"
                                    >
                                        <Save size={18} />
                                        {loading ? "Speichert..." : (editingEmployee ? "Speichern" : "Erstellen")}
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
