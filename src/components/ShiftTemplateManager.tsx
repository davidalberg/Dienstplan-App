"use client"

import { useState, useEffect } from "react"
import { X, Plus, Trash2, Play, Calendar } from "lucide-react"
import { showToast } from "@/lib/toast-utils"
import { format, addMonths, startOfMonth, endOfMonth } from "date-fns"
import { de } from "date-fns/locale"

interface ShiftTemplate {
    id: string
    name: string
    employeeId: string
    employeeName?: string
    clientId: string | null
    weekdays: number[]
    plannedStart: string
    plannedEnd: string
    backupEmployeeId: string | null
    backupEmployeeName?: string | null
    note: string | null
}

interface Employee {
    id: string
    name: string
}

interface Client {
    id: string
    firstName: string
    lastName: string
}

interface ShiftTemplateManagerProps {
    isOpen: boolean
    onClose: () => void
    employees: Employee[]
    clients: Client[]
    currentMonth: number
    currentYear: number
    onTemplateApplied: () => void
}

const WEEKDAYS = [
    { value: 1, label: "Mo" },
    { value: 2, label: "Di" },
    { value: 3, label: "Mi" },
    { value: 4, label: "Do" },
    { value: 5, label: "Fr" },
    { value: 6, label: "Sa" },
    { value: 0, label: "So" }
]

