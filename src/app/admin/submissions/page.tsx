"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Calendar, Users, CheckCircle, Clock, AlertCircle, Download, Trash2, RotateCcw, XCircle } from "lucide-react"

interface EmployeeSignature {
    employeeId: string
    employeeName: string | null
    employeeEmail: string
    signedAt: string
}

interface Submission {
    id: string
    sheetFileName: string
    month: number
    year: number
    status: string
    createdAt: string
    updatedAt: string
    recipientEmail: string
    recipientName: string
    recipientSignedAt: string | null
    manuallyReleasedAt: string | null
    manuallyReleasedBy: string | null
    releaseNote: string | null
    pdfUrl: string | null
    totalEmployees: number
    signedEmployees: number
    employeeSignatures: EmployeeSignature[]
}

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

const STATUS_LABELS: { [key: string]: string } = {
    "PENDING_EMPLOYEES": "Warten auf Mitarbeiter",
    "PENDING_RECIPIENT": "Warten auf Assistenznehmer",
    "COMPLETED": "Abgeschlossen"
}

const STATUS_COLORS: { [key: string]: string } = {
    "PENDING_EMPLOYEES": "bg-amber-100 text-amber-800",
    "PENDING_RECIPIENT": "bg-blue-100 text-blue-800",
    "COMPLETED": "bg-green-100 text-green-800"
}

