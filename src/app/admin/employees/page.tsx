"use client"

import React from "react"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { Users, Edit2, Trash2, Plus, X, Save, ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"

interface Employee {
    id: string
    email: string
    name: string
    employeeId: string | null
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
    teamId: string | null
    team: { name: string } | null
    _count: { timesheets: number }
}

export default function EmployeesPage() {
    const { data: session } = useSession()
    const [employees, setEmployees] = useState<Employee[]>([])
    const [teams, setTeams] = useState<Array<{ sheetFileName: string; assistantRecipientName: string }>>([])
    const [loading, setLoading] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
    const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set())
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
        setLoading(true)
        try {
            const res = await fetch("/api/admin/employees")
            if (res.ok) {
                const data = await res.json()
                setEmployees(data.employees || [])
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
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

    const handleEdit = (employee: Employee) => {
        setEditingEmployee(employee)
        setFormData({
            id: employee.id,
            email: employee.email,
            password: "",
            name: employee.name || "",
            employeeId: employee.employeeId || "",
            team: employee.team?.name || "",
            entryDate: employee.entryDate ? new Date(employee.entryDate).toISOString().split('T')[0] : "",
            exitDate: employee.exitDate ? new Date(employee.exitDate).toISOString().split('T')[0] : "",
            hourlyWage: employee.hourlyWage || 0,
            travelCostType: employee.travelCostType || "NONE",
            nightPremiumEnabled: employee.nightPremiumEnabled,
            nightPremiumPercent: employee.nightPremiumPercent || 25,
            sundayPremiumEnabled: employee.sundayPremiumEnabled,
            sundayPremiumPercent: employee.sundayPremiumPercent || 30,
            holidayPremiumEnabled: employee.holidayPremiumEnabled,
            holidayPremiumPercent: employee.holidayPremiumPercent || 125
        })
        setIsEditing(true)
    }

    const handleCreate = () => {
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
        setIsCreating(true)
    }

    const handleSave = async () => {
        if (!formData.email || !formData.name) {
            alert("Email und Name sind erforderlich")
            return
        }

        if (isCreating && !formData.password) {
            alert("Passwort ist erforderlich")
            return
        }

        setLoading(true)
        try {
            const method = isCreating ? "POST" : "PUT"
            const res = await fetch("/api/admin/employees", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                setIsEditing(false)
                setIsCreating(false)
                setEditingEmployee(null)
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

    const handleDelete = async (id: string, name: string, timesheetCount: number, force = false) => {
        if (!force) {
            if (timesheetCount > 0) {
                if (!confirm(`${name} hat ${timesheetCount} Stundeneinträge. Wirklich löschen?`)) {
                    return
                }
            } else {
                if (!confirm(`Mitarbeiter ${name} wirklich löschen?`)) {
                    return
                }
            }
        }

        setLoading(true)
        try {
            const url = force
                ? `/api/admin/employees?id=${id}&force=true`
                : `/api/admin/employees?id=${id}`

            const res = await fetch(url, {
                method: "DELETE"
            })

            if (res.ok) {
                fetchEmployees()
            } else {
                const err = await res.json()

                // Wenn AuditLogs existieren und Bestätigung nötig ist
                if (err.needsConfirmation) {
                    if (confirm(`${err.error}\n\nAudit-Logs enthalten die Historie der Änderungen. Trotzdem fortfahren?`)) {
                        // Erneut mit force=true aufrufen
                        handleDelete(id, name, timesheetCount, true)
                    }
                } else {
                    alert(`Fehler: ${err.error}`)
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleCancel = () => {
        setIsEditing(false)
        setIsCreating(false)
        setEditingEmployee(null)
    }

    const toggleTeam = (teamName: string) => {
        const newCollapsed = new Set(collapsedTeams)
        if (newCollapsed.has(teamName)) {
            newCollapsed.delete(teamName)
        } else {
            newCollapsed.add(teamName)
        }
        setCollapsedTeams(newCollapsed)
    }

    // Gruppiere Mitarbeiter nach Teams
    const groupedEmployees = employees.reduce((acc, emp) => {
        const teamName = emp.team?.name || "Kein Team"
        if (!acc[teamName]) {
            acc[teamName] = []
        }
        acc[teamName].push(emp)
        return acc
    }, {} as Record<string, Employee[]>)

    // Sortiere Teams alphabetisch, "Kein Team" am Ende
    const sortedTeamNames = Object.keys(groupedEmployees).sort((a, b) => {
        if (a === "Kein Team") return 1
        if (b === "Kein Team") return -1
        return a.localeCompare(b)
    })

    if (loading && employees.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-xl text-gray-600">Lädt...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/admin"
                            className="text-gray-600 hover:text-gray-900 transition"
                        >
                            ← Zurück
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <Users className="text-blue-600" size={32} />
                            Mitarbeiter-Verwaltung
                        </h1>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                        disabled={loading}
                    >
                        <Plus size={20} />
                        Neuer Mitarbeiter
                    </button>
                </div>

                {/* Mitarbeiter-Liste gruppiert nach Teams */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Mitarbeiter-ID</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stundenlohn</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fahrtkosten</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Einträge</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTeamNames.map((teamName) => {
                                const teamEmployees = groupedEmployees[teamName]
                                const isCollapsed = collapsedTeams.has(teamName)

                                return (
                                    <React.Fragment key={teamName}>
                                        {/* Team Header */}
                                        <tr className="bg-blue-50 border-t-2 border-blue-200">
                                            <td colSpan={7} className="px-4 py-3">
                                                <button
                                                    onClick={() => toggleTeam(teamName)}
                                                    className="flex items-center gap-2 w-full text-left hover:bg-blue-100 rounded transition -mx-2 px-2 py-1"
                                                >
                                                    {isCollapsed ? (
                                                        <ChevronRight size={20} className="text-blue-600" />
                                                    ) : (
                                                        <ChevronDown size={20} className="text-blue-600" />
                                                    )}
                                                    <span className="font-bold text-gray-800 text-base">
                                                        {teamName}
                                                    </span>
                                                    <span className="text-sm text-gray-600 font-normal">
                                                        ({teamEmployees.length} Mitarbeiter)
                                                    </span>
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Team Mitarbeiter */}
                                        {!isCollapsed && teamEmployees.map((emp) => (
                                            <tr key={emp.id} className="border-t hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-800">{emp.name}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{emp.email}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{emp.employeeId || "-"}</td>
                                                <td className="px-4 py-3 text-sm text-gray-800">{emp.hourlyWage.toFixed(2)} €</td>
                                                <td className="px-4 py-3 text-sm text-gray-600">
                                                    {emp.travelCostType === "NONE" && "-"}
                                                    {emp.travelCostType === "DEUTSCHLANDTICKET" && "Deutschlandticket"}
                                                    {emp.travelCostType === "AUTO" && "Auto"}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{emp._count.timesheets}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            onClick={() => handleEdit(emp)}
                                                            className="text-blue-600 hover:text-blue-800 p-2 rounded hover:bg-blue-50 transition"
                                                            disabled={loading}
                                                        >
                                                            <Edit2 size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(emp.id, emp.name, emp._count.timesheets)}
                                                            className="text-red-600 hover:text-red-800 p-2 rounded hover:bg-red-50 transition"
                                                            disabled={loading}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>
                    </table>

                    {employees.length === 0 && (
                        <div className="text-center py-12 text-black">
                            Keine Mitarbeiter vorhanden
                        </div>
                    )}
                </div>

                {/* Bearbeitungs-Modal */}
                {(isEditing || isCreating) && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                                <h2 className="text-2xl font-bold text-gray-800">
                                    {isCreating ? "Neuer Mitarbeiter" : "Mitarbeiter bearbeiten"}
                                </h2>
                                <button
                                    onClick={handleCancel}
                                    className="text-black hover:text-gray-700 transition"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Basis-Informationen */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-gray-700">Basis-Informationen</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Email *
                                            </label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Mitarbeiter-ID
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.employeeId}
                                                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Team (Dienstplan)
                                            </label>
                                            <select
                                                value={formData.team}
                                                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="">Kein Team</option>
                                                {teams.map((team) => (
                                                    <option key={team.sheetFileName} value={team.sheetFileName}>
                                                        {team.sheetFileName}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Teams werden im Dashboard angezeigt
                                            </p>
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {isCreating ? "Passwort *" : "Passwort (leer lassen für keine Änderung)"}
                                            </label>
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Beschäftigungsdaten */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-gray-700">Beschäftigungsdaten</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Eintrittsdatum
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.entryDate}
                                                onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Austrittsdatum
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.exitDate}
                                                onChange={(e) => setFormData({ ...formData, exitDate: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Stundenlohn (€)
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.hourlyWage}
                                                onChange={(e) => setFormData({ ...formData, hourlyWage: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Fahrtkosten */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-gray-700">Fahrtkosten-Erstattung</h3>

                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="travelCostType"
                                                value="NONE"
                                                checked={formData.travelCostType === "NONE"}
                                                onChange={(e) => setFormData({ ...formData, travelCostType: e.target.value })}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="text-sm text-gray-700">Keine Erstattung</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="travelCostType"
                                                value="DEUTSCHLANDTICKET"
                                                checked={formData.travelCostType === "DEUTSCHLANDTICKET"}
                                                onChange={(e) => setFormData({ ...formData, travelCostType: e.target.value })}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="text-sm text-gray-700">Deutschlandticket</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="travelCostType"
                                                value="AUTO"
                                                checked={formData.travelCostType === "AUTO"}
                                                onChange={(e) => setFormData({ ...formData, travelCostType: e.target.value })}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="text-sm text-gray-700">Auto (Fahrtkosten)</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Zuschläge */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-gray-700">Zuschläge</h3>

                                    {/* Nachtzuschlag */}
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer min-w-[200px]">
                                            <input
                                                type="checkbox"
                                                checked={formData.nightPremiumEnabled}
                                                onChange={(e) => setFormData({ ...formData, nightPremiumEnabled: e.target.checked })}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Nachtzuschlag</span>
                                        </label>
                                        {formData.nightPremiumEnabled && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={formData.nightPremiumPercent}
                                                    onChange={(e) => setFormData({ ...formData, nightPremiumPercent: parseFloat(e.target.value) || 0 })}
                                                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                                <span className="text-sm text-gray-600">%</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Sonntagszuschlag */}
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer min-w-[200px]">
                                            <input
                                                type="checkbox"
                                                checked={formData.sundayPremiumEnabled}
                                                onChange={(e) => setFormData({ ...formData, sundayPremiumEnabled: e.target.checked })}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Sonntagszuschlag</span>
                                        </label>
                                        {formData.sundayPremiumEnabled && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={formData.sundayPremiumPercent}
                                                    onChange={(e) => setFormData({ ...formData, sundayPremiumPercent: parseFloat(e.target.value) || 0 })}
                                                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                                <span className="text-sm text-gray-600">%</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Feiertagszuschlag */}
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer min-w-[200px]">
                                            <input
                                                type="checkbox"
                                                checked={formData.holidayPremiumEnabled}
                                                onChange={(e) => setFormData({ ...formData, holidayPremiumEnabled: e.target.checked })}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Feiertagszuschlag</span>
                                        </label>
                                        {formData.holidayPremiumEnabled && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={formData.holidayPremiumPercent}
                                                    onChange={(e) => setFormData({ ...formData, holidayPremiumPercent: parseFloat(e.target.value) || 0 })}
                                                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                                <span className="text-sm text-gray-600">%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Aktions-Buttons */}
                                <div className="flex gap-3 justify-end border-t pt-4">
                                    <button
                                        onClick={handleCancel}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                                        disabled={loading}
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                                        disabled={loading}
                                    >
                                        <Save size={20} />
                                        {loading ? "Speichert..." : "Speichern"}
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
