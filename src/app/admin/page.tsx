"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Database, RefreshCw, Download, Terminal, CheckCircle, AlertCircle, Search, Trash2, Edit2, Filter, Users, User, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { showToast } from '@/lib/toast-utils'

export default function AdminPage() {
    const { data: session } = useSession()
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [timesheets, setTimesheets] = useState<any[]>([])
    const [sources, setSources] = useState<string[]>([])
    const [sheetFileNames, setSheetFileNames] = useState<string[]>([])
    const [teams, setTeams] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [filters, setFilters] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        employeeId: "",
        source: "",
        sheetFileName: ""
    })
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [editingShift, setEditingShift] = useState<any | null>(null)
    const [editData, setEditData] = useState({
        plannedStart: "",
        plannedEnd: "",
        actualStart: "",
        actualEnd: "",
        note: "",
        status: ""
    })
    const [showLogs, setShowLogs] = useState(false)
    const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
    const [selectAll, setSelectAll] = useState(false)
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1)
    const [exportYear, setExportYear] = useState(new Date().getFullYear())

    const fetchAdminData = async () => {
        try {
            const [logsRes, tsRes] = await Promise.all([
                fetch("/api/admin/sync"),
                fetch(`/api/admin/timesheets?month=${filters.month}&year=${filters.year}&employeeId=${filters.employeeId}&source=${filters.source}&sheetFileName=${filters.sheetFileName}`)
            ])

            if (logsRes.ok) setLogs(await logsRes.ok ? await logsRes.json() : [])
            if (tsRes.ok) {
                const data = await tsRes.json()
                setTimesheets(data.timesheets || [])
                setSources(data.sources || [])
                setSheetFileNames(data.sheetFileNames || [])
                setTeams(data.teams || [])
                setEmployees(data.employees || [])

                // Initialize expanded groups for service plans (default to collapsed/false)
                // KORREKT: Verwendet functional update um aktuelle State zu erhalten
                setExpandedGroups(prev => {
                    const newGroups = { ...prev }
                    ;(data.sheetFileNames || []).forEach((s: string) => {
                        if (newGroups[s] === undefined) newGroups[s] = false
                    })
                    return newGroups
                })
            }
        } catch (err) {
            console.error(err)
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
                // Kein fetchAdminData() mehr nötig - UI ist schon aktualisiert!
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
        setLoading(true)

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
                // Kein fetchAdminData() mehr nötig!
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
        } finally {
            setLoading(false)
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
            status: shift.status
        })
    }

    const triggerSync = async (action: "IMPORT" | "EXPORT") => {
        setLoading(true)
        try {
            await fetch("/api/admin/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            })
            fetchAdminData()
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleExportExcel = async () => {
        setLoading(true)
        try {
            // Export all Dienstpläne for the selected month (no source filter = all sources)
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

    // Helper to group timesheets by sheet file name (Dienstplan-Datei)
    const groupedTimesheets = timesheets.reduce((acc: any, ts: any) => {
        // Group by sheetFileName (z.B. "Dienstplan 2025") statt nach Tab-Namen
        const key = ts.sheetFileName || ts.source || "Manuell"
        if (!acc[key]) acc[key] = []
        acc[key].push(ts)
        return acc
    }, {})

    const toggleGroup = (source: string) => {
        setExpandedGroups(prev => ({ ...prev, [source]: !prev[source] }))
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
                        <p className="text-gray-900 font-bold">Google Sheets Synchronisierung & Logs</p>
                    </div>
                    <div className="flex gap-3">
                        <Link
                            href="/admin/employees"
                            className="flex items-center gap-2 rounded-xl border-2 border-purple-600 px-6 py-3 font-bold text-purple-600 transition-all hover:bg-purple-50"
                        >
                            <Users size={20} />
                            Mitarbeiter
                        </Link>
                        <button
                            type="button"
                            onClick={() => triggerSync("IMPORT")}
                            disabled={loading}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50"
                        >
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                            Importieren
                        </button>
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
                                value={filters.sheetFileName}
                                onChange={e => setFilters({ ...filters, sheetFileName: e.target.value })}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ color: '#000000' }}
                            >
                                <option value="" style={{ color: '#000000' }} className="text-black">Alle Dienstpläne</option>
                                {sheetFileNames.map(s => (
                                    <option key={s} value={s} style={{ color: '#000000' }} className="text-black">
                                        {s}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={filters.employeeId}
                                onChange={e => setFilters({ ...filters, employeeId: e.target.value })}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ color: '#000000' }}
                            >
                                <option value="" style={{ color: '#000000' }} className="text-black">Alle Mitarbeiter</option>
                                {employees.map(e => (
                                    <option key={e.id} value={e.id} style={{ color: '#000000' }} className="text-black">
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
                        {Object.keys(groupedTimesheets).length === 0 ? (
                            <div className="py-12 text-center text-black font-medium font-medium">Keine Schichten gefunden.</div>
                        ) : Object.keys(groupedTimesheets).sort((a, b) => a.localeCompare(b, 'de')).map(planName => {
                            // Find the sheetId for this file name - use the first timesheet's sheetId
                            const firstTimesheet = groupedTimesheets[planName][0]
                            const sheetUrl = firstTimesheet?.sheetId ? `https://docs.google.com/spreadsheets/d/${firstTimesheet.sheetId}/edit` : null

                            return (
                            <div key={planName} className="rounded-xl border border-gray-100 overflow-hidden">
                                <div className="flex items-stretch">
                                    <Link
                                        href={`/admin/team/${encodeURIComponent(planName)}`}
                                        className="flex items-center gap-3 bg-blue-50 px-4 py-4 transition-colors hover:bg-blue-100 border-r border-gray-100"
                                    >
                                        <Users size={18} className="text-blue-600" />
                                        <span className="text-xs font-bold text-blue-600 uppercase">Team-Ansicht</span>
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(planName)}
                                        className="flex-1 flex items-center justify-between bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Database size={16} className="text-blue-500" />
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">{planName}</h3>
                                                <p className="text-[10px] text-gray-900 font-black uppercase">
                                                    {groupedTimesheets[planName].length} Schichten
                                                </p>
                                            </div>
                                        </div>
                                        {expandedGroups[planName] ? <ChevronUp size={18} className="text-gray-900" /> : <ChevronDown size={18} className="text-gray-900" />}
                                    </button>
                                    {sheetUrl && (
                                        <a
                                            href={sheetUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 bg-green-50 px-4 py-4 transition-colors hover:bg-green-100 border-l border-gray-100"
                                            title="In Google Sheets öffnen"
                                        >
                                            <ExternalLink size={16} className="text-green-600" />
                                            <span className="text-xs font-bold text-green-600 uppercase">Sheets</span>
                                        </a>
                                    )}
                                </div>

                                {expandedGroups[planName] && (
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
                                                {groupedTimesheets[planName].map((ts: any) => (
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
                                                                {ts.plannedStart} - {ts.plannedEnd}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            {ts.actualStart ? (
                                                                <span className="font-bold text-gray-800">
                                                                    {ts.actualStart} - {ts.actualEnd}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-300">-- : --</span>
                                                            )}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${ts.status === "CONFIRMED" ? "bg-green-100 text-green-700" :
                                                                ts.status === "CHANGED" ? "bg-amber-100 text-amber-700" :
                                                                    ts.status === "SUBMITTED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-black"
                                                                }`}>
                                                                {ts.status === "CONFIRMED" ? "Bestätigt" :
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
                        )})}
                    </div>
                </div>

                <div className="mt-8">
                    <button
                        type="button"
                        onClick={() => setShowLogs(!showLogs)}
                        className="flex w-full items-center justify-between rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50"
                    >
                        <div className="flex items-center gap-2 text-gray-900">
                            <Terminal size={20} />
                            <h2 className="text-sm font-black uppercase tracking-widest">Sync Aktivitäten</h2>
                        </div>
                        {showLogs ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>

                    {showLogs && (
                        <div className="mt-2 space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
                            <div className="space-y-4">
                                {logs.length === 0 ? (
                                    <p className="py-8 text-center text-black font-medium font-medium">Keine Logs vorhanden.</p>
                                ) : logs.map(log => (
                                    <div key={log.id} className="flex items-start gap-4 rounded-xl border border-gray-100 p-4 transition-colors hover:bg-gray-50">
                                        <div className={`mt-1 rounded-full p-1.5 ${log.status === "SUCCESS" ? "bg-green-100 text-green-600" :
                                            log.status === "ERROR" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                            }`}>
                                            {log.status === "SUCCESS" ? <CheckCircle size={16} /> :
                                                log.status === "ERROR" ? <AlertCircle size={16} /> : <RefreshCw size={16} className="animate-spin" />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <p className={`text-sm font-bold uppercase tracking-tight ${log.status === "SUCCESS" ? "text-green-700" :
                                                    log.status === "ERROR" ? "text-red-700" : "text-blue-700"
                                                    }`}>
                                                    {log.status}
                                                </p>
                                                <p className="text-[10px] text-black font-medium uppercase font-medium">
                                                    {format(new Date(log.startedAt), "dd.MM. HH:mm:ss")}
                                                </p>
                                            </div>
                                            <p className="mt-1 text-sm text-gray-700 font-medium">{log.message || "Keine Nachricht vorhanden"}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
                                Wählen Sie den Monat aus, den Sie als Excel-Datei exportieren möchten. Es werden alle Dienstpläne für den ausgewählten Monat exportiert.
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
