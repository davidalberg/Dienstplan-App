"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Database, RefreshCw, Download, CheckCircle, AlertCircle, Trash2, Edit2, Users, ChevronDown, ChevronUp, FileText, Calendar } from "lucide-react"
import { showToast } from '@/lib/toast-utils'
import { formatTimeRange } from '@/lib/time-utils'

export default function AdminPage() {
    const { data: session } = useSession()
    const [loading, setLoading] = useState(true)
    const [timesheets, setTimesheets] = useState<any[]>([])
    const [teams, setTeams] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [filters, setFilters] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        employeeId: "",
        teamId: ""
    })
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
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1)
    const [exportYear, setExportYear] = useState(new Date().getFullYear())

    const fetchAdminData = async () => {
        setLoading(true)
        try {
            const tsRes = await fetch(`/api/admin/timesheets?month=${filters.month}&year=${filters.year}&employeeId=${filters.employeeId}&teamId=${filters.teamId}`)

            if (tsRes.ok) {
                const data = await tsRes.json()
                setTimesheets(data.timesheets || [])
                setTeams(data.teams || [])
                setEmployees(data.employees || [])

                // Initialize expanded groups for teams (default to collapsed/false)
                setExpandedGroups(prev => {
                    const newGroups = { ...prev }
                    ;(data.teams || []).forEach((t: any) => {
                        if (newGroups[t.id] === undefined) newGroups[t.id] = false
                    })
                    return newGroups
                })
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

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
            } else {
                // Rollback bei Fehler: Eintrag wieder hinzufügen
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

    const handleExportExcel = async () => {
        setLoading(true)
        try {
            const url = `/api/timesheets/export?month=${exportMonth}&year=${exportYear}`
            const res = await fetch(url)

            if (res.ok) {
                // Download the file
                const blob = await res.blob()
                const downloadUrl = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = downloadUrl
                a.download = `Stundennachweis_${exportMonth}_${exportYear}.xlsx`
                document.body.appendChild(a)
                a.click()
                a.remove()
                window.URL.revokeObjectURL(downloadUrl)

                setShowExportModal(false)
            } else {
                const error = await res.json()
                alert(`Export fehlgeschlagen: ${error.error}`)
            }
        } catch (err) {
            console.error(err)
            alert("Export fehlgeschlagen")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (session) fetchAdminData()
    }, [session, filters])

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
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-4xl">
                <div className="flex items-center justify-between mb-2">
                    <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:underline">
                        ← Dashboard
                    </Link>
                    <button
                        type="button"
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="text-sm font-medium text-black hover:text-red-600"
                    >
                        Abmelden
                    </button>
                </div>
                <header className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-black">Admin Panel</h1>
                        <p className="text-gray-900 font-bold">Schicht-Management & Übersicht</p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        <Link
                            href="/admin/schedule"
                            className="flex items-center gap-2 rounded-xl border-2 border-blue-600 px-6 py-3 font-bold text-blue-600 transition-all hover:bg-blue-50"
                        >
                            <Calendar size={20} />
                            Dienstplan-Editor
                        </Link>
                        <Link
                            href="/admin/dienstplan-config"
                            className="flex items-center gap-2 rounded-xl border-2 border-green-600 px-6 py-3 font-bold text-green-600 transition-all hover:bg-green-50"
                        >
                            <Database size={20} />
                            Dienstplan-Konfig
                        </Link>
                        <Link
                            href="/admin/submissions"
                            className="flex items-center gap-2 rounded-xl border-2 border-orange-600 px-6 py-3 font-bold text-orange-600 transition-all hover:bg-orange-50"
                        >
                            <FileText size={20} />
                            Einreichungen
                        </Link>
                        <Link
                            href="/admin/employees"
                            className="flex items-center gap-2 rounded-xl border-2 border-purple-600 px-6 py-3 font-bold text-purple-600 transition-all hover:bg-purple-50"
                        >
                            <Users size={20} />
                            Mitarbeiter
                        </Link>
                        <button
                            type="button"
                            onClick={() => setShowExportModal(true)}
                            disabled={loading}
                            className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 font-bold text-white shadow-lg hover:bg-black disabled:opacity-50"
                        >
                            <Download size={20} />
                            Exportieren
                        </button>
                    </div>
                </header>

                <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-900">
                            <Users size={20} />
                            <h2 className="text-sm font-black uppercase tracking-widest">Schicht-Management</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={filters.teamId}
                                onChange={e => setFilters({ ...filters, teamId: e.target.value })}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ color: '#000000' }}
                            >
                                <option value="" style={{ color: '#000000', fontWeight: 600 }}>Alle Teams</option>
                                {teams.map(t => (
                                    <option key={t.id} value={t.id} style={{ color: '#000000', fontWeight: 600 }}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={filters.employeeId}
                                onChange={e => setFilters({ ...filters, employeeId: e.target.value })}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ color: '#000000' }}
                            >
                                <option value="" style={{ color: '#000000', fontWeight: 600 }}>Alle Mitarbeiter</option>
                                {employees.map(e => (
                                    <option key={e.id} value={e.id} style={{ color: '#000000', fontWeight: 600 }}>
                                        {e.name}
                                    </option>
                                ))}
                            </select>
                            <div className="flex gap-1 items-center bg-gray-50 rounded-lg border border-gray-200 px-2">
                                <span className="text-[10px] font-black uppercase text-black">Monat:</span>
                                <input
                                    type="number"
                                    value={filters.month}
                                    onChange={e => setFilters({ ...filters, month: parseInt(e.target.value) })}
                                    className="w-10 bg-transparent py-1.5 text-xs font-bold text-black focus:outline-none"
                                />
                                <span className="text-gray-300">/</span>
                                <input
                                    type="number"
                                    value={filters.year}
                                    onChange={e => setFilters({ ...filters, year: parseInt(e.target.value) })}
                                    className="w-14 bg-transparent py-1.5 text-xs font-bold text-black focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bulk-Aktions-Leiste */}
                    {selectedShifts.size > 0 && (
                        <div className="sticky top-0 z-20 flex items-center justify-between bg-blue-50 p-4 rounded-xl mb-4 border border-blue-200">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-blue-900">
                                    {selectedShifts.size} Schicht{selectedShifts.size !== 1 ? 'en' : ''} ausgewählt
                                </span>
                                <button
                                    onClick={clearSelection}
                                    className="text-sm text-blue-600 hover:text-blue-800 underline"
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

                    <div className="space-y-6">
                        {loading ? (
                            <div className="py-12 text-center text-gray-500">
                                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                                Lade Schichten...
                            </div>
                        ) : Object.keys(groupedTimesheets).length === 0 ? (
                            <div className="py-12 text-center text-black font-medium">Keine Schichten gefunden.</div>
                        ) : Object.keys(groupedTimesheets).sort((a, b) => a.localeCompare(b, 'de')).map(teamName => (
                            <div key={teamName} className="rounded-xl border border-gray-100 overflow-hidden">
                                <div className="flex items-stretch">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(teamName)}
                                        className="flex-1 flex items-center justify-between bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Database size={16} className="text-blue-500" />
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">{teamName}</h3>
                                                <p className="text-[10px] text-gray-900 font-black uppercase">
                                                    {groupedTimesheets[teamName].length} Schichten
                                                </p>
                                            </div>
                                        </div>
                                        {expandedGroups[teamName] ? <ChevronUp size={18} className="text-gray-900" /> : <ChevronDown size={18} className="text-gray-900" />}
                                    </button>
                                </div>

                                {expandedGroups[teamName] && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-100 text-gray-900 uppercase text-[10px] font-black tracking-widest">
                                                    <th className="py-3 px-4 w-12">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectAll}
                                                            onChange={toggleSelectAll}
                                                            className="w-4 h-4 text-blue-600 rounded"
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
                                            <tbody className="divide-y divide-gray-50">
                                                {groupedTimesheets[teamName].map((ts: any) => (
                                                    <tr key={ts.id} className="hover:bg-gray-50/30 transition-colors">
                                                        <td className="py-4 px-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedShifts.has(ts.id)}
                                                                onChange={() => toggleShiftSelection(ts.id)}
                                                                className="w-4 h-4 text-blue-600 rounded"
                                                            />
                                                        </td>
                                                        <td className="py-4 px-4 font-bold text-gray-900">
                                                            {format(new Date(ts.date), "dd.MM.yy")}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <p className="font-bold text-black leading-tight">{ts.employee.name}</p>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-900">
                                                                {formatTimeRange(ts.plannedStart, ts.plannedEnd)}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            {ts.actualStart ? (
                                                                <span className="font-bold text-gray-800">
                                                                    {formatTimeRange(ts.actualStart, ts.actualEnd)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-300">-- : --</span>
                                                            )}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                                                ts.absenceType === "SICK" ? "bg-red-100 text-red-700" :
                                                                ts.absenceType === "VACATION" ? "bg-cyan-100 text-cyan-700" :
                                                                (ts.note && ts.note.includes("Eingesprungen") && ts.status === "CONFIRMED") ? "bg-green-100 text-green-700" :
                                                                (ts.note && ts.note.includes("Eingesprungen")) ? "bg-orange-100 text-orange-700" :
                                                                ts.status === "CONFIRMED" ? "bg-green-100 text-green-700" :
                                                                ts.status === "CHANGED" ? "bg-amber-100 text-amber-700" :
                                                                ts.status === "SUBMITTED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-black"
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
                                                                    className="rounded-lg p-2 text-black hover:bg-blue-50 hover:text-blue-600 transition-all"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDelete(ts.id)}
                                                                    disabled={isDeleting === ts.id}
                                                                    className="rounded-lg p-2 text-black hover:bg-red-50 hover:text-red-600 transition-all"
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
                            <h3 className="mb-6 text-xl font-black text-gray-900">Schicht bearbeiten</h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-black">Plan Beginn</label>
                                        <input
                                            type="time"
                                            value={editData.plannedStart}
                                            onChange={e => setEditData({ ...editData, plannedStart: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm font-bold text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-black">Plan Ende</label>
                                        <input
                                            type="time"
                                            value={editData.plannedEnd}
                                            onChange={e => setEditData({ ...editData, plannedEnd: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm font-bold text-gray-900"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-black">Ist Beginn</label>
                                        <input
                                            type="time"
                                            value={editData.actualStart}
                                            onChange={e => setEditData({ ...editData, actualStart: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-black">Ist Ende</label>
                                        <input
                                            type="time"
                                            value={editData.actualEnd}
                                            onChange={e => setEditData({ ...editData, actualEnd: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-black">Status</label>
                                        <select
                                            value={editData.status}
                                            onChange={e => setEditData({ ...editData, status: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm font-bold text-black"
                                            style={{ color: '#000000' }}
                                        >
                                            <option value="PLANNED" style={{ color: '#000000' }} className="text-black">GEPLANT</option>
                                            <option value="CONFIRMED" style={{ color: '#000000' }} className="text-black">BESTÄTIGT</option>
                                            <option value="CHANGED" style={{ color: '#000000' }} className="text-black">GEÄNDERT</option>
                                            <option value="SUBMITTED" style={{ color: '#000000' }} className="text-black">EINGEREICHT</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-black">Abwesenheit</label>
                                        <select
                                            value={editData.absenceType}
                                            onChange={e => setEditData({ ...editData, absenceType: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm font-bold text-black"
                                            style={{ color: '#000000' }}
                                        >
                                            <option value="" style={{ color: '#000000' }} className="text-black">Keine</option>
                                            <option value="SICK" style={{ color: '#000000' }} className="text-black">Krank</option>
                                            <option value="VACATION" style={{ color: '#000000' }} className="text-black">Urlaub</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-black">Notiz</label>
                                    <textarea
                                        value={editData.note}
                                        onChange={e => setEditData({ ...editData, note: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 p-2 text-sm"
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleEditSave}
                                    disabled={loading}
                                    className="flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Speichern
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingShift(null)}
                                    className="flex-1 rounded-xl border border-gray-200 py-3 font-bold text-gray-600 hover:bg-gray-50"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Export Modal */}
                {showExportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
                            <h3 className="mb-6 text-xl font-black text-gray-900">Excel Export</h3>
                            <p className="text-sm text-gray-600 mb-6">
                                Wählen Sie den Monat aus, den Sie als Excel-Datei exportieren möchten.
                            </p>
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black uppercase text-black">Monat</label>
                                        <select
                                            value={exportMonth}
                                            onChange={e => setExportMonth(parseInt(e.target.value))}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm font-bold text-black"
                                            style={{ color: '#000000' }}
                                        >
                                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                                                <option key={m} value={m} style={{ color: '#000000' }} className="text-black">
                                                    {new Date(2000, m - 1, 1).toLocaleDateString('de-DE', { month: 'long' })}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black uppercase text-black">Jahr</label>
                                        <input
                                            type="number"
                                            value={exportYear}
                                            onChange={e => setExportYear(parseInt(e.target.value))}
                                            className="w-full rounded-lg border border-gray-200 p-2 text-sm font-bold text-black"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleExportExcel}
                                    disabled={loading}
                                    className="flex-1 rounded-xl bg-green-600 py-3 font-bold text-white shadow-lg shadow-green-200 hover:bg-green-700 disabled:opacity-50"
                                >
                                    Excel herunterladen
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowExportModal(false)}
                                    className="flex-1 rounded-xl border border-gray-200 py-3 font-bold text-gray-600 hover:bg-gray-50"
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
