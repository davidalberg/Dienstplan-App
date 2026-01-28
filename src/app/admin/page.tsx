"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Database, Trash2, Edit2, Users, ChevronDown, ChevronUp, X } from "lucide-react"
import { showToast } from '@/lib/toast-utils'
import { formatTimeRange } from '@/lib/time-utils'
import { useAdminTimesheets } from '@/hooks/use-admin-data'

export default function AdminPage() {
    const { data: session } = useSession()
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [filters, setFilters] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        employeeId: "",
        teamId: ""
    })

    // SWR für Daten-Caching und schnellere Navigation
    const {
        timesheets: swrTimesheets,
        teams: swrTeams,
        employees: swrEmployees,
        isLoading,
        mutate
    } = useAdminTimesheets(filters.month, filters.year, filters.employeeId || undefined, filters.teamId || undefined)

    // Lokaler State für optimistische Updates
    const [timesheets, setTimesheets] = useState<any[]>([])
    const [teams, setTeams] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Sync SWR data to local state
    useEffect(() => {
        if (swrTimesheets) setTimesheets(swrTimesheets)
        if (swrTeams) setTeams(swrTeams)
        if (swrEmployees) setEmployees(swrEmployees)
        setLoading(isLoading)
    }, [swrTimesheets, swrTeams, swrEmployees, isLoading])

    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [editingShift, setEditingShift] = useState<any | null>(null)
    const [editData, setEditData] = useState({
        plannedStart: "",
        plannedEnd: "",
        actualStart: "",
        actualEnd: "",
        note: "",
        status: "",
        absenceType: ""
    })
    const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
    const [selectAll, setSelectAll] = useState(false)

    // Initialize expanded groups when teams change
    useEffect(() => {
        if (teams.length > 0) {
            setExpandedGroups(prev => {
                const newGroups = { ...prev }
                teams.forEach((t: any) => {
                    if (newGroups[t.id] === undefined) newGroups[t.id] = false
                })
                return newGroups
            })
        }
    }, [teams])

    const handleDelete = async (id: string) => {
        if (!confirm("Dies löscht den Schichteintrag dauerhaft. Fortfahren?")) return

        // Optimistic UI: Sofort aus Liste entfernen
        const deletedItem = timesheets.find(ts => ts.id === id)
        setTimesheets(prev => prev.filter(ts => ts.id !== id))
        setIsDeleting(id)

        try {
            const res = await fetch(`/api/admin/timesheets?id=${id}`, { method: "DELETE" })

            if (res.ok) {
                showToast("success", "Eintrag erfolgreich gelöscht")
                mutate() // Sync mit Server
            } else {
                // Rollback bei Fehler
                if (deletedItem) {
                    setTimesheets(prev => [...prev, deletedItem].sort((a, b) =>
                        new Date(a.date).getTime() - new Date(b.date).getTime()
                    ))
                }
                const error = await res.json()
                showToast("error", error.error || "Löschen fehlgeschlagen")
            }
        } catch (err) {
            // Rollback bei Netzwerkfehler
            if (deletedItem) {
                setTimesheets(prev => [...prev, deletedItem].sort((a, b) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                ))
            }
            showToast("error", "Netzwerkfehler beim Löschen")
            console.error(err)
        } finally {
            setIsDeleting(null)
        }
    }

    const toggleShiftSelection = (shiftId: string) => {
        const newSelected = new Set(selectedShifts)
        if (newSelected.has(shiftId)) {
            newSelected.delete(shiftId)
        } else {
            newSelected.add(shiftId)
        }
        setSelectedShifts(newSelected)
    }

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedShifts(new Set())
            setSelectAll(false)
        } else {
            const allIds = new Set(timesheets.map(ts => ts.id))
            setSelectedShifts(allIds)
            setSelectAll(true)
        }
    }

    const clearSelection = () => {
        setSelectedShifts(new Set())
        setSelectAll(false)
    }

    const handleBulkDelete = async () => {
        if (selectedShifts.size === 0) return

        if (!confirm(`Möchten Sie wirklich ${selectedShifts.size} Schichten löschen?`)) return

        setLoading(true)
        try {
            // Delete sequentially to avoid connection pool exhaustion
            const ids = Array.from(selectedShifts)
            let successCount = 0
            let errorCount = 0

            for (const id of ids) {
                try {
                    const res = await fetch(`/api/admin/timesheets?id=${id}`, { method: "DELETE" })
                    if (res.ok) {
                        successCount++
                        // Update UI progressively
                        setTimesheets(prev => prev.filter(ts => ts.id !== id))
                    } else {
                        errorCount++
                    }
                } catch {
                    errorCount++
                }
            }

            // Clear selection and show result
            clearSelection()
            if (errorCount > 0) {
                showToast("error", `${successCount} gelöscht, ${errorCount} Fehler`)
            } else {
                showToast("success", `${successCount} Schichten erfolgreich gelöscht`)
            }
        } catch (err) {
            console.error(err)
            alert("Fehler beim Löschen der Schichten")
        } finally {
            setLoading(false)
        }
    }

    const handleEditSave = async () => {
        if (!editingShift) return

        // Optimistic UI: Sofort in Liste aktualisieren
        const oldShift = timesheets.find(ts => ts.id === editingShift.id)
        const optimisticUpdate = {
            ...editingShift,
            ...editData,
        }

        setTimesheets(prev => prev.map(ts =>
            ts.id === editingShift.id ? optimisticUpdate : ts
        ))
        setEditingShift(null) // Dialog schließen

        try {
            const res = await fetch("/api/admin/timesheets", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingShift.id, ...editData })
            })

            if (res.ok) {
                const updated = await res.json()
                // Finale Daten vom Server übernehmen
                setTimesheets(prev => prev.map(ts =>
                    ts.id === updated.id ? updated : ts
                ))
                showToast("success", "Änderungen gespeichert")
            } else {
                // Rollback bei Fehler
                if (oldShift) {
                    setTimesheets(prev => prev.map(ts =>
                        ts.id === oldShift.id ? oldShift : ts
                    ))
                }
                const error = await res.json()
                showToast("error", error.error || "Speichern fehlgeschlagen")
                setEditingShift(oldShift) // Dialog wieder öffnen
            }
        } catch (err) {
            // Rollback bei Netzwerkfehler
            if (oldShift) {
                setTimesheets(prev => prev.map(ts =>
                    ts.id === oldShift.id ? oldShift : ts
                ))
            }
            showToast("error", "Netzwerkfehler beim Speichern")
            setEditingShift(oldShift)
            console.error(err)
        }
    }

    const openEdit = (shift: any) => {
        setEditingShift(shift)
        setEditData({
            plannedStart: shift.plannedStart || "",
            plannedEnd: shift.plannedEnd || "",
            actualStart: shift.actualStart || "",
            actualEnd: shift.actualEnd || "",
            note: shift.note || "",
            status: shift.status,
            absenceType: shift.absenceType || ""
        })
    }


    // Helper to group timesheets by team
    const groupedTimesheets = timesheets.reduce((acc: any, ts: any) => {
        const key = ts.team?.name || "Ohne Team"
        if (!acc[key]) acc[key] = []
        acc[key].push(ts)
        return acc
    }, {})

    const toggleGroup = (teamName: string) => {
        setExpandedGroups(prev => ({ ...prev, [teamName]: !prev[teamName] }))
    }

    if (!session) return null

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-6xl">
                <header className="mb-8">
                    <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                    <p className="text-neutral-400">Schicht-Management & Übersicht</p>
                </header>

                <div className="rounded-xl bg-neutral-900 p-6 border border-neutral-800">
                    <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-2 text-neutral-300">
                            <Users size={20} />
                            <h2 className="text-sm font-bold uppercase tracking-wider">Schicht-Management</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={filters.teamId}
                                onChange={e => setFilters({ ...filters, teamId: e.target.value })}
                                className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Alle Teams</option>
                                {teams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <select
                                value={filters.employeeId}
                                onChange={e => setFilters({ ...filters, employeeId: e.target.value })}
                                className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Alle Mitarbeiter</option>
                                {employees.map(e => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                            </select>
                            <div className="flex gap-1 items-center bg-neutral-800 rounded-lg border border-neutral-700 px-3 py-1.5">
                                <span className="text-[10px] font-bold uppercase text-neutral-400">Monat:</span>
                                <input
                                    type="number"
                                    value={filters.month}
                                    onChange={e => setFilters({ ...filters, month: parseInt(e.target.value) })}
                                    className="w-10 bg-transparent text-xs font-medium text-white focus:outline-none"
                                />
                                <span className="text-neutral-600">/</span>
                                <input
                                    type="number"
                                    value={filters.year}
                                    onChange={e => setFilters({ ...filters, year: parseInt(e.target.value) })}
                                    className="w-14 bg-transparent text-xs font-medium text-white focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bulk-Aktions-Leiste */}
                    {selectedShifts.size > 0 && (
                        <div className="sticky top-0 z-20 flex items-center justify-between bg-blue-900/30 p-4 rounded-xl mb-4 border border-blue-700">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-blue-300">
                                    {selectedShifts.size} Schicht{selectedShifts.size !== 1 ? 'en' : ''} ausgewählt
                                </span>
                                <button
                                    onClick={clearSelection}
                                    className="text-sm text-blue-400 hover:text-blue-300 underline"
                                >
                                    Auswahl aufheben
                                </button>
                            </div>
                            <button
                                onClick={handleBulkDelete}
                                disabled={loading}
                                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                            >
                                <Trash2 size={18} />
                                Ausgewählte löschen
                            </button>
                        </div>
                    )}

                    <div className="space-y-4">
                        {Object.keys(groupedTimesheets).length === 0 ? (
                            <div className="py-12 text-center text-neutral-400 font-medium">Keine Schichten gefunden.</div>
                        ) : Object.keys(groupedTimesheets).sort((a, b) => a.localeCompare(b, 'de')).map(teamName => (
                            <div key={teamName} className="rounded-xl border border-neutral-800 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(teamName)}
                                    className="w-full flex items-center justify-between bg-neutral-800/50 p-4 transition-colors hover:bg-neutral-800"
                                >
                                    <div className="flex items-center gap-3">
                                        <Database size={16} className="text-blue-400" />
                                        <div className="text-left">
                                            <h3 className="text-sm font-semibold text-white">{teamName}</h3>
                                            <p className="text-[10px] text-neutral-400 font-medium uppercase">
                                                {groupedTimesheets[teamName].length} Schichten
                                            </p>
                                        </div>
                                    </div>
                                    {expandedGroups[teamName] ? <ChevronUp size={18} className="text-neutral-400" /> : <ChevronDown size={18} className="text-neutral-400" />}
                                </button>

                                {expandedGroups[teamName] && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-neutral-800 text-neutral-400 uppercase text-[10px] font-medium tracking-wider">
                                                    <th className="py-3 px-4 w-12">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectAll}
                                                            onChange={toggleSelectAll}
                                                            className="w-4 h-4 rounded bg-neutral-700 border-neutral-600"
                                                        />
                                                    </th>
                                                    <th className="py-3 px-4">Datum</th>
                                                    <th className="py-3 px-4">Mitarbeiter</th>
                                                    <th className="py-3 px-4">Zeit (Plan)</th>
                                                    <th className="py-3 px-4">Ist-Zeit</th>
                                                    <th className="py-3 px-4">Status</th>
                                                    <th className="py-3 px-4">Aktion</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-800/50">
                                                {groupedTimesheets[teamName].map((ts: any) => (
                                                    <tr key={ts.id} className="hover:bg-neutral-800/30 transition-colors">
                                                        <td className="py-4 px-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedShifts.has(ts.id)}
                                                                onChange={() => toggleShiftSelection(ts.id)}
                                                                className="w-4 h-4 rounded bg-neutral-700 border-neutral-600"
                                                            />
                                                        </td>
                                                        <td className="py-4 px-4 font-medium text-white">
                                                            {format(new Date(ts.date), "dd.MM.yy")}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <p className="font-medium text-white">{ts.employee.name}</p>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className="rounded-md bg-neutral-800 px-2 py-1 text-[10px] font-medium text-neutral-300">
                                                                {formatTimeRange(ts.plannedStart, ts.plannedEnd)}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            {ts.actualStart ? (
                                                                <span className="font-medium text-neutral-300">
                                                                    {formatTimeRange(ts.actualStart, ts.actualEnd)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-neutral-600">-- : --</span>
                                                            )}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                                ts.absenceType === "SICK" ? "bg-red-900/50 text-red-400" :
                                                                ts.absenceType === "VACATION" ? "bg-cyan-900/50 text-cyan-400" :
                                                                (ts.note && ts.note.includes("Eingesprungen") && ts.status === "CONFIRMED") ? "bg-green-900/50 text-green-400" :
                                                                (ts.note && ts.note.includes("Eingesprungen")) ? "bg-orange-900/50 text-orange-400" :
                                                                ts.status === "CONFIRMED" ? "bg-green-900/50 text-green-400" :
                                                                ts.status === "CHANGED" ? "bg-amber-900/50 text-amber-400" :
                                                                ts.status === "SUBMITTED" ? "bg-blue-900/50 text-blue-400" : "bg-neutral-800 text-neutral-400"
                                                            }`}>
                                                                {ts.absenceType === "SICK" ? "Krank" :
                                                                    ts.absenceType === "VACATION" ? "Urlaub" :
                                                                    (ts.note && ts.note.includes("Eingesprungen") && ts.status === "CONFIRMED") ? "Eingesprungen" :
                                                                    (ts.note && ts.note.includes("Eingesprungen")) ? "Backup-Schicht" :
                                                                    ts.status === "CONFIRMED" ? "Bestätigt" :
                                                                    ts.status === "CHANGED" ? "Geändert" :
                                                                    ts.status === "SUBMITTED" ? "Eingereicht" : "Geplant"}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <div className="flex gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEdit(ts)}
                                                                    className="rounded-lg p-2 text-neutral-400 hover:bg-blue-900/50 hover:text-blue-400 transition-all"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDelete(ts.id)}
                                                                    disabled={isDeleting === ts.id}
                                                                    className="rounded-lg p-2 text-neutral-400 hover:bg-red-900/50 hover:text-red-400 transition-all"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Edit Modal */}
                {editingShift && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-700 p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-white">Schicht bearbeiten</h3>
                                <button
                                    type="button"
                                    onClick={() => setEditingShift(null)}
                                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-400 mb-1">Plan Beginn</label>
                                        <input
                                            type="time"
                                            value={editData.plannedStart}
                                            onChange={e => setEditData({ ...editData, plannedStart: e.target.value })}
                                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-400 mb-1">Plan Ende</label>
                                        <input
                                            type="time"
                                            value={editData.plannedEnd}
                                            onChange={e => setEditData({ ...editData, plannedEnd: e.target.value })}
                                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-400 mb-1">Ist Beginn</label>
                                        <input
                                            type="time"
                                            value={editData.actualStart}
                                            onChange={e => setEditData({ ...editData, actualStart: e.target.value })}
                                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-400 mb-1">Ist Ende</label>
                                        <input
                                            type="time"
                                            value={editData.actualEnd}
                                            onChange={e => setEditData({ ...editData, actualEnd: e.target.value })}
                                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-400 mb-1">Status</label>
                                        <select
                                            value={editData.status}
                                            onChange={e => setEditData({ ...editData, status: e.target.value })}
                                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="PLANNED">Geplant</option>
                                            <option value="CONFIRMED">Bestätigt</option>
                                            <option value="CHANGED">Geändert</option>
                                            <option value="SUBMITTED">Eingereicht</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-400 mb-1">Abwesenheit</label>
                                        <select
                                            value={editData.absenceType}
                                            onChange={e => setEditData({ ...editData, absenceType: e.target.value })}
                                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Keine</option>
                                            <option value="SICK">Krank</option>
                                            <option value="VACATION">Urlaub</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1">Notiz</label>
                                    <textarea
                                        value={editData.note}
                                        onChange={e => setEditData({ ...editData, note: e.target.value })}
                                        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleEditSave}
                                    disabled={loading}
                                    className="flex-1 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                    Speichern
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingShift(null)}
                                    className="flex-1 rounded-lg border border-neutral-700 py-2.5 font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
