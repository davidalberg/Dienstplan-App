"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { FileText, CheckCircle, AlertCircle, Loader2, Clock, User, Calendar, Download } from "lucide-react"
import SignaturePad from "@/components/SignaturePad"

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
    return `${start} - ${end}`
}

function calculateHours(start: string | null, end: string | null): number {
    if (!start || !end) return 0
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)
    let diff = (endH * 60 + endM) - (startH * 60 + startM)
    if (diff < 0) diff += 24 * 60
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
            alert("Bitte unterschreiben Sie zuerst")
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
                setError(data.error || "Fehler beim Unterschreiben")
                setSigning(false)
                return
            }

            setPdfUrl(data.pdfUrl)
            setCompleted(true)
        } catch (err) {
            console.error(err)
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
        } else if (ts.plannedStart && ts.plannedEnd && ["CONFIRMED", "CHANGED", "SUBMITTED"].includes(ts.status)) {
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
        } else if (ts.plannedStart && ts.plannedEnd && ["CONFIRMED", "CHANGED", "SUBMITTED"].includes(ts.status)) {
            stats.totalHours += calculateHours(ts.plannedStart, ts.plannedEnd)
            stats.workDays++
        }
    }

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                    <Loader2 className="animate-spin text-blue-600 mx-auto" size={48} />
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
                    <p className="text-gray-600 mb-6">{error}</p>
                    {pdfUrl && (
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
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
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                        <CheckCircle className="text-green-600" size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Erfolgreich unterschrieben!</h1>
                    <p className="text-gray-600 mb-6">
                        Der Stundennachweis wurde erfolgreich gegengezeichnet.
                        Beide Parteien erhalten eine Bestätigungs-E-Mail mit dem finalen PDF.
                    </p>
                    {pdfUrl && (
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 py-3 px-4 font-semibold text-white hover:bg-blue-700 transition-colors"
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
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-xl p-6 text-white">
                    <div className="flex items-center gap-3 mb-4">
                        <FileText size={28} />
                        <div>
                            <h1 className="text-xl font-bold">Stundennachweis zur Unterschrift</h1>
                            <p className="text-blue-100">
                                {submission && `${MONTH_NAMES[submission.month - 1]} ${submission.year}`}
                            </p>
                        </div>
                    </div>

                    {submission && (
                        <div className="mt-4 pt-4 border-t border-white/20">
                            <div className="flex items-center gap-2">
                                <User size={16} className="text-blue-200" />
                                <div>
                                    <p className="text-xs text-blue-200">Team</p>
                                    <p className="font-medium">{submission.sheetFileName}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Employee Overview - NEW */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="font-bold text-gray-900">Mitarbeiter-Übersicht</h2>
                        <p className="text-sm text-gray-600">
                            {employeeArray.length} Mitarbeiter im Team
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Mitarbeiter</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Arbeitstage</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Stunden</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Krank</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Urlaub</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {employeeArray.map((emp, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                                        <td className="px-4 py-3 text-center text-gray-600">{emp.workDays}</td>
                                        <td className="px-4 py-3 text-center text-gray-900 font-semibold">
                                            {emp.totalHours.toFixed(1)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-600">{emp.sickDays}</td>
                                        <td className="px-4 py-3 text-center text-gray-600">{emp.vacationDays}</td>
                                        <td className="px-4 py-3 text-center">
                                            {emp.hasSigned ? (
                                                <span className="text-green-600 font-semibold">✓</span>
                                            ) : (
                                                <span className="text-gray-400">○</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {/* Total row */}
                                <tr className="bg-blue-50 font-bold">
                                    <td className="px-4 py-3 text-gray-900">GESAMT</td>
                                    <td className="px-4 py-3 text-center text-gray-900">
                                        {employeeArray.reduce((sum, e) => sum + e.workDays, 0)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-900">
                                        {employeeArray.reduce((sum, e) => sum + e.totalHours, 0).toFixed(1)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-900">
                                        {employeeArray.reduce((sum, e) => sum + e.sickDays, 0)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-900">
                                        {employeeArray.reduce((sum, e) => sum + e.vacationDays, 0)}
                                    </td>
                                    <td className="px-4 py-3"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h2 className="font-bold text-gray-900 mb-4">Zusammenfassung</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-blue-700">{stats.totalHours.toFixed(1)}</p>
                            <p className="text-xs text-blue-600">Stunden</p>
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
                        <h2 className="font-bold text-gray-900">Tagesübersicht</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Mitarbeiter</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Soll</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ist</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Notiz</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {timesheets.map((ts, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-600 text-xs">{ts.employee.name}</td>
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
                                            ) : ["CONFIRMED", "CHANGED", "SUBMITTED"].includes(ts.status) ? (
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
                    <h2 className="font-bold text-gray-900 mb-2">Ihre Unterschrift</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Bitte unterschreiben Sie unten mit Ihrem Finger oder der Maus, um den Stundennachweis zu bestätigen.
                    </p>

                    <SignaturePad
                        onSignatureChange={setSignature}
                        height={180}
                    />

                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex gap-2">
                            <Clock className="text-amber-600 shrink-0" size={20} />
                            <p className="text-sm text-amber-800">
                                <strong>Hinweis:</strong> Mit Ihrer Unterschrift bestätigen Sie die Richtigkeit der oben aufgeführten Arbeitszeiten.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSign}
                        disabled={!signature || signing}
                        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 px-4 font-bold text-white hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
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
                <p className="text-center text-sm text-gray-500">
                    Dienstplan App - Automatisch generierte Seite
                </p>
            </div>
        </div>
    )
}