export default function AdminSubmissionsPage() {
    const router = useRouter()
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [loading, setLoading] = useState(true)
    const [releasingId, setReleasingId] = useState<string | null>(null)
    const [releaseNote, setReleaseNote] = useState("")
    const [showReleaseModal, setShowReleaseModal] = useState(false)
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

    // New states for reset operations
    const [showSignatureModal, setShowSignatureModal] = useState(false)
    const [processing, setProcessing] = useState(false)

    useEffect(() => {
        fetchSubmissions()
    }, [])

    const fetchSubmissions = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/submissions")
            if (res.ok) {
                const data = await res.json()
                setSubmissions(data.submissions || [])
            } else {
                toast.error("Fehler beim Laden der Einreichungen")
            }
        } catch (error) {
            console.error("Error fetching submissions:", error)
            toast.error("Fehler beim Laden")
        } finally {
            setLoading(false)
        }
    }

    const openReleaseModal = (submission: Submission) => {
        setSelectedSubmission(submission)
        setReleaseNote("")
        setShowReleaseModal(true)
    }

    const handleRelease = async () => {
        if (!selectedSubmission || !releaseNote.trim()) {
            toast.error("Bitte geben Sie einen Grund ein")
            return
        }

        setReleasingId(selectedSubmission.id)
        try {
            const res = await fetch(`/api/admin/submissions/${selectedSubmission.id}/release`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ releaseNote })
            })

            const data = await res.json()

            if (res.ok) {
                toast.success(data.message || "Einreichung freigegeben")
                setShowReleaseModal(false)
                setSelectedSubmission(null)
                setReleaseNote("")
                await fetchSubmissions()
            } else {
                toast.error(data.error || "Fehler beim Freigeben")
            }
        } catch (error) {
            console.error("Error releasing submission:", error)
            toast.error("Fehler beim Freigeben")
        } finally {
            setReleasingId(null)
        }
    }

    // NEW: Revert manual release
    const handleRevertRelease = async (submissionId: string) => {
        if (!window.confirm("Möchten Sie die manuelle Freigabe wirklich widerrufen?\n\nDie Einreichung wird zurück in den Status 'Warten auf Mitarbeiter' gesetzt.")) {
            return
        }

        setProcessing(true)
        try {
            const res = await fetch(`/api/admin/submissions/${submissionId}/revert-release`, {
                method: "POST"
            })

            const data = await res.json()

            if (res.ok) {
                toast.success("Freigabe erfolgreich widerrufen")
                await fetchSubmissions()
            } else {
                toast.error(data.error || "Fehler beim Widerrufen")
            }
        } catch (error) {
            console.error("Error reverting release:", error)
            toast.error("Fehler beim Widerrufen")
        } finally {
            setProcessing(false)
        }
    }

    // NEW: Open signature management modal
    const openSignatureModal = (submission: Submission) => {
        setSelectedSubmission(submission)
        setShowSignatureModal(true)
    }

    // NEW: Delete individual signature
    const handleDeleteSignature = async (submissionId: string, employeeId: string, employeeName: string) => {
        if (!window.confirm(`Unterschrift von ${employeeName} wirklich löschen?\n\nDer Mitarbeiter muss danach erneut unterschreiben.`)) {
            return
        }

        setProcessing(true)
        try {
            const res = await fetch(`/api/admin/submissions/${submissionId}/signatures/${employeeId}`, {
                method: "DELETE"
            })

            const data = await res.json()

            if (res.ok) {
                toast.success(`Unterschrift gelöscht. Status: ${data.signedCount}/${data.totalCount} unterschrieben`)
                setShowSignatureModal(false)
                setSelectedSubmission(null)
                await fetchSubmissions()
            } else {
                toast.error(data.error || "Fehler beim Löschen")
            }
        } catch (error) {
            console.error("Error deleting signature:", error)
            toast.error("Fehler beim Löschen")
        } finally {
            setProcessing(false)
        }
    }

    // NEW: Complete reset
    const handleReset = async (submissionId: string, sheetFileName: string) => {
        const reason = window.prompt(
            "WARNUNG: Alle Unterschriften werden gelöscht!\n\n" +
            `Einreichung: ${sheetFileName}\n\n` +
            "Grund für Reset (optional):"
        )

        if (reason === null) return // Cancelled

        if (!window.confirm(
            "Wirklich ALLE Unterschriften löschen?\n\n" +
            "Dies kann nicht rückgängig gemacht werden!\n" +
            "- Alle Mitarbeiter-Unterschriften werden gelöscht\n" +
            "- Assistenznehmer-Unterschrift wird gelöscht\n" +
            "- Neuer Token wird generiert (alter wird ungültig)\n" +
            "- PDF wird gelöscht"
        )) {
            return
        }

        setProcessing(true)
        try {
            const res = await fetch(`/api/admin/submissions/${submissionId}/reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason })
            })

            const data = await res.json()

            if (res.ok) {
                toast.success(`Einreichung zurückgesetzt. ${data.resetCount} Unterschriften gelöscht.`)
                await fetchSubmissions()
            } else {
                toast.error(data.error || "Fehler beim Zurücksetzen")
            }
        } catch (error) {
            console.error("Error resetting submission:", error)
            toast.error("Fehler beim Zurücksetzen")
        } finally {
            setProcessing(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            Einreichungen verwalten
                        </h1>
                        <p className="text-gray-600 mt-2">
                            Übersicht aller Team-Einreichungen
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/admin")}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                    >
                        ← Zurück zum Dashboard
                    </button>
                </div>

                {/* Submissions List */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <p className="mt-2 text-gray-600">Lade Einreichungen...</p>
                    </div>
                ) : submissions.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-8 text-center">
                        <p className="text-gray-600">Keine Einreichungen gefunden</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {submissions.map((submission) => (
                            <div key={submission.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        {/* Title */}
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-bold text-gray-900">
                                                {submission.sheetFileName}
                                            </h3>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[submission.status]}`}>
                                                {STATUS_LABELS[submission.status]}
                                            </span>
                                        </div>

                                        {/* Info Row */}
                                        <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} />
                                                <span>{MONTH_NAMES[submission.month - 1]} {submission.year}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users size={16} />
                                                <span>
                                                    {submission.signedEmployees} von {submission.totalEmployees} Mitarbeitern
                                                </span>
                                            </div>
                                            {submission.recipientSignedAt && (
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle size={16} className="text-green-600" />
                                                    <span>Assistenznehmer unterschrieben</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Manual Release Note */}
                                        {submission.manuallyReleasedAt && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                                                    <div className="text-sm">
                                                        <p className="text-amber-900 font-medium">Manuell freigegeben</p>
                                                        <p className="text-amber-800 text-xs">
                                                            {submission.releaseNote}
                                                        </p>
                                                        <p className="text-amber-600 text-xs mt-1">
                                                            von {submission.manuallyReleasedBy} am {new Date(submission.manuallyReleasedAt).toLocaleDateString("de-DE")}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Employee Signatures */}
                                        <div className="flex flex-wrap gap-2">
                                            {submission.employeeSignatures.map((sig) => (
                                                <div key={sig.employeeId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-green-100 text-green-800 text-xs">
                                                    <CheckCircle size={12} />
                                                    <span>{sig.employeeName || sig.employeeEmail}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 ml-4">
                                        {/* Manual Release */}
                                        {submission.status === "PENDING_EMPLOYEES" && (
                                            <button
                                                onClick={() => openReleaseModal(submission)}
                                                disabled={processing}
                                                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium text-sm whitespace-nowrap disabled:opacity-50"
                                            >
                                                Manuell freigeben
                                            </button>
                                        )}

                                        {/* Revert Release */}
                                        {submission.status === "PENDING_RECIPIENT" && !submission.recipientSignedAt && (
                                            <button
                                                onClick={() => handleRevertRelease(submission.id)}
                                                disabled={processing}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-medium text-sm whitespace-nowrap disabled:opacity-50"
                                            >
                                                <RotateCcw size={16} />
                                                Widerrufen
                                            </button>
                                        )}

                                        {/* Manage Signatures */}
                                        {submission.employeeSignatures.length > 0 && submission.status !== "COMPLETED" && (
                                            <button
                                                onClick={() => openSignatureModal(submission)}
                                                disabled={processing}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm whitespace-nowrap disabled:opacity-50"
                                            >
                                                <Trash2 size={16} />
                                                Verwalten
                                            </button>
                                        )}

                                        {/* Complete Reset */}
                                        {submission.status !== "COMPLETED" && (
                                            <button
                                                onClick={() => handleReset(submission.id, submission.sheetFileName)}
                                                disabled={processing}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium text-sm whitespace-nowrap disabled:opacity-50"
                                            >
                                                <XCircle size={16} />
                                                Reset
                                            </button>
                                        )}

                                        {/* PDF Download */}
                                        {submission.pdfUrl && (
                                            <a
                                                href={submission.pdfUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm"
                                            >
                                                <Download size={16} />
                                                PDF
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Release Modal */}
                {showReleaseModal && selectedSubmission && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">
                                Einreichung manuell freigeben
                            </h2>

                            <div className="mb-4">
                                <p className="text-sm text-gray-600 mb-2">
                                    <strong>{selectedSubmission.sheetFileName}</strong> - {MONTH_NAMES[selectedSubmission.month - 1]} {selectedSubmission.year}
                                </p>
                                <p className="text-sm text-amber-700">
                                    Nur {selectedSubmission.signedEmployees} von {selectedSubmission.totalEmployees} Mitarbeitern haben unterschrieben.
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Grund für die Freigabe *
                                </label>
                                <textarea
                                    value={releaseNote}
                                    onChange={(e) => setReleaseNote(e.target.value)}
                                    placeholder="z.B. Mitarbeiter im Urlaub, Krankheit, etc."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowReleaseModal(false)
                                        setSelectedSubmission(null)
                                        setReleaseNote("")
                                    }}
                                    disabled={!!releasingId}
                                    className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={handleRelease}
                                    disabled={!!releasingId || !releaseNote.trim()}
                                    className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {releasingId ? "Wird freigegeben..." : "Freigeben"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Signature Management Modal */}
                {showSignatureModal && selectedSubmission && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">
                                Unterschriften verwalten
                            </h2>

                            <div className="mb-4">
                                <p className="text-sm text-gray-600 mb-2">
                                    <strong>{selectedSubmission.sheetFileName}</strong> - {MONTH_NAMES[selectedSubmission.month - 1]} {selectedSubmission.year}
                                </p>
                                <p className="text-sm text-gray-700">
                                    {selectedSubmission.employeeSignatures.length} Unterschrift(en) vorhanden
                                </p>
                            </div>

                            <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
                                {selectedSubmission.employeeSignatures.map((sig) => (
                                    <div key={sig.employeeId} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900">{sig.employeeName || sig.employeeEmail}</p>
                                            <p className="text-xs text-gray-500">
                                                Unterschrieben am: {new Date(sig.signedAt).toLocaleString("de-DE")}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteSignature(selectedSubmission.id, sig.employeeId, sig.employeeName || sig.employeeEmail)}
                                            disabled={processing}
                                            className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm disabled:opacity-50"
                                        >
                                            <Trash2 size={16} />
                                            Löschen
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowSignatureModal(false)
                                        setSelectedSubmission(null)
                                    }}
                                    disabled={processing}
                                    className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
                                >
                                    Schließen
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
