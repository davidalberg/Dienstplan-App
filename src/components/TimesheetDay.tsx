"use client"

import { useState } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { CheckCircle2, AlertCircle, Clock, Edit3, RotateCcw, Loader2 } from "lucide-react"
import { showToast } from '@/lib/toast-utils'
import { formatTimeRange } from '@/lib/time-utils'

export default function TimesheetDay({ timesheet, onUpdate, onDelete }: { timesheet: any, onUpdate: (updatedTimesheet: any) => void, onDelete?: (id: string) => void }) {
    const [isEditing, setIsEditing] = useState(false)
    const [loading, setLoading] = useState(false)
    const [editData, setEditData] = useState({
        actualStart: timesheet.actualStart || timesheet.plannedStart || "",
        actualEnd: timesheet.actualEnd || timesheet.plannedEnd || "",
        note: timesheet.note || "",
        absenceType: timesheet.absenceType || "",
    })
    const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
    const [isOptimistic, setIsOptimistic] = useState(false)

    const handleAction = async (action: "CONFIRM" | "UPDATE" | "UNCONFIRM") => {
        // Zeit-Validierung bei UPDATE
        if (action === "UPDATE" && editData.actualStart && editData.actualEnd) {
            if (editData.actualStart >= editData.actualEnd) {
                showToast("error", "Startzeit muss vor Endzeit liegen")
                return
            }
        }

        // Optimistic UI update
        if (action === "CONFIRM") {
            setOptimisticStatus("CONFIRMED")
            setIsOptimistic(true)
            setEditData({
                ...editData,
                actualStart: timesheet.plannedStart,
                actualEnd: timesheet.plannedEnd,
            })
        } else if (action === "UNCONFIRM") {
            setOptimisticStatus("PLANNED")
            setIsOptimistic(true)
        }

        setLoading(true)
        try {
            const res = await fetch("/api/timesheets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: timesheet.id,
                    action,
                    ...editData
                })
            })

            if (res.ok) {
                const result = await res.json()

                // Wenn Backup-Schicht gelöscht wurde (Backup hat sich krank gemeldet)
                if (result.deleted) {
                    setIsEditing(false)
                    setIsOptimistic(false)
                    setOptimisticStatus(null)
                    showToast("success", "Backup-Schicht wurde entfernt (Vertretung nicht möglich)")
                    if (onDelete) {
                        onDelete(timesheet.id)
                    }
                    return
                }

                onUpdate(result)
                setIsEditing(false)
                setIsOptimistic(false)
                setOptimisticStatus(null)

                // Success-Toast
                if (action === "CONFIRM") {
                    showToast("success", "Dienst erfolgreich bestätigt")
                } else if (action === "UPDATE") {
                    showToast("success", "Änderungen gespeichert")
                } else if (action === "UNCONFIRM") {
                    showToast("success", "Dienst zurückgesetzt")
                }
            } else {
                // Rollback bei Fehler
                setOptimisticStatus(null)
                setIsOptimistic(false)
                const error = await res.json()
                showToast("error", error.error || "Fehler beim Speichern")
            }
        } catch (err) {
            // Rollback bei Netzwerkfehler
            setOptimisticStatus(null)
            setIsOptimistic(false)
            showToast("error", "Netzwerkfehler. Bitte erneut versuchen.")
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const getCurrentStatus = () => optimisticStatus || timesheet.status

    const getStatusColor = () => {
        // Priorität: Krank > Urlaub > Backup-Schicht > Normal
        if (timesheet.absenceType === "SICK") return "bg-red-100 text-red-700"
        if (timesheet.absenceType === "VACATION") return "bg-cyan-100 text-cyan-700"

        // Backup-Schicht (neue Note-Format) - immer Orange
        const isBackupShift = timesheet.note?.includes("Backup-Schicht anfallend")
        if (isBackupShift) return "bg-orange-100 text-orange-700"

        const status = getCurrentStatus()
        switch (status) {
            case "SUBMITTED": return "bg-blue-100 text-blue-700"  // BLAU für Eingereicht
            case "COMPLETED": return "bg-emerald-100 text-emerald-700"  // GRÜN für Abgeschlossen
            case "CONFIRMED":
            case "CHANGED":  // Vereinfacht: Gleiche Farbe wie CONFIRMED
                return "bg-green-100 text-green-700"
            default:
                return "bg-gray-100 text-gray-700"
        }
    }

    const getStatusLabel = () => {
        // Priorität: Krank > Urlaub > Backup-Schicht > Normal
        if (timesheet.absenceType === "SICK") return "Krank"
        if (timesheet.absenceType === "VACATION") return "Urlaub"

        // Backup-Schicht (neue Note-Format)
        const isBackupShift = timesheet.note && timesheet.note.includes("Backup-Schicht anfallend")
        if (isBackupShift) {
            // Extrahiere Original-Mitarbeiter-Namen und Grund aus Note
            // Format: "Backup-Schicht anfallend wegen Krankheit von Maria Witton"
            const match = timesheet.note.match(/Backup-Schicht anfallend wegen (Krankheit|Urlaub) von (.+)/)
            if (match) {
                const reason = match[1] === "Krankheit" ? "Krank" : "Urlaub"
                const originalEmployeeName = match[2]
                return `Backup-Schicht (${originalEmployeeName} - ${reason})`
            }
            return "Backup-Schicht"
        }

        const status = getCurrentStatus()
        switch (status) {
            case "SUBMITTED": return "Eingereicht"
            case "COMPLETED": return "Abgeschlossen"  // Klient hat unterschrieben
            case "CONFIRMED": return isOptimistic ? "Wird bestätigt..." : "Bestätigt"
            case "CHANGED": return "Bestätigt"  // Vereinfacht: CHANGED = Bestätigt
            default: return isOptimistic ? "Wird zurückgesetzt..." : "Geplant"
        }
    }

    return (
        <div className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition-all ${isEditing ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-4">
                <div>
                    <p className="font-bold text-black">
                        {format(new Date(timesheet.date), "EEEE, dd.MM.", { locale: de })}
                    </p>
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold ${getStatusColor()}`}>
                        {getStatusLabel()}
                    </span>
                </div>
                <div className="text-right text-sm">
                    <p className="text-gray-900 font-bold">Plan</p>
                    <p className="font-black text-black">{formatTimeRange(timesheet.plannedStart, timesheet.plannedEnd)}</p>
                </div>
            </div>

            <div className="p-4">
                {!isEditing ? (
                    <div className="flex items-end justify-between">
                        <div className="space-y-1">
                            <p className="text-xs text-gray-900 uppercase tracking-tight font-black">Tatsächlich</p>
                            <p className="text-lg font-black text-black">
                                {timesheet.actualStart ? formatTimeRange(timesheet.actualStart, timesheet.actualEnd) : "-- : --"}
                            </p>
                        </div>

                        <div className="flex gap-2">
                            {timesheet.status === "PLANNED" && (
                                <button
                                    type="button"
                                    onClick={() => handleAction("CONFIRM")}
                                    disabled={loading || isOptimistic}
                                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:bg-green-400 transition-colors"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Bestätigen...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} />
                                            Bestätigen
                                        </>
                                    )}
                                </button>
                            )}
                            {(timesheet.status === "CONFIRMED" || timesheet.status === "CHANGED") && (
                                <button
                                    type="button"
                                    onClick={() => handleAction("UNCONFIRM")}
                                    disabled={loading || isOptimistic}
                                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:bg-amber-400 transition-colors"
                                >
                                    {loading && optimisticStatus === "PLANNED" ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Zurücksetzen...
                                        </>
                                    ) : (
                                        <>
                                            <RotateCcw size={16} />
                                            Zurücksetzen
                                        </>
                                    )}
                                </button>
                            )}
                            {timesheet.status !== "SUBMITTED" && timesheet.status !== "COMPLETED" && (
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
                                >
                                    <Edit3 size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-black uppercase">Beginn</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="08:00"
                                    value={editData.actualStart}
                                    onChange={e => {
                                        let val = e.target.value.replace(/[^0-9:]/g, '')
                                        if (val.length === 2 && !val.includes(':') && editData.actualStart.length < 2) {
                                            val = val + ':'
                                        }
                                        if (val.length <= 5) {
                                            setEditData({ ...editData, actualStart: val })
                                        }
                                    }}
                                    onBlur={e => {
                                        const val = e.target.value
                                        const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                        if (match) {
                                            const h = match[1].padStart(2, '0')
                                            const m = (match[2] || '00').padStart(2, '0')
                                            if (parseInt(h) <= 24 && parseInt(m) <= 59) {
                                                setEditData({ ...editData, actualStart: `${h}:${m}` })
                                            }
                                        }
                                    }}
                                    className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-black uppercase">Ende</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="16:00"
                                    value={editData.actualEnd}
                                    onChange={e => {
                                        let val = e.target.value.replace(/[^0-9:]/g, '')
                                        if (val.length === 2 && !val.includes(':') && editData.actualEnd.length < 2) {
                                            val = val + ':'
                                        }
                                        if (val.length <= 5) {
                                            setEditData({ ...editData, actualEnd: val })
                                        }
                                    }}
                                    onBlur={e => {
                                        const val = e.target.value
                                        const match = val.match(/^(\d{1,2}):?(\d{0,2})$/)
                                        if (match) {
                                            const h = match[1].padStart(2, '0')
                                            const m = (match[2] || '00').padStart(2, '0')
                                            if (parseInt(h) <= 24 && parseInt(m) <= 59) {
                                                setEditData({ ...editData, actualEnd: `${h}:${m}` })
                                            }
                                        }
                                    }}
                                    className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-black uppercase">Abwesenheit</label>
                            <select
                                value={editData.absenceType}
                                onChange={e => setEditData({ ...editData, absenceType: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="">Keine</option>
                                <option value="SICK">Krank</option>
                                {/* Urlaub-Option entfernt - Urlaub wird vom Admin im Dienstplan eingetragen */}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-black uppercase">Notiz</label>
                            <textarea
                                value={editData.note}
                                onChange={e => setEditData({ ...editData, note: e.target.value })}
                                placeholder="Optional..."
                                className="h-20 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => handleAction("UPDATE")}
                                disabled={loading}
                                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Speichern...
                                    </>
                                ) : (
                                    "Speichern"
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                disabled={loading}
                                className="rounded-xl border border-gray-200 px-6 py-2.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Abbruch
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
