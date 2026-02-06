"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { X, FileText, CheckCircle, AlertCircle, Loader2, Send, Users } from "lucide-react"
import SignaturePad from "./SignaturePad"
import { showToast } from "@/lib/toast-utils"

interface SubmitModalProps {
    isOpen: boolean
    onClose: () => void
    month: number
    year: number
    onSuccess: () => void
}

interface Employee {
    id: string
    name: string | null
    email: string
    signed?: boolean
}

interface SubmissionData {
    isTeamSubmission?: boolean
    totalCount?: number
    signedCount?: number
    allEmployees?: Employee[]
    signedEmployees?: Employee[]
    currentUserSigned?: boolean
    message?: string
}

interface TimesheetPreview {
    id?: string
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    shiftType?: string | null
    notes?: string | null
    team?: {
        client?: {
            firstName: string
            lastName: string
        }
    }
}

interface SignResponse {
    allSigned?: boolean
    totalCount?: number
    signedCount?: number
    pendingCount?: number
    message?: string
    warning?: string
    employees?: Employee[]
}

interface SubmissionApiResponse {
    submission: { id: string }
    error?: string
    isTeamSubmission?: boolean
    totalCount?: number
    signedCount?: number
    allEmployees?: Employee[]
    signedEmployees?: Employee[]
    currentUserSigned?: boolean
    message?: string
}

interface SignApiResponse {
    allSigned?: boolean
    totalCount?: number
    signedCount?: number
    pendingCount?: number
    message?: string
    warning?: string
    employees?: Employee[]
    error?: string
}

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

// Helper-Funktion ausserhalb der Komponente (keine State-Abhängigkeiten)
const calculateHours = (ts: { actualStart?: string | null; plannedStart?: string | null; actualEnd?: string | null; plannedEnd?: string | null }): number => {
    const start = ts.actualStart || ts.plannedStart
    const end = ts.actualEnd || ts.plannedEnd

    if (!start || !end) return 0

    const [startH, startM] = start.split(':').map(Number)
    const [endH, endM] = end.split(':').map(Number)

    const startMinutes = startH * 60 + startM
    let endMinutes = endH * 60 + endM

    // Handle overnight shifts
    if (endMinutes < startMinutes) {
        endMinutes += 24 * 60
    }

    return (endMinutes - startMinutes) / 60
}

