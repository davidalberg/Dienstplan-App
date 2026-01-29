"use client"

import { useState, useEffect } from "react"
import { Send, Clock, CheckCircle, X, AlertCircle, FileSignature, Undo2, Lock } from "lucide-react"
import { calculateTotalHoursFromTimesheets } from "@/lib/time-utils"
import SubmitModal from "./SubmitModal"

interface SubmissionStatus {
    hasSubmission: boolean
    submissionId?: string
    employeeSigned: boolean
    clientSigned: boolean
    submissionStatus: string | null
    canWithdraw: boolean
    totalEmployees: number
    signedEmployees: number
    employeeSignedAt?: string
}

interface MonthlySummaryProps {
    timesheets: any[]
    onRefresh: () => void
    month?: number
    year?: number
}

export default function MonthlySummary({ timesheets, onRefresh, month, year }: MonthlySummaryProps) {
    const [loading, setLoading] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [withdrawing, setWithdrawing] = useState(false)
    const [error, setError] = useState("")
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null)
    const [statusLoading, setStatusLoading] = useState(false)

    // Sichere Extraktion von month/year mit Fallback auf Props
    const currentMonth = timesheets.length > 0 ? timesheets[0].month : month
    const currentYear = timesheets.length > 0 ? timesheets[0].year : year

    // Fetch submission status when month/year changes
    useEffect(() => {
        if (currentMonth && currentYear) {
            fetchSubmissionStatus()
        }
    }, [currentMonth, currentYear])

    const fetchSubmissionStatus = async () => {
        if (!currentMonth || !currentYear) return

        setStatusLoading(true)
        try {
            const res = await fetch(`/api/submissions/status?month=${currentMonth}&year=${currentYear}`)
            if (res.ok) {
                const contentType = res.headers.get("content-type")
                if (contentType && contentType.includes("application/json")) {
                    try {
                        const data = await res.json()
                        setSubmissionStatus(data)
                    } catch (parseError) {
                        console.error("Failed to parse submission status JSON:", parseError)
                    }
                }
            }
        } catch (err) {
            console.error("Failed to fetch submission status:", err)
        } finally {
            setStatusLoading(false)
        }
    }

    const calculateTotalHours = () => {
        return calculateTotalHoursFromTimesheets(timesheets)
    }

    const isReadyToSubmit = () => {
        const plannedDays = timesheets.filter(ts => ts.plannedStart)
        if (plannedDays.length === 0) return false
        return plannedDays.every(ts => ts.status !== "PLANNED" && ts.status !== "SUBMITTED")
    }

    const isAlreadySubmitted = () => {
        return timesheets.length > 0 && timesheets.every(ts => ts.status === "SUBMITTED")
    }

    const handleOpenSubmitModal = () => {
        // Doppelte Sicherheitspruefung
        if (!currentMonth || !currentYear) {
            setError("Keine Zeiterfassungen vorhanden")
            return
        }
        setShowSubmitModal(true)
    }

    const handleSubmitSuccess = () => {
        onRefresh()
        fetchSubmissionStatus()
    }

    const handleCancelSubmit = async () => {
        // Doppelte Sicherheitspruefung
        if (!currentMonth || !currentYear) {
            setError("Keine Zeiterfassungen vorhanden")
            return
        }

        if (!confirm("Moechten Sie die Einreichung wirklich rueckgaengig machen? Sie koennen den Monat dann erneut bearbeiten.")) return

        setCancelling(true)
        setError("")

        try {
            const res = await fetch("/api/timesheets/cancel-submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month: currentMonth,
                    year: currentYear,
                })
            })

            // Sicheres Parsen der Response
            let data: { error?: string } = {}
            const contentType = res.headers.get("content-type")
            if (contentType && contentType.includes("application/json")) {
                try {
                    data = await res.json()
                } catch (parseError) {
                    console.error("Failed to parse JSON response:", parseError)
                    if (!res.ok) {
                        setError("Serverfehler: Ungueltige Antwort vom Server")
                        return
                    }
                }
            } else if (!res.ok) {
                setError("Serverfehler: Der Server hat einen unerwarteten Fehler zurueckgegeben")
                return
            }

            if (!res.ok) {
                setError(data.error || "Abbruch fehlgeschlagen")
            } else {
                try {
                    onRefresh()
                    await fetchSubmissionStatus()
                } catch (refreshError) {
                    console.error("Failed to refresh after cancel:", refreshError)
                }
            }
        } catch (err) {
            console.error("Cancel submit error:", err)
            setError("Netzwerkfehler: Bitte pruefen Sie Ihre Internetverbindung")
        } finally {
            setCancelling(false)
        }
    }

    const handleWithdrawSignature = async () => {
        if (!currentMonth || !currentYear) {
            setError("Keine Zeiterfassungen vorhanden")
            return
        }

        // Confirmation dialog
        const confirmed = confirm(
            "Moechten Sie Ihre Unterschrift wirklich zurueckziehen?\n\n" +
            "Sie koennen danach Aenderungen vornehmen und erneut einreichen."
        )

        if (!confirmed) return

        setWithdrawing(true)
        setError("")

        try {
            const res = await fetch("/api/submissions/withdraw", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month: currentMonth,
                    year: currentYear,
                })
            })

            // Sicheres Parsen der Response - pruefe zuerst ob JSON
            let data: { error?: string; code?: string; success?: boolean; message?: string } = {}
            const contentType = res.headers.get("content-type")
            if (contentType && contentType.includes("application/json")) {
                try {
                    data = await res.json()
                } catch (parseError) {
                    console.error("Failed to parse JSON response:", parseError)
                    setError("Serverfehler: Ungueltige Antwort vom Server")
                    return
                }
            } else {
                // Server hat kein JSON zurueckgegeben (z.B. HTML Fehlerseite)
                console.error("Server returned non-JSON response:", contentType)
                setError("Serverfehler: Der Server hat einen unerwarteten Fehler zurueckgegeben")
                return
            }

            if (!res.ok) {
                if (data.code === "RECIPIENT_ALREADY_SIGNED") {
                    setError("Der Assistenznehmer hat bereits unterschrieben. Sie koennen Ihre Unterschrift nicht mehr zurueckziehen.")
                } else if (data.code === "SUBMISSION_COMPLETED") {
                    setError("Diese Einreichung ist bereits abgeschlossen.")
                } else {
                    setError(data.error || "Zurueckziehen fehlgeschlagen")
                }
            } else {
                // Success - refresh data
                try {
                    onRefresh()
                    await fetchSubmissionStatus()
                } catch (refreshError) {
                    console.error("Failed to refresh after withdraw:", refreshError)
                    // Trotzdem erfolgreich - Unterschrift wurde zurueckgezogen
                }
            }
        } catch (err) {
            console.error("Withdraw signature error:", err)
            setError("Netzwerkfehler: Bitte pruefen Sie Ihre Internetverbindung")
        } finally {
            setWithdrawing(false)
        }
    }

    // Leerzustand: Keine Daten vorhanden
    if (timesheets.length === 0 && !month && !year) {
        return (
            <div className="rounded-3xl bg-gray-100 p-6 text-gray-500 shadow-xl">
                <div className="flex items-center justify-center gap-3">
                    <AlertCircle size={24} />
                    <span className="font-medium">Keine Daten vorhanden</span>
                </div>
                <p className="mt-2 text-center text-sm">
                    Fuer diesen Monat wurden noch keine Dienste importiert.
                </p>
            </div>
        )
    }

    const total = calculateTotalHours()
    const ready = isReadyToSubmit()
    const submitted = isAlreadySubmitted()

    // Determine if employee has signed with signature (from submissionStatus)
    const hasSigned = submissionStatus?.employeeSigned || false
    const clientSigned = submissionStatus?.clientSigned || false
    const canWithdraw = submissionStatus?.canWithdraw || false

    return (
        <div className="rounded-3xl bg-blue-600 p-6 text-white shadow-xl shadow-blue-100">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-white text-sm font-black uppercase tracking-wider">Gesamtstunden</p>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-4xl font-black">{total}</span>
                        <span className="text-blue-100 font-bold">Std.</span>
                    </div>
                </div>
                <div className="rounded-full bg-blue-500/30 p-3">
                    <Clock className="text-blue-100" size={32} />
                </div>
            </div>

            <div className="mt-8 space-y-4">
                {error && (
                    <div className="rounded-xl bg-red-400/20 p-3 text-xs text-red-100 ring-1 ring-red-400/30 font-medium">
                        {error}
                    </div>
                )}

                {submitted ? (
                    <>
                        <div className="flex items-center gap-2 rounded-xl bg-white/10 p-4 text-sm font-bold backdrop-blur-sm">
                            <CheckCircle className="text-green-300" size={20} />
                            <div className="flex-1">
                                <div>Monat erfolgreich eingereicht</div>
                                {hasSigned && (
                                    <div className="text-xs font-normal text-blue-100 mt-1">
                                        {clientSigned ? (
                                            <span className="flex items-center gap-1">
                                                <Lock size={12} />
                                                Assistenznehmer hat unterschrieben - Abgeschlossen
                                            </span>
                                        ) : (
                                            <span>Warte auf Unterschrift des Assistenznehmers...</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Signature progress info */}
                        {submissionStatus?.hasSubmission && (
                            <div className="text-xs text-blue-100 text-center">
                                {submissionStatus.signedEmployees} von {submissionStatus.totalEmployees} Mitarbeiter haben unterschrieben
                            </div>
                        )}

                        {/* Withdraw signature button - only if employee signed and client hasn't */}
                        {canWithdraw && (
                            <button
                                type="button"
                                onClick={handleWithdrawSignature}
                                disabled={withdrawing}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold transition-all bg-amber-500/80 text-white hover:bg-amber-500 disabled:opacity-50"
                            >
                                <Undo2 size={18} />
                                {withdrawing ? "Wird zurueckgezogen..." : "Unterschrift zurueckziehen"}
                            </button>
                        )}

                        {/* Show locked message if client has signed */}
                        {hasSigned && clientSigned && (
                            <div className="flex items-center justify-center gap-2 rounded-xl bg-green-500/20 p-3 text-xs text-green-100 ring-1 ring-green-400/30 font-medium">
                                <Lock size={14} />
                                Dieser Monat ist abgeschlossen
                            </div>
                        )}

                        {/* Legacy cancel button - only show if no signature system is active */}
                        {!hasSigned && !submissionStatus?.hasSubmission && (
                            <button
                                type="button"
                                onClick={handleCancelSubmit}
                                disabled={cancelling}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold transition-all bg-white/20 text-white hover:bg-white/30 disabled:opacity-50"
                            >
                                <X size={18} />
                                {cancelling ? "Wird abgebrochen..." : "Einreichung rueckgaengig machen"}
                            </button>
                        )}
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={handleOpenSubmitModal}
                        disabled={!ready || loading}
                        className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold transition-all shadow-lg ${ready
                            ? "bg-white text-blue-600 shadow-blue-800/20 hover:scale-[1.02]"
                            : "bg-blue-400/50 text-blue-200 cursor-not-allowed"
                            }`}
                    >
                        <FileSignature size={18} />
                        {loading ? "Wird eingereicht..." : "Mit Unterschrift einreichen"}
                    </button>
                )}

                {!ready && !submitted && (
                    <p className="text-center text-[10px] text-blue-200 font-medium">
                        Bitte bestaetigen Sie alle geplanten Dienste zum Einreichen.
                    </p>
                )}
            </div>

            {/* Submit Modal mit Unterschrift */}
            {currentMonth && currentYear && (
                <SubmitModal
                    isOpen={showSubmitModal}
                    onClose={() => setShowSubmitModal(false)}
                    month={currentMonth}
                    year={currentYear}
                    onSuccess={handleSubmitSuccess}
                />
            )}
        </div>
    )
}
