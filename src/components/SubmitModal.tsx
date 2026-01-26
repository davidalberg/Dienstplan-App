"use client"

import { useState } from "react"
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

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

export default function SubmitModal({ isOpen, onClose, month, year, onSuccess }: SubmitModalProps) {
    const [step, setStep] = useState<"info" | "signature" | "loading" | "success" | "error">("info")
    const [signature, setSignature] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [submissionId, setSubmissionId] = useState<string | null>(null)
    const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null)
    const [signResponse, setSignResponse] = useState<any>(null)

    if (!isOpen) return null

    const handleStartSignature = async () => {
        setStep("loading")
        setError(null)

        try {
            // Create submission
            const res = await fetch("/api/submissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, year })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Fehler beim Erstellen der Einreichung")
                setStep("error")
                return
            }

            setSubmissionId(data.submission.id)
            setSubmissionData(data)
            setStep("signature")
        } catch (err) {
            console.error(err)
            setError("Netzwerkfehler. Bitte erneut versuchen.")
            setStep("error")
        }
    }

    const handleSign = async () => {
        if (!signature || !submissionId) {
            showToast("error", "Bitte unterschreiben Sie zuerst")
            return
        }

        setStep("loading")

        try {
            const res = await fetch("/api/submissions/sign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    submissionId,
                    signature
                })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Fehler beim Unterschreiben")
                setStep("error")
                return
            }

            if (data.warning) {
                showToast("warning", data.warning)
            }

            setSignResponse(data)
            setStep("success")
            showToast("success", data.message || "Erfolgreich eingereicht!")
        } catch (err) {
            console.error(err)
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
                                        <span>Sie unterschreiben digital</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-xs font-bold">2</span>
                                        <span>Ihr Assistenznehmer erhält eine E-Mail</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-xs font-bold">3</span>
                                        <span>Nach der Gegenzeichnung erhalten beide ein PDF</span>
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
                                <Send size={18} />
                                Weiter zur Unterschrift
                            </button>
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
                                ) : signResponse?.totalCount > 1 ? (
                                    // Not all employees have signed yet
                                    <div className="space-y-2">
                                        <p className="text-sm text-gray-600 mt-1">
                                            Ihre Unterschrift wurde gespeichert.
                                        </p>
                                        <p className="text-sm text-amber-700 font-medium">
                                            Warten auf {signResponse.pendingCount || (signResponse.totalCount - signResponse.signedCount)} weitere Teammitglieder.
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