export default function ShiftTemplateManager({
    isOpen,
    onClose,
    employees,
    clients,
    currentMonth,
    currentYear,
    onTemplateApplied
}: ShiftTemplateManagerProps) {
    const [templates, setTemplates] = useState<ShiftTemplate[]>([])
    const [loading, setLoading] = useState(false)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        employeeId: "",
        clientId: "",
        weekdays: [] as number[],
        plannedStart: "08:00",
        plannedEnd: "16:00",
        backupEmployeeId: "",
        note: ""
    })

    // Apply Range State
    const [applyRange, setApplyRange] = useState({
        startDate: format(startOfMonth(new Date(currentYear, currentMonth - 1)), "yyyy-MM-dd"),
        endDate: format(endOfMonth(new Date(currentYear, currentMonth - 1)), "yyyy-MM-dd")
    })

    // Lade Templates
    useEffect(() => {
        if (isOpen) {
            fetchTemplates()
        }
    }, [isOpen])

    // Update apply range when month changes
    useEffect(() => {
        const monthStart = startOfMonth(new Date(currentYear, currentMonth - 1))
        setApplyRange({
            startDate: format(monthStart, "yyyy-MM-dd"),
            endDate: format(endOfMonth(monthStart), "yyyy-MM-dd")
        })
    }, [currentMonth, currentYear])

    const fetchTemplates = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/schedule/templates")
            if (res.ok) {
                const data = await res.json()
                setTemplates(data)
            }
        } catch (error) {
            console.error("Error fetching templates:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateTemplate = async () => {
        if (!formData.name || !formData.employeeId || formData.weekdays.length === 0) {
            showToast("error", "Bitte Name, Mitarbeiter und mindestens einen Wochentag auswählen")
            return
        }

        try {
            const res = await fetch("/api/admin/schedule/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    clientId: formData.clientId || null,
                    backupEmployeeId: formData.backupEmployeeId || null,
                    note: formData.note || null
                })
            })

            if (res.ok) {
                showToast("success", "Vorlage erstellt")
                setShowCreateForm(false)
                setFormData({
                    name: "",
                    employeeId: "",
                    clientId: "",
                    weekdays: [],
                    plannedStart: "08:00",
                    plannedEnd: "16:00",
                    backupEmployeeId: "",
                    note: ""
                })
                fetchTemplates()
            } else {
                const data = await res.json()
                showToast("error", data.error || "Fehler beim Erstellen")
            }
        } catch (error) {
            showToast("error", "Netzwerkfehler")
        }
    }

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm("Vorlage wirklich löschen?")) return

        try {
            const res = await fetch(`/api/admin/schedule/templates?id=${id}`, {
                method: "DELETE"
            })

            if (res.ok) {
                showToast("success", "Vorlage gelöscht")
                fetchTemplates()
            }
        } catch (error) {
            showToast("error", "Fehler beim Löschen")
        }
    }

    const handleApplyTemplate = async (templateId: string) => {
        setApplyingTemplate(templateId)
        try {
            const res = await fetch("/api/admin/schedule/templates/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    templateId,
                    startDate: applyRange.startDate,
                    endDate: applyRange.endDate,
                    skipExisting: true
                })
            })

            const data = await res.json()

            if (res.ok) {
                if (data.created > 0) {
                    showToast("success", `${data.created} Schichten erstellt${data.skipped > 0 ? ` (${data.skipped} übersprungen)` : ""}`)
                    onTemplateApplied()
                } else {
                    showToast("info", "Alle Schichten existieren bereits")
                }
            } else {
                showToast("error", data.error || "Fehler beim Anwenden")
            }
        } catch (error) {
            showToast("error", "Netzwerkfehler")
        } finally {
            setApplyingTemplate(null)
        }
    }

    const toggleWeekday = (day: number) => {
        setFormData(prev => ({
            ...prev,
            weekdays: prev.weekdays.includes(day)
                ? prev.weekdays.filter(d => d !== day)
                : [...prev.weekdays, day].sort()
        }))
    }

    const getWeekdayLabels = (weekdays: number[]) => {
        return weekdays
            .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
            .map(d => WEEKDAYS.find(w => w.value === d)?.label)
            .join(", ")
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar size={24} className="text-violet-400" />
                        Schicht-Vorlagen
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition"
                    >
                        <X size={20} className="text-neutral-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Zeitraum für Anwendung */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 mb-6">
                        <h3 className="text-sm font-medium text-neutral-400 mb-3">Zeitraum für Anwendung</h3>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-xs text-neutral-500">Von</label>
                                <input
                                    type="date"
                                    value={applyRange.startDate}
                                    onChange={(e) => setApplyRange(prev => ({ ...prev, startDate: e.target.value }))}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-neutral-500">Bis</label>
                                <input
                                    type="date"
                                    value={applyRange.endDate}
                                    onChange={(e) => setApplyRange(prev => ({ ...prev, endDate: e.target.value }))}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Vorlagen Liste */}
                    {loading ? (
                        <div className="text-center py-8 text-neutral-400">Lade Vorlagen...</div>
                    ) : templates.length === 0 && !showCreateForm ? (
                        <div className="text-center py-8">
                            <p className="text-neutral-400 mb-4">Noch keine Vorlagen erstellt</p>
                            <button
                                onClick={() => setShowCreateForm(true)}
                                className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition flex items-center gap-2 mx-auto"
                            >
                                <Plus size={18} />
                                Erste Vorlage erstellen
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {templates.map(template => (
                                <div
                                    key={template.id}
                                    className="bg-neutral-800 rounded-xl p-4 flex items-center justify-between"
                                >
                                    <div className="flex-1">
                                        <h4 className="font-medium text-white">{template.name}</h4>
                                        <p className="text-sm text-neutral-400">
                                            {template.employeeName} &bull; {getWeekdayLabels(template.weekdays)} &bull; {template.plannedStart}-{template.plannedEnd}
                                        </p>
                                        {template.backupEmployeeName && (
                                            <p className="text-xs text-neutral-500">Backup: {template.backupEmployeeName}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleApplyTemplate(template.id)}
                                            disabled={applyingTemplate === template.id}
                                            className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 transition flex items-center gap-1 text-sm"
                                        >
                                            {applyingTemplate === template.id ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Play size={14} />
                                            )}
                                            Anwenden
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTemplate(template.id)}
                                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Create Form */}
                    {showCreateForm && (
                        <div className="mt-6 bg-neutral-800/50 rounded-xl p-4 border border-neutral-700">
                            <h3 className="font-medium text-white mb-4">Neue Vorlage</h3>

                            <div className="space-y-4">
                                {/* Name */}
                                <div>
                                    <label className="text-sm text-neutral-400">Vorlagen-Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="z.B. Montags-Schicht Max"
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white mt-1"
                                    />
                                </div>

                                {/* Mitarbeiter */}
                                <div>
                                    <label className="text-sm text-neutral-400">Mitarbeiter</label>
                                    <select
                                        value={formData.employeeId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white mt-1"
                                    >
                                        <option value="">Auswählen...</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Wochentage */}
                                <div>
                                    <label className="text-sm text-neutral-400 block mb-2">Wochentage</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {WEEKDAYS.map(day => (
                                            <button
                                                key={day.value}
                                                onClick={() => toggleWeekday(day.value)}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${formData.weekdays.includes(day.value)
                                                        ? "bg-violet-600 text-white"
                                                        : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
                                                    }`}
                                            >
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Zeiten */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm text-neutral-400">Start</label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="08:00"
                                            value={formData.plannedStart}
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/[^0-9:]/g, '')
                                                if (val.length === 2 && !val.includes(':') && formData.plannedStart.length < 2) {
                                                    val = val + ':'
                                                }
                                                if (val.length <= 5) {
                                                    setFormData(prev => ({ ...prev, plannedStart: val }))
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const val = e.target.value
                                                const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                                if (match) {
                                                    const h = match[1].padStart(2, '0')
                                                    const m = (match[2] || '00').padStart(2, '0')
                                                    if (parseInt(h) <= 24 && parseInt(m) <= 59) {
                                                        setFormData(prev => ({ ...prev, plannedStart: `${h}:${m}` }))
                                                    }
                                                }
                                            }}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white mt-1 font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm text-neutral-400">Ende</label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="16:00"
                                            value={formData.plannedEnd}
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/[^0-9:]/g, '')
                                                if (val.length === 2 && !val.includes(':') && formData.plannedEnd.length < 2) {
                                                    val = val + ':'
                                                }
                                                if (val.length <= 5) {
                                                    setFormData(prev => ({ ...prev, plannedEnd: val }))
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const val = e.target.value
                                                const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                                if (match) {
                                                    const h = match[1].padStart(2, '0')
                                                    const m = (match[2] || '00').padStart(2, '0')
                                                    if (parseInt(h) <= 24 && parseInt(m) <= 59) {
                                                        setFormData(prev => ({ ...prev, plannedEnd: `${h}:${m}` }))
                                                    }
                                                }
                                            }}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white mt-1 font-mono"
                                        />
                                    </div>
                                </div>

                                {/* Backup */}
                                <div>
                                    <label className="text-sm text-neutral-400">Backup-Mitarbeiter (optional)</label>
                                    <select
                                        value={formData.backupEmployeeId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, backupEmployeeId: e.target.value }))}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white mt-1"
                                    >
                                        <option value="">Kein Backup</option>
                                        {employees.filter(e => e.id !== formData.employeeId).map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleCreateTemplate}
                                        className="flex-1 bg-violet-600 text-white py-2 rounded-lg hover:bg-violet-700 transition font-medium"
                                    >
                                        Vorlage speichern
                                    </button>
                                    <button
                                        onClick={() => setShowCreateForm(false)}
                                        className="px-4 py-2 border border-neutral-700 rounded-lg text-neutral-400 hover:bg-neutral-800 transition"
                                    >
                                        Abbrechen
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {templates.length > 0 && !showCreateForm && (
                    <div className="p-4 border-t border-neutral-800">
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="w-full bg-neutral-800 text-white py-2.5 rounded-xl hover:bg-neutral-700 transition flex items-center justify-center gap-2"
                        >
                            <Plus size={18} />
                            Neue Vorlage erstellen
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
