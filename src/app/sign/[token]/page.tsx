"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { FileText, CheckCircle, AlertCircle, Loader2, Clock, User, Download } from "lucide-react"
import SignaturePad from "@/components/SignaturePad"
import { showToast } from "@/lib/toast-utils"
import { WORKED_TIMESHEET_STATUSES } from "@/lib/constants"

interface SubmissionData {
    id: string
    month: number
    year: number
    status: string
    sheetFileName: string
    recipientName: string
    pdfUrl?: string
}

interface EmployeeSignature {
    employeeId: string
    employeeName: string
    employeeEmail: string
    signature: string
    signedAt: string
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
    employeeId: string
    employee: {
        name: string
        email: string
    }
}

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
}

function formatTime(start: string | null, end: string | null): string {
    if (!start || !end) return "-"
    // Normalize end time: 0:00 → 24:00 for display
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
    // Handle 24-hour shifts (0:00 to 0:00 = 24 hours, not 0 hours)
    if (diff === 0 && startH === 0 && startM === 0 && endH === 0 && endM === 0) {
        diff = 24 * 60
    }
    return diff / 60
}

export default function SignPage() {
    const params = useParams()
    const token = params.token as string

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [submission, setSubmission] = useState<SubmissionData | null>(null)
    const [employeeSignatures, setEmployeeSignatures] = useState<EmployeeSignature[]>([])
    const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
    const [signature, setSignature] = useState<string | null>(null)
    const [signing, setSigning] = useState(false)
    const [completed, setCompleted] = useState(false)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!token) return

        async function fetchData() {
            try {
                const res = await fetch(`/api/sign/${token}`)
                const data = await res.json()

                if (!res.ok) {
                    setError(data.error || "Fehler beim Laden")
                    if (data.pdfUrl) {
                        setPdfUrl(data.pdfUrl)
                    }
                    setLoading(false)
                    return
                }

                setSubmission(data.submission)
                setEmployeeSignatures(data.employeeSignatures || [])
                setTimesheets(data.timesheets || [])
                setLoading(false)
            } catch (err) {
                console.error(err)
                setError("Netzwerkfehler. Bitte später erneut versuchen.")
                setLoading(false)
            }
        }

        fetchData()
    }, [token])

    const handleSign = async () => {
        if (!signature) {
            showToast("warning", "Bitte unterschreiben Sie zuerst")
            return
        }

        setSigning(true)

        try {
            const res = await fetch(`/api/sign/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signature })
            })

            const data = await res.json()

            if (!res.ok) {
                showToast("error", data.error || "Fehler beim Unterschreiben")
                setError(data.error || "Fehler beim Unterschreiben")
                setSigning(false)
                return
            }

            setPdfUrl(data.pdfUrl)
            setCompleted(true)
            showToast("success", "Erfolgreich unterschrieben!")
        } catch (err) {
            console.error(err)
            showToast("error", "Netzwerkfehler. Bitte erneut versuchen.")
            setError("Netzwerkfehler. Bitte erneut versuchen.")
        } finally {
            setSigning(false)
        }
    }

    // Group timesheets by employee
    const employeeStats = new Map<string, {
        name: string
        workDays: number
        totalHours: number
        sickDays: number
        vacationDays: number
        hasSigned: boolean
    }>()

    for (const ts of timesheets) {
        if (!employeeStats.has(ts.employeeId)) {
            const hasSigned = employeeSignatures.some(sig => sig.employeeId === ts.employeeId)
            employeeStats.set(ts.employeeId, {
                name: ts.employee.name,
                workDays: 0,
                totalHours: 0,
                sickDays: 0,
                vacationDays: 0,
                hasSigned
            })
        }

        const emp = employeeStats.get(ts.employeeId)!

        if (ts.absenceType === "SICK") {
            emp.sickDays++
        } else if (ts.absenceType === "VACATION") {
            emp.vacationDays++
        } else if (ts.actualStart && ts.actualEnd) {
            emp.workDays++
            emp.totalHours += calculateHours(ts.actualStart, ts.actualEnd)
        } else if (ts.plannedStart && ts.plannedEnd && ([...WORKED_TIMESHEET_STATUSES] as string[]).includes(ts.status)) {
            emp.workDays++
            emp.totalHours += calculateHours(ts.plannedStart, ts.plannedEnd)
        }
    }

    const employeeArray = Array.from(employeeStats.values())

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
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
                <div className="bg-neutral-900 rounded-2xl shadow-xl p-8 text-center border border-neutral-800">
                    <Loader2 className="animate-spin text-violet-400 mx-auto" size={48} />
                    <p className="mt-4 text-neutral-400">Laden...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error && !completed) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
                <div className="bg-neutral-900 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-neutral-800">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-900/30 mb-4">
                        <AlertCircle className="text-red-400" size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Fehler</h1>
                    <p className="text-neutral-400 mb-6">{error}</p>
                    {pdfUrl && (
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 transition-colors"
                        >
                            <Download size={18} />
                            PDF herunterladen
                        </a>
                    )}
                </div>
            </div>
        )
    }

    // Success/Completed state
    if (completed) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
                <div className="bg-neutral-900 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-neutral-800">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-900/30 mb-4">
                        <CheckCircle className="text-green-400" size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Erfolgreich unterschrieben!</h1>
                    <p className="text-neutral-400 mb-6">
                        Der Stundennachweis wurde erfolgreich gegengezeichnet.
                        Alle Beteiligten erhalten eine Bestätigungs-E-Mail mit dem finalen PDF.
                    </p>
                    {pdfUrl && (
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-violet-600 py-3 px-4 font-semibold text-white hover:bg-violet-700 transition-colors"
                        >
                            <Download size={18} />
                            PDF herunterladen
                        </a>
                    )}
                </div>
            </div>
        )
    }

    // Main signing view
    return (
        <div className="min-h-screen bg-neutral-950 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600 to-violet-700 rounded-2xl shadow-xl p-6 text-white">
                    <div className="flex items-center gap-3 mb-4">
                        <FileText size={28} />
                        <div>
                            <h1 className="text-xl font-bold">Stundennachweis zur Unterschrift</h1>
                            <p className="text-violet-100">
                                {submission && `${MONTH_NAMES[submission.month - 1]} ${submission.year}`}
                            </p>
                        </div>
                    </div>

                    {submission && (
                        <div className="mt-4 pt-4 border-t border-white/20">
                            <div className="flex items-center gap-2">
                                <User size={16} className="text-violet-200" />
                                <div>
                                    <p className="text-xs text-violet-200">Team</p>
                                    <p className="font-medium">{submission.sheetFileName}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Employee Overview */}
                <div className="bg-neutral-900 rounded-2xl shadow-xl overflow-hidden border border-neutral-800">
                    <div className="p-4 border-b border-neutral-800">
                        <h2 className="font-bold text-white">Mitarbeiter-Übersicht</h2>
                        <p className="text-sm text-neutral-400">
                            {employeeArray.length} Mitarbeiter im Team
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-neutral-800/50">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-neutral-400">Mitarbeiter</th>
                                    <th className="text-center px-4 py-3 font-semibold text-neutral-400">Arbeitstage</th>
                                    <th className="text-center px-4 py-3 font-semibold text-neutral-400">Stunden</th>
                                    <th className="text-center px-4 py-3 font-semibold text-neutral-400">Krank</th>
                                    <th className="text-center px-4 py-3 font-semibold text-neutral-400">Urlaub</th>
                                    <th className="text-center px-4 py-3 font-semibold text-neutral-400">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {employeeArray.map((emp, idx) => (
                                    <tr key={idx} className="hover:bg-neutral-800/30 transition-colors">
                                        <td className="px-4 py-3 font-medium text-white">{emp.name}</td>
                                        <td className="px-4 py-3 text-center text-neutral-400">{emp.workDays}</td>
                                        <td className="px-4 py-3 text-center text-white font-semibold">
                                            {emp.totalHours.toFixed(1)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-neutral-400">{emp.sickDays}</td>
                                        <td className="px-4 py-3 text-center text-neutral-400">{emp.vacationDays}</td>
                                        <td className="px-4 py-3 text-center">
                                            {emp.hasSigned ? (
                                                <span className="text-green-400 font-semibold">✓</span>
                                            ) : (
                                                <span className="text-neutral-600">○</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {/* Total row */}
                                <tr className="bg-violet-900/20 font-bold">
                                    <td className="px-4 py-3 text-white">GESAMT</td>
                                    <td className="px-4 py-3 text-center text-white">
                                        {employeeArray.reduce((sum, e) => sum + e.workDays, 0)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-white">
                                        {employeeArray.reduce((sum, e) => sum + e.totalHours, 0).toFixed(1)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-white">
                                        {employeeArray.reduce((sum, e) => sum + e.sickDays, 0)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-white">
                                        {employeeArray.reduce((sum, e) => sum + e.vacationDays, 0)}
                                    </td>
                                    <td className="px-4 py-3"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="bg-neutral-900 rounded-2xl shadow-xl p-6 border border-neutral-800">
                    <h2 className="font-bold text-white mb-4">Zusammenfassung</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-violet-900/30 rounded-xl p-4 text-center border border-violet-800/30">
                            <p className="text-2xl font-bold text-violet-400">{stats.totalHours.toFixed(1)}</p>
                            <p className="text-xs text-violet-300">Stunden</p>
                        </div>
                        <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-800/30">
                            <p className="text-2xl font-bold text-green-400">{stats.workDays}</p>
                            <p className="text-xs text-green-300">Arbeitstage</p>
                        </div>
                        <div className="bg-amber-900/30 rounded-xl p-4 text-center border border-amber-800/30">
                            <p className="text-2xl font-bold text-amber-400">{stats.sickDays}</p>
                            <p className="text-xs text-amber-300">Krankheitstage</p>
                        </div>
                        <div className="bg-purple-900/30 rounded-xl p-4 text-center border border-purple-800/30">
                            <p className="text-2xl font-bold text-purple-400">{stats.vacationDays}</p>
                            <p className="text-xs text-purple-300">Urlaubstage</p>
                        </div>
                    </div>
                </div>

                {/* Timesheet Table */}
                <div className="bg-neutral-900 rounded-2xl shadow-xl overflow-hidden border border-neutral-800">
                    <div className="p-4 border-b border-neutral-800">
                        <h2 className="font-bold text-white">Tagesübersicht</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-neutral-800/50">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-neutral-400">Mitarbeiter</th>
                                    <th className="text-left px-4 py-3 font-semibold text-neutral-400">Datum</th>
                                    <th className="text-left px-4 py-3 font-semibold text-neutral-400">Soll</th>
                                    <th className="text-left px-4 py-3 font-semibold text-neutral-400">Ist</th>
                                    <th className="text-left px-4 py-3 font-semibold text-neutral-400">Notiz</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {timesheets.map((ts, idx) => (
                                    <tr key={idx} className="hover:bg-neutral-800/30 transition-colors">
                                        <td className="px-4 py-2 text-neutral-400 text-xs">{ts.employee.name}</td>
                                        <td className="px-4 py-2 font-medium text-white">
                                            {formatDate(ts.date)}
                                        </td>
                                        <td className="px-4 py-2 text-neutral-400">
                                            {formatTime(ts.plannedStart, ts.plannedEnd)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {ts.absenceType === "SICK" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 text-xs font-medium border border-amber-800/50">
                                                    Krank
                                                </span>
                                            ) : ts.absenceType === "VACATION" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 text-xs font-medium border border-purple-800/50">
                                                    Urlaub
                                                </span>
                                            ) : ts.actualStart && ts.actualEnd ? (
                                                <span className="text-white">{formatTime(ts.actualStart, ts.actualEnd)}</span>
                                            ) : ([...WORKED_TIMESHEET_STATUSES] as string[]).includes(ts.status) ? (
                                                <span className="text-neutral-400">{formatTime(ts.plannedStart, ts.plannedEnd)}</span>
                                            ) : (
                                                <span className="text-neutral-600">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-neutral-500 text-xs truncate max-w-[150px]">
                                            {ts.note || "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Signature Section */}
                <div className="bg-neutral-900 rounded-2xl shadow-xl p-6 border border-neutral-800">
                    <h2 className="font-bold text-white mb-2">Ihre Unterschrift</h2>
                    <p className="text-sm text-neutral-400 mb-4">
                        Bitte unterschreiben Sie unten mit Ihrem Finger oder der Maus, um den Stundennachweis zu bestätigen.
                    </p>

                    <SignaturePad
                        onSignatureChange={setSignature}
                        height={180}
                    />

                    <div className="mt-4 p-4 bg-amber-900/20 border border-amber-800/30 rounded-xl">
                        <div className="flex gap-2">
                            <Clock className="text-amber-400 shrink-0" size={20} />
                            <p className="text-sm text-amber-300">
                                <strong>Hinweis:</strong> Mit Ihrer Unterschrift bestätigen Sie die Richtigkeit der oben aufgeführten Arbeitszeiten.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSign}
                        disabled={!signature || signing}
                        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 px-4 font-bold text-white hover:bg-green-700 transition-colors disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    >
                        {signing ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Wird verarbeitet...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} />
                                Unterschreiben & Bestätigen
                            </>
                        )}
                    </button>
                </div>

                {/* Footer */}
                <p className="text-center text-sm text-neutral-500">
                    Dienstplan App - Automatisch generierte Seite
                </p>
            </div>
        </div>
    )
}
