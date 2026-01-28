"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay } from "date-fns"
import { de } from "date-fns/locale"
import {
    Calendar,
    List,
    Plus,
    Edit2,
    Trash2,
    ChevronLeft,
    ChevronRight,
    X,
    Save
} from "lucide-react"
import { showToast } from "@/lib/toast-utils"
import { formatTimeRange } from "@/lib/time-utils"
import { useAdminSchedule } from "@/hooks/use-admin-data"

interface Shift {
    id: string
    date: string
    plannedStart: string
    plannedEnd: string
    status: string
    note: string | null
    employee: { id: string; name: string }
    backupEmployee: { id: string; name: string } | null
}

interface Employee {
    id: string
    name: string
    email: string
    teamId: string | null
}

interface Team {
    id: string
    name: string
}

export default function SchedulePage() {
    const { data: session } = useSession()
    const [viewMode, setViewMode] = useState<"list" | "calendar">("list")

    // Filter
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedTeam, setSelectedTeam] = useState<string>("")

    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    // SWR für Daten-Caching
    const {
        shifts: swrShifts,
        employees: swrEmployees,
        teams: swrTeams,
        isLoading,
        mutate
    } = useAdminSchedule(month, year, selectedTeam || undefined)

    // Lokaler State für optimistische Updates
    const [shifts, setShifts] = useState<Shift[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [teams, setTeams] = useState<Team[]>([])
    const [loading, setLoading] = useState(true)

    // Sync SWR data to local state
    useEffect(() => {
        if (swrShifts) setShifts(swrShifts)
        if (swrEmployees) setEmployees(swrEmployees)
        if (swrTeams) setTeams(swrTeams)
        setLoading(isLoading)
    }, [swrShifts, swrEmployees, swrTeams, isLoading])

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [editingShift, setEditingShift] = useState<Shift | null>(null)
    const [formData, setFormData] = useState({
        employeeId: "",
        date: "",
        plannedStart: "08:00",
        plannedEnd: "16:00",
        backupEmployeeId: "",
        note: "",
        // Für Wiederholung
        isRepeating: false,
        repeatEndDate: "",
        repeatDays: [1, 2, 3, 4, 5] as number[] // Mo-Fr default
    })

    // Alte fetchData-Funktion durch mutate() ersetzen
    const fetchData = () => mutate()

    const handleCreateOrUpdate = async () => {
        if (!formData.employeeId || !formData.date) {
            showToast("error", "Mitarbeiter und Datum sind erforderlich")
            return
        }

        setLoading(true)
        try {
            if (editingShift) {
                // Update
                const res = await fetch("/api/admin/schedule", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: editingShift.id,
                        plannedStart: formData.plannedStart,
                        plannedEnd: formData.plannedEnd,
                        backupEmployeeId: formData.backupEmployeeId || null,
                        note: formData.note || null
                    })
                })

                if (res.ok) {
                    showToast("success", "Schicht aktualisiert")
                    setShowModal(false)
                    fetchData()
                } else {
                    const err = await res.json()
                    showToast("error", err.error || "Fehler beim Speichern")
                }
            } else {
                // Create (Single oder Bulk)
                const body: any = {
                    employeeId: formData.employeeId,
                    plannedStart: formData.plannedStart,
                    plannedEnd: formData.plannedEnd,
                    backupEmployeeId: formData.backupEmployeeId || null,
                    note: formData.note || null,
                }

                if (formData.isRepeating && formData.repeatEndDate) {
                    body.bulk = true
                    body.startDate = formData.date
                    body.endDate = formData.repeatEndDate
                    body.repeatDays = formData.repeatDays
                } else {
                    body.date = formData.date
                }

                const res = await fetch("/api/admin/schedule", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                })

                if (res.ok) {
                    const result = await res.json()
                    if (result.created !== undefined) {
                        showToast("success", `${result.created} Schichten erstellt`)
                    } else {
                        showToast("success", "Schicht erstellt")
                    }
                    setShowModal(false)
                    fetchData()
                } else {
                    const err = await res.json()
                    showToast("error", err.error || "Fehler beim Erstellen")
                }
            }
        } catch (err) {
            console.error(err)
            showToast("error", "Netzwerkfehler")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Schicht wirklich löschen?")) return

        try {
            const res = await fetch(`/api/admin/schedule?id=${id}`, { method: "DELETE" })
            if (res.ok) {
                showToast("success", "Schicht gelöscht")
                setShifts(prev => prev.filter(s => s.id !== id))
            } else {
                showToast("error", "Fehler beim Löschen")
            }
        } catch (err) {
            showToast("error", "Netzwerkfehler")
        }
    }

    const openCreateModal = (date?: Date) => {
        setEditingShift(null)
        setFormData({
            employeeId: "",
            date: date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
            plannedStart: "08:00",
            plannedEnd: "16:00",
            backupEmployeeId: "",
            note: "",
            isRepeating: false,
            repeatEndDate: "",
            repeatDays: [1, 2, 3, 4, 5]
        })
        setShowModal(true)
    }

    const openEditModal = (shift: Shift) => {
        setEditingShift(shift)
        setFormData({
            employeeId: shift.employee.id,
            date: format(new Date(shift.date), "yyyy-MM-dd"),
            plannedStart: shift.plannedStart || "08:00",
            plannedEnd: shift.plannedEnd || "16:00",
            backupEmployeeId: shift.backupEmployee?.id || "",
            note: shift.note || "",
            isRepeating: false,
            repeatEndDate: "",
            repeatDays: [1, 2, 3, 4, 5]
        })
        setShowModal(true)
    }

    const navigateMonth = (delta: number) => {
        const newDate = new Date(currentDate)
        newDate.setMonth(newDate.getMonth() + delta)
        setCurrentDate(newDate)
    }

    const toggleRepeatDay = (day: number) => {
        setFormData(prev => ({
            ...prev,
            repeatDays: prev.repeatDays.includes(day)
                ? prev.repeatDays.filter(d => d !== day)
                : [...prev.repeatDays, day].sort()
        }))
    }

    // Kalender-Daten
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // Gruppiere Schichten nach Datum für Kalender
    const shiftsByDate = shifts.reduce((acc, shift) => {
        const dateKey = format(new Date(shift.date), "yyyy-MM-dd")
        if (!acc[dateKey]) acc[dateKey] = []
        acc[dateKey].push(shift)
        return acc
    }, {} as Record<string, Shift[]>)

    const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]

    if (!session) return null

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Calendar className="text-blue-400" size={28} />
                        Dienstplan-Editor
                    </h1>

                    <div className="flex items-center gap-3">
                        {/* View Toggle */}
                        <div className="flex bg-neutral-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode("list")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                    viewMode === "list" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <List size={16} className="inline mr-2" />
                                Liste
                            </button>
                            <button
                                onClick={() => setViewMode("calendar")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                    viewMode === "calendar" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <Calendar size={16} className="inline mr-2" />
                                Kalender
                            </button>
                        </div>

                        <button
                            onClick={() => openCreateModal()}
                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium"
                        >
                            <Plus size={20} />
                            Neue Schicht
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-neutral-900 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Month Navigation */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => navigateMonth(-1)}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="font-bold text-lg min-w-[150px] text-center text-white">
                                {format(currentDate, "MMMM yyyy", { locale: de })}
                            </span>
                            <button
                                onClick={() => navigateMonth(1)}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        {/* Team Filter */}
                        <select
                            value={selectedTeam}
                            onChange={(e) => setSelectedTeam(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-medium text-white"
                        >
                            <option value="">Alle Teams</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="text-sm text-neutral-400">
                        <span className="font-bold text-white">{shifts.length}</span> Schichten
                    </div>
                </div>

                {/* Content */}
                {viewMode === "list" ? (
                    /* Listen-Ansicht */
                    <div className="bg-neutral-900 rounded-xl overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-neutral-800">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Datum</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Mitarbeiter</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Zeit</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Backup</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Status</th>
                                    <th className="px-3 py-2 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wide">Aktionen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {shifts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-neutral-500">
                                            Keine Schichten für diesen Monat
                                        </td>
                                    </tr>
                                ) : shifts.map(shift => (
                                    <tr key={shift.id} className="hover:bg-neutral-800/50 transition">
                                        <td className="px-3 py-2 font-medium text-white text-sm">
                                            {format(new Date(shift.date), "EEE, dd.MM.", { locale: de })}
                                        </td>
                                        <td className="px-3 py-2 text-neutral-300 text-sm">{shift.employee.name}</td>
                                        <td className="px-3 py-2">
                                            <span className="bg-neutral-800 px-2 py-0.5 rounded text-xs font-medium text-neutral-300">
                                                {formatTimeRange(shift.plannedStart, shift.plannedEnd)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-neutral-400 text-sm">
                                            {shift.backupEmployee?.name || "-"}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                                shift.status === "CONFIRMED" ? "bg-green-900/50 text-green-400" :
                                                shift.status === "CHANGED" ? "bg-amber-900/50 text-amber-400" :
                                                shift.status === "SUBMITTED" ? "bg-blue-900/50 text-blue-400" :
                                                "bg-neutral-800 text-neutral-400"
                                            }`}>
                                                {shift.status === "CONFIRMED" ? "Bestätigt" :
                                                 shift.status === "CHANGED" ? "Geändert" :
                                                 shift.status === "SUBMITTED" ? "Eingereicht" : "Geplant"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex gap-1 justify-end">
                                                <button
                                                    onClick={() => openEditModal(shift)}
                                                    className="p-1.5 text-neutral-500 hover:text-blue-400 hover:bg-blue-900/30 rounded transition"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(shift.id)}
                                                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Kalender-Ansicht */
                    <div className="bg-neutral-900 rounded-xl p-4">
                        {/* Wochentage Header */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {dayNames.map(day => (
                                <div key={day} className="text-center text-xs font-bold text-neutral-500 py-2 uppercase tracking-wide">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Kalender Grid */}
                        <div className="grid grid-cols-7 gap-1">
                            {/* Leere Zellen für Tage vor Monatsanfang */}
                            {Array.from({ length: getDay(monthStart) }).map((_, i) => (
                                <div key={`empty-${i}`} className="min-h-[80px] bg-neutral-950 rounded-lg" />
                            ))}

                            {/* Tage des Monats */}
                            {calendarDays.map(day => {
                                const dateKey = format(day, "yyyy-MM-dd")
                                const dayShifts = shiftsByDate[dateKey] || []
                                const isToday = isSameDay(day, new Date())

                                return (
                                    <div
                                        key={dateKey}
                                        className={`min-h-[80px] border rounded-lg p-1.5 cursor-pointer hover:bg-neutral-800 transition ${
                                            isToday ? "border-blue-500 border-2 bg-blue-950/20" : "border-neutral-800 bg-neutral-900"
                                        }`}
                                        onClick={() => openCreateModal(day)}
                                    >
                                        <div className={`text-xs font-bold mb-1 ${isToday ? "text-blue-400" : "text-neutral-400"}`}>
                                            {format(day, "d")}
                                        </div>
                                        <div className="space-y-0.5">
                                            {dayShifts.slice(0, 3).map(shift => (
                                                <div
                                                    key={shift.id}
                                                    className="text-[10px] bg-blue-900/50 text-blue-300 px-1 py-0.5 rounded truncate cursor-pointer hover:bg-blue-900"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openEditModal(shift)
                                                    }}
                                                    title={`${shift.employee.name} ${shift.plannedStart}-${shift.plannedEnd}`}
                                                >
                                                    {shift.employee.name.split(" ")[0]}
                                                </div>
                                            ))}
                                            {dayShifts.length > 3 && (
                                                <div className="text-[10px] text-neutral-500">
                                                    +{dayShifts.length - 3} mehr
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Modal für Schicht erstellen/bearbeiten */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                        <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-neutral-800">
                            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">
                                    {editingShift ? "Schicht bearbeiten" : "Neue Schicht"}
                                </h2>
                                <button onClick={() => setShowModal(false)} className="text-neutral-500 hover:text-white transition">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Mitarbeiter */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                        Mitarbeiter *
                                    </label>
                                    <select
                                        value={formData.employeeId}
                                        onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                                        disabled={!!editingShift}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 disabled:opacity-50 text-white"
                                    >
                                        <option value="">Auswählen...</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Datum */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                        Datum *
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        disabled={!!editingShift}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 disabled:opacity-50 text-white"
                                    />
                                </div>

                                {/* Zeiten */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                                            Start
                                        </label>
                                        <input
                                            type="time"
                                            value={formData.plannedStart}
                                            onChange={(e) => setFormData({ ...formData, plannedStart: e.target.value })}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                                            Ende
                                        </label>
                                        <input
                                            type="time"
                                            value={formData.plannedEnd}
                                            onChange={(e) => setFormData({ ...formData, plannedEnd: e.target.value })}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                        />
                                    </div>
                                </div>

                                {/* Backup */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                        Backup-Mitarbeiter
                                    </label>
                                    <select
                                        value={formData.backupEmployeeId}
                                        onChange={(e) => setFormData({ ...formData, backupEmployeeId: e.target.value })}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                    >
                                        <option value="">Kein Backup</option>
                                        {employees.filter(e => e.id !== formData.employeeId).map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Notiz */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                        Notiz
                                    </label>
                                    <textarea
                                        value={formData.note}
                                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                        rows={2}
                                    />
                                </div>

                                {/* Wiederholung (nur bei Neuanlage) */}
                                {!editingShift && (
                                    <div className="border-t border-neutral-800 pt-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.isRepeating}
                                                onChange={(e) => setFormData({ ...formData, isRepeating: e.target.checked })}
                                                className="w-4 h-4 rounded bg-neutral-800 border-neutral-700"
                                            />
                                            <span className="text-sm font-medium text-neutral-300">
                                                Schicht wiederholen
                                            </span>
                                        </label>

                                        {formData.isRepeating && (
                                            <div className="mt-3 space-y-3 pl-6">
                                                <div>
                                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                                        Bis Datum
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={formData.repeatEndDate}
                                                        onChange={(e) => setFormData({ ...formData, repeatEndDate: e.target.value })}
                                                        min={formData.date}
                                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                                                        Wochentage
                                                    </label>
                                                    <div className="flex gap-1">
                                                        {dayNames.map((name, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => toggleRepeatDay(idx)}
                                                                className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
                                                                    formData.repeatDays.includes(idx)
                                                                        ? "bg-blue-600 text-white"
                                                                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                                                                }`}
                                                            >
                                                                {name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 px-6 py-4 flex gap-3">
                                <button
                                    onClick={handleCreateOrUpdate}
                                    disabled={loading}
                                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
                                >
                                    <Save size={18} />
                                    {loading ? "Speichert..." : "Speichern"}
                                </button>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 border border-neutral-700 py-2.5 rounded-xl font-bold text-neutral-400 hover:bg-neutral-800 transition"
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