export default function SubmitModal({ isOpen, onClose, month, year, onSuccess }: SubmitModalProps) {
    const { data: session } = useSession()
    const [step, setStep] = useState<"info" | "preview" | "signature" | "loading" | "success" | "error">("info")
    const [signature, setSignature] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [submissionId, setSubmissionId] = useState<string | null>(null)
    const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null)
    const [signResponse, setSignResponse] = useState<SignResponse | null>(null)
    const [timesheets, setTimesheets] = useState<TimesheetPreview[]>([])
    const [totalHours, setTotalHours] = useState(0)
    const [clientName, setClientName] = useState<string>("Klient")

    // Lade Timesheets beim Öffnen des Modals
    // WICHTIG: useEffect muss VOR dem early return stehen (React Hook Rules)
    useEffect(() => {
        const fetchTimesheetsForPreview = async () => {
            try {
                console.log("[SubmitModal] Fetching timesheets for preview...", { month, year })
                const res = await fetch(`/api/timesheets?month=${month}&year=${year}`)
                if (!res.ok) throw new Error("Fehler beim Laden")

                const data = await res.json()
                console.log("[SubmitModal] API Response:", data)
                const sheets = data.timesheets || []
                setTimesheets(sheets)

                // Berechne Gesamtstunden
                const total = sheets.reduce((sum: number, ts: TimesheetPreview) => {
                    const hours = calculateHours(ts)
                    return sum + hours
                }, 0)
                setTotalHours(total)

                // Extrahiere Client-Name aus erstem Timesheet via team.client
                if (sheets.length > 0) {
                    const client = sheets[0].team?.client
                    if (client && client.firstName && client.lastName) {
                        setClientName(`${client.firstName} ${client.lastName}`)
                    }
                }
                console.log("[SubmitModal] Timesheets loaded:", sheets.length, "Total hours:", total)
            } catch (error) {
                console.error("Fetch timesheets error:", error)
                setTimesheets([])
                setTotalHours(0)
            }
        }

        if (isOpen && month && year) {
            fetchTimesheetsForPreview()
        }
    }, [isOpen, month, year])

    // Early return NACH allen Hooks (React Hook Rules)
    if (!isOpen) return null

    const handleStartSignature = () => {
        // Gehe direkt zur Preview (ohne API-Call)
        setStep("preview")
    }

    const handleProceedToSignature = async () => {
        console.log("[SubmitModal] handleProceedToSignature - START", { month, year })
        setStep("loading")
        setError(null)

        try {
            // Create submission
            console.log("[SubmitModal] Calling POST /api/submissions...")
            const res = await fetch("/api/submissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, year })
            })

            console.log("[SubmitModal] Response status:", res.status, res.statusText)

            let data: SubmissionApiResponse
            try {
                const responseText = await res.text()
                console.log("[SubmitModal] Raw response text:", responseText.substring(0, 500))
                data = JSON.parse(responseText)
                console.log("[SubmitModal] Parsed response data:", data)
            } catch (parseError) {
                console.error("[SubmitModal] Failed to parse JSON response:", parseError)
                setError("Server-Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen.")
                setStep("error")
                return
            }

            if (!res.ok) {
                console.log("[SubmitModal] Response NOT OK - error:", data.error)
                setError(data.error || "Fehler beim Erstellen der Einreichung")
                setStep("error")
                return
            }

            console.log("[SubmitModal] Success! Submission ID:", data.submission?.id)
            setSubmissionId(data.submission.id)
            setSubmissionData(data)
            setStep("signature")
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err))
            console.error("[SubmitModal] CATCH block - Network/Fetch error:", error)
            console.error("[SubmitModal] Error name:", error.name)
            console.error("[SubmitModal] Error message:", error.message)
            console.error("[SubmitModal] Error stack:", error.stack)
            setError("Netzwerkfehler. Bitte erneut versuchen.")
            setStep("error")
        }
    }

    const handleSign = async () => {
        console.log("[SubmitModal] handleSign - START", { signature: signature ? "EXISTS" : "MISSING", submissionId })

        if (!signature || !submissionId) {
            console.log("[SubmitModal] handleSign - Missing signature or submissionId")
            showToast("error", "Bitte unterschreiben Sie zuerst")
            return
        }

        setStep("loading")

        try {
            console.log("[SubmitModal] Calling POST /api/submissions/sign...")
            const res = await fetch("/api/submissions/sign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    submissionId,
                    signature
                })
            })

            console.log("[SubmitModal] Sign response status:", res.status, res.statusText)

            let data: SignApiResponse
            try {
                const responseText = await res.text()
                console.log("[SubmitModal] Sign raw response text:", responseText.substring(0, 500))
                data = JSON.parse(responseText)
                console.log("[SubmitModal] Sign parsed response data:", data)
            } catch (parseError) {
                console.error("[SubmitModal] Failed to parse sign JSON response:", parseError)
                setError("Server-Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen.")
                setStep("error")
                return
            }

            if (!res.ok) {
                console.log("[SubmitModal] Sign response NOT OK - error:", data.error)
                setError(data.error || "Fehler beim Unterschreiben")
                setStep("error")
                return
            }

            console.log("[SubmitModal] Sign success!", data)

            if (data.warning) {
                console.log("[SubmitModal] Sign warning:", data.warning)
                showToast("warning", data.warning)
            }

            setSignResponse(data)
            setStep("success")

            // Show different toast types based on whether all team members signed
            if (data.allSigned) {
                // All team members signed - green success toast
                showToast("success", data.message || `Alle ${data.totalCount || ''} Teammitglieder haben unterschrieben! Der Klient wurde per E-Mail benachrichtigt.`)
            } else {
                // Not all signed yet - blue info toast
                showToast("info", data.message || `Erfolgreich unterschrieben! ${data.signedCount || 1} von ${data.totalCount || 1} Teammitgliedern haben unterschrieben.`)
            }

            // Parent component handles refresh via onSuccess() in handleClose()
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err))
            console.error("[SubmitModal] CATCH block - Sign Network/Fetch error:", error)
            console.error("[SubmitModal] Sign Error name:", error.name)
            console.error("[SubmitModal] Sign Error message:", error.message)
            console.error("[SubmitModal] Sign Error stack:", error.stack)
            setError("Netzwerkfehler. Bitte erneut versuchen.")
            setStep("error")
        }
    }

    const handleClose = () => {
        if (step === "success") {
            onSuccess()
        }
        setStep("info")
        setSignature(null)
        setError(null)
        setSubmissionId(null)
        setSubmissionData(null)
        setSignResponse(null)
        setTimesheets([])
        setTotalHours(0)
        setClientName("Klient")
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 bg-blue-600 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <FileText className="text-white" size={24} />
                        <div>
                            <h2 className="text-lg font-bold text-white">Monat Einreichen</h2>
                            <p className="text-sm text-blue-100">{MONTH_NAMES[month - 1]} {year}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {step === "info" && (
                        <div className="space-y-4">
                            <div className="rounded-xl bg-blue-50 p-4">
                                <h3 className="font-bold text-blue-900 mb-2">So funktioniert es:</h3>
                                <ol className="space-y-2 text-sm text-blue-800">
                                    <li className="flex gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-xs font-bold">1</span>
                                        <span>Sie prüfen Ihren Stundennachweis</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-xs font-bold">2</span>
                                        <span>Sie unterschreiben digital</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-xs font-bold">3</span>
                                        <span>Ihr Assistenznehmer erhält eine E-Mail zur Gegenzeichnung</span>
                                    </li>
                                </ol>
                            </div>

                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                                <div className="flex gap-2">
                                    <AlertCircle className="text-amber-600 shrink-0" size={20} />
                                    <p className="text-sm text-amber-800">
                                        <strong>Hinweis:</strong> Nach dem Einreichen können die Zeiten nicht mehr geändert werden.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleStartSignature}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 transition-colors"
                            >
                                <FileText size={18} />
                                Stundennachweis anzeigen
                            </button>
                        </div>
                    )}

                    {step === "preview" && (
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Stundennachweis-Vorschau
                                </h3>
                                <p className="text-sm text-gray-600">
                                    So wird Ihr Stundennachweis aussehen
                                </p>
                            </div>

                            {/* PDF-ähnliche Vorschau */}
                            <div className="bg-white text-black p-6 rounded-lg max-h-[500px] overflow-y-auto border border-gray-200 shadow-sm">
                                {/* Header-Section */}
                                <div className="flex justify-between mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold mb-1">Stundennachweis</h2>
                                        <p className="text-blue-600 font-medium">
                                            {session?.user?.name || "Mitarbeiter"}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-medium mb-1">
                                            {new Date(year, month - 1).toLocaleDateString('de-DE', {
                                                month: 'long',
                                                year: 'numeric'
                                            })}
                                        </p>
                                        <p className="text-orange-600 font-medium">
                                            {clientName}
                                        </p>
                                    </div>
                                </div>

                                {/* Tabelle */}
                                {timesheets.length > 0 ? (
                                    <>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b-2 border-gray-300">
                                                    <th className="text-left py-2 font-semibold">Datum</th>
                                                    <th className="text-left font-semibold">Beginn</th>
                                                    <th className="text-left font-semibold">Ende</th>
                                                    <th className="text-left font-semibold">Stunden</th>
                                                    <th className="text-left font-semibold">Typ</th>
                                                    <th className="text-left font-semibold">Bemerkung</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {timesheets.map((ts, index) => (
                                                    <tr key={ts.id || index} className="border-b border-gray-200">
                                                        <td className="py-2">
                                                            {new Date(ts.date).toLocaleDateString('de-DE', {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                weekday: 'short'
                                                            }).replace(',', '.')}
                                                        </td>
                                                        <td className="text-red-600 font-medium">
                                                            {ts.actualStart || ts.plannedStart || '-'}
                                                        </td>
                                                        <td className="text-red-600 font-medium">
                                                            {ts.actualEnd || ts.plannedEnd || '-'}
                                                        </td>
                                                        <td>{calculateHours(ts).toFixed(1)}</td>
                                                        <td>{ts.shiftType || ''}</td>
                                                        <td className="text-xs text-gray-600 max-w-[150px] truncate">
                                                            {ts.notes || ''}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {/* Gesamtstunden-Zeile */}
                                                <tr className="font-bold border-t-2 border-gray-300">
                                                    <td className="py-2">Gesamtstunden</td>
                                                    <td></td>
                                                    <td></td>
                                                    <td>{totalHours.toFixed(1)}</td>
                                                    <td></td>
                                                    <td></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </>
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        Keine Schichten für diesen Monat gefunden
                                    </div>
                                )}
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setStep("info")}
                                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
                                >
                                    Zurück
                                </button>
                                <button
                                    type="button"
                                    onClick={handleProceedToSignature}
                                    disabled={timesheets.length === 0}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Send size={18} />
                                    Weiter zur Unterschrift
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "signature" && (
                        <div className="space-y-4">
                            {/* Team Progress - Show if this is a team submission */}
                            {submissionData?.isTeamSubmission && submissionData.totalCount && submissionData.totalCount > 1 && (
                                <div className="rounded-xl bg-purple-50 border border-purple-200 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Users className="text-purple-600" size={20} />
                                        <h3 className="font-bold text-purple-900">
                                            Team-Einreichung
                                        </h3>
                                    </div>
                                    <p className="text-sm text-purple-800 mb-3">
                                        <strong>{submissionData.signedCount || 0} von {submissionData.totalCount}</strong> Teammitgliedern haben bereits unterschrieben.
                                    </p>
                                    <div className="space-y-1">
                                        {submissionData.allEmployees?.map((emp) => {
                                            const hasSigned = submissionData.signedEmployees?.some(se => se.id === emp.id)
                                            return (
                                                <div key={emp.id} className="flex items-center gap-2 text-sm">
                                                    {hasSigned ? (
                                                        <CheckCircle className="text-green-600" size={16} />
                                                    ) : (
                                                        <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                                                    )}
                                                    <span className={hasSigned ? "text-green-800 font-medium" : "text-gray-600"}>
                                                        {emp.name || emp.email}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <p className="text-sm text-gray-600 text-center">
                                Bitte unterschreiben Sie unten mit Ihrem Finger oder der Maus.
                            </p>

                            <SignaturePad
                                onSignatureChange={setSignature}
                                height={180}
                            />

                            <button
                                type="button"
                                onClick={handleSign}
                                disabled={!signature}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                <CheckCircle size={18} />
                                Unterschreiben & Einreichen
                            </button>
                        </div>
                    )}

                    {step === "loading" && (
                        <div className="py-12 text-center">
                            <Loader2 className="mx-auto animate-spin text-blue-600" size={48} />
                            <p className="mt-4 text-gray-600">Wird verarbeitet...</p>
                        </div>
                    )}

                    {step === "success" && (
                        <div className="py-8 text-center space-y-4">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                                <CheckCircle className="text-green-600" size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Erfolgreich unterschrieben!</h3>

                                {signResponse?.allSigned ? (
                                    // All employees have signed
                                    <div className="space-y-2">
                                        <p className="text-sm text-gray-600 mt-1">
                                            Ihr Team hat vollständig unterschrieben ({signResponse.totalCount} von {signResponse.totalCount} Mitarbeitern).
                                        </p>
                                        <p className="text-sm text-green-700 font-medium">
                                            Der Assistenznehmer wurde per E-Mail benachrichtigt und kann nun gegenzeichnen.
                                        </p>
                                    </div>
                                ) : (signResponse?.totalCount ?? 0) > 1 ? (
                                    // Not all employees have signed yet
                                    <div className="space-y-2">
                                        <p className="text-sm text-gray-600 mt-1">
                                            Ihre Unterschrift wurde gespeichert.
                                        </p>
                                        <p className="text-sm text-amber-700 font-medium">
                                            Warten auf {signResponse?.pendingCount || ((signResponse?.totalCount ?? 0) - (signResponse?.signedCount ?? 0))} weitere Teammitglieder.
                                        </p>
                                        <div className="rounded-lg bg-gray-50 p-3 mt-3 text-left">
                                            <p className="text-xs text-gray-500 mb-2">Status:</p>
                                            <div className="space-y-1">
                                                {signResponse?.employees?.map((emp: Employee) => (
                                                    <div key={emp.id} className="flex items-center gap-2 text-sm">
                                                        {emp.signed ? (
                                                            <CheckCircle className="text-green-600" size={14} />
                                                        ) : (
                                                            <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300" />
                                                        )}
                                                        <span className={emp.signed ? "text-green-800" : "text-gray-600"}>
                                                            {emp.name || emp.email}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // Fallback (single employee or old system)
                                    <p className="text-sm text-gray-600 mt-1">
                                        Ihr Assistenznehmer wurde per E-Mail benachrichtigt und kann nun gegenzeichnen.
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="w-full rounded-xl bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                            >
                                Schließen
                            </button>
                        </div>
                    )}

                    {step === "error" && (
                        <div className="py-8 text-center space-y-4">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                                <AlertCircle className="text-red-600" size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Fehler</h3>
                                <p className="text-sm text-red-600 mt-1">{error}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setStep("info")}
                                    className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                                >
                                    Erneut versuchen
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 rounded-xl border border-gray-200 py-3 font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
