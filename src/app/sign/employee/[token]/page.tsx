"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { FileText, CheckCircle, AlertCircle, Loader2, Clock, User, Calendar } from "lucide-react"
import SignaturePad from "@/components/SignaturePad"
import { showToast } from "@/lib/toast-utils"
import { WORKED_TIMESHEET_STATUSES } from "@/lib/constants"

interface EmployeeData {
    id: string
    name: string
    email: string
}

interface SubmissionData {
    id: string
    month: number
    year: number
    sheetFileName: string
    clientName: string
    status: string
}

interface TimesheetEntry {
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    absenceType: string | null
    note: string | null
    status: string
}

interface SignatureProgress {
    signed: number
    total: number
}

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
}

function formatTime(start: string | null, end: string | null): string {
    if (!start || !end) return "-"
    let displayEnd = end
    if (end === "0:00" || end === "00:00") {
        displayEnd = "24:00"
    }
    return `${start} - ${displayEnd}`
}

function calculateHours(start: string | null, end: string | null): number {
    if (!start || !end) return 0
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)
    let diff = (endH * 60 + endM) - (startH * 60 + startM)
    if (diff < 0) diff += 24 * 60
    if (diff === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
        diff = 24 * 60
    }
    return diff / 60
}

export default function EmployeeSignPage() {
    const params = useParams()
    const token = params.token as string

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [employee, setEmployee] = useState<EmployeeData | null>(null)
    const [submission, setSubmission] = useState<SubmissionData | null>(null)
    const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
    const [progress, setProgress] = useState<SignatureProgress | null>(null)
    const [signature, setSignature] = useState<string | null>(null)
    const [signing, setSigning] = useState(false)
    const [completed, setCompleted] = useState(false)
    const [allSigned, setAllSigned] = useState(false)

    useEffect(() => {
        if (!token) return

        async function fetchData() {
            try {
                const res = await fetch(`/api/sign/employee/${token}`)
                const data = await res.json()

                if (!res.ok) {
                    setError(data.error || "Fehler beim Laden")
                    setLoading(false)
                    return
                }

                setEmployee(data.employee)
                setSubmission(data.submission)
                setTimesheets(data.timesheets || [])
                setProgress(data.signatureProgress)
                setLoading(false)
            } catch (err) {
                console.error(err)
                setError("Netzwerkfehler. Bitte spaeter erneut versuchen.")
                setLoading(false)
            }
        }

        fetchData()
    }, [token])

    const handleSign = async () => {
        if (!signature) {
            showToast("error", "Bitte unterschreibe zuerst")
            return
        }

        setSigning(true)

        try {
            const res = await fetch(`/api/sign/employee/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signature })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Fehler beim Unterschreiben")
                setSigning(false)
                return
            }

            setAllSigned(data.allEmployeesSigned)
            setCompleted(true)
        } catch (err) {
            console.error(err)
            setError("Netzwerkfehler. Bitte erneut versuchen.")
        } finally {
            setSigning(false)
        }
    }

    // Calculate stats from timesheets
    const stats = {
        totalHours: 0,
        sickDays: 0,
        vacationDays: 0,
        workDays: 0
    }

    for (const ts of timesheets) {
        if (ts.absenceType === "SICK") {
            stats.sickDays++
        } else if (ts.absenceType === "VACATION") {
            stats.vacationDays++
        } else if (ts.actualStart && ts.actualEnd) {
            stats.totalHours += calculateHours(ts.actualStart, ts.actualEnd)
            stats.workDays++
        } else if (ts.plannedStart && ts.plannedEnd && ([...WORKED_TIMESHEET_STATUSES] as string[]).includes(ts.status)) {
            stats.totalHours += calculateHours(ts.plannedStart, ts.plannedEnd)
            stats.workDays++
        }
    }

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                    <Loader2 className="animate-spin text-violet-600 mx-auto" size={48} />
                    <p className="mt-4 text-gray-600">Laden...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error && !completed) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
                        <AlertCircle className="text-red-600" size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Fehler</h1>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        )
    }

    // Success/Completed state
    if (completed) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                        <CheckCircle className="text-green-600" size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Erfolgreich unterschrieben!</h1>
                    <p className="text-gray-600 mb-4">
                        Deine Unterschrift wurde erfolgreich gespeichert.
                    </p>
                    {allSigned ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <p className="text-green-800 text-sm">
                                <strong>Alle Mitarbeiter haben unterschrieben!</strong><br />
                                Der Assistenznehmer wird nun per E-Mail benachrichtigt.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-amber-800 text-sm">
                                Es fehlen noch Unterschriften von anderen Mitarbeitern.
                                Sobald alle unterschrieben haben, wird der Assistenznehmer benachrichtigt.
                            </p>
                        </div>
                    )}
                    <p className="mt-4 text-gray-500 text-sm">
                        Du erhaeltst eine Bestaetigungs-E-Mail.
                    </p>
                </div>
            </div>
        )
    }

    // Main signing view
    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600 to-violet-700 rounded-2xl shadow-xl p-6 text-white">
                    <div className="flex items-center gap-3 mb-4">
                        <FileText size={28} />
                        <div>
                            <h1 className="text-xl font-bold">Stundennachweis unterschreiben</h1>
                            <p className="text-violet-100">
                                {submission && `${MONTH_NAMES[submission.month - 1]} ${submission.year}`}
                            </p>
                        </div>
                    </div>

                    {employee && submission && (
                        <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                                <User size={16} className="text-violet-200" />
                                <div>
                                    <p className="text-xs text-violet-200">Mitarbeiter</p>
                                    <p className="font-medium">{employee.name || employee.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-violet-200" />
                                <div>
                                    <p className="text-xs text-violet-200">Klient</p>
                                    <p className="font-medium">{submission.clientName}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {progress && (
                        <div className="mt-4 pt-4 border-t border-white/20">
                            <p className="text-sm text-violet-200">
                                Unterschriften: {progress.signed} von {progress.total} Mitarbeitern
                            </p>
                            <div className="mt-2 h-2 bg-violet-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-white transition-all duration-300"
                                    style={{ width: `${(progress.signed / progress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary Stats */}
                <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h2 className="font-bold text-gray-900 mb-4">Deine Stunden</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-violet-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-violet-700">{stats.totalHours.toFixed(1)}</p>
                            <p className="text-xs text-violet-600">Stunden</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-green-700">{stats.workDays}</p>
                            <p className="text-xs text-green-600">Arbeitstage</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-amber-700">{stats.sickDays}</p>
                            <p className="text-xs text-amber-600">Krankheitstage</p>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-purple-700">{stats.vacationDays}</p>
                            <p className="text-xs text-purple-600">Urlaubstage</p>
                        </div>
                    </div>
                </div>

                {/* Timesheet Table */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="font-bold text-gray-900">Tagesuebersicht</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Soll</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ist</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Notiz</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {timesheets.map((ts, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-900">
                                            {formatDate(ts.date)}
                                        </td>
                                        <td className="px-4 py-2 text-gray-600">
                                            {formatTime(ts.plannedStart, ts.plannedEnd)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {ts.absenceType === "SICK" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium">
                                                    Krank
                                                </span>
                                            ) : ts.absenceType === "VACATION" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs font-medium">
                                                    Urlaub
                                                </span>
                                            ) : ts.actualStart && ts.actualEnd ? (
                                                <span className="text-gray-900">{formatTime(ts.actualStart, ts.actualEnd)}</span>
                                            ) : ([...WORKED_TIMESHEET_STATUSES] as string[]).includes(ts.status) ? (
                                                <span className="text-gray-600">{formatTime(ts.plannedStart, ts.plannedEnd)}</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[150px]">
                                            {ts.note || "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Signature Section */}
                <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h2 className="font-bold text-gray-900 mb-2">Deine Unterschrift</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Bitte unterschreibe unten mit deinem Finger oder der Maus, um deine Stunden zu bestaetigen.
                    </p>

                    <SignaturePad
                        onSignatureChange={setSignature}
                        height={180}
                    />

                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex gap-2">
                            <Clock className="text-amber-600 shrink-0" size={20} />
                            <p className="text-sm text-amber-800">
                                <strong>Hinweis:</strong> Mit deiner Unterschrift bestaetigst du die Richtigkeit der oben aufgefuehrten Arbeitszeiten.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSign}
                        disabled={!signature || signing}
                        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 px-4 font-bold text-white hover:bg-violet-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {signing ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Wird verarbeitet...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} />
                                Unterschreiben
                            </>
                        )}
                    </button>
                </div>

                {/* Footer */}
                <p className="text-center text-sm text-gray-500">
                    Dienstplan App - Automatisch generierte Seite
                </p>
            </div>
        </div>
    )
}
