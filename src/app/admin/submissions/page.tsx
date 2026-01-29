"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Plus,
    Check,
    Clock,
    Eye,
    RotateCcw,
    Trash2,
    XCircle,
    Download,
    FileText
} from "lucide-react"
import { formatTimeRange } from "@/lib/time-utils"

interface EmployeeSignature {
    employeeId: string
    employeeName: string | null
    employeeEmail: string
    signedAt: string
}

interface Submission {
    id: string | null
    sheetFileName: string
    employeeNames?: string[] // Array of employee names in this submission
    month: number
    year: number
    status: string
    createdAt?: string
    updatedAt?: string
    recipientEmail: string
    recipientName: string
    recipientSignedAt?: string | null
    manuallyReleasedAt?: string | null
    manuallyReleasedBy?: string | null
    releaseNote?: string | null
    pdfUrl?: string | null
    totalEmployees: number
    signedEmployees: number
    employeeSignatures: EmployeeSignature[]
}

interface PreviewData {
    sheetFileName: string
    month: number
    year: number
    recipientName: string
    recipientEmail: string
    employees: Array<{
        id: string
        name: string
        email: string
        totalHours: number
        nightHours: number
        sundayHours: number
        holidayHours: number
        sickDays: number
        vacationDays: number
        timesheets: Array<{
            date: string
            plannedStart: string
            plannedEnd: string
            actualStart: string | null
            actualEnd: string | null
            status: string
            absenceType: string | null
        }>
    }>
    totalHours: number
}

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

const MONTH_SHORT = [
    "Jan.", "Feb.", "Mär.", "Apr.", "Mai", "Jun.",
    "Jul.", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."
]

// Emoji avatars for variety
const AVATARS = ["😊", "😎", "🙂", "😄", "🤗", "😃", "🙃", "😌"]

function getAvatar(index: number) {
    return AVATARS[index % AVATARS.length]
}

// Signature badge component
function SignatureBadge({
    type,
    signed,
    label
}: {
    type: "A" | "K"
    signed: boolean
    label: string
}) {
    return (
        <div className="relative group">
            <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                    signed
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : "bg-neutral-800 border-neutral-600 text-neutral-500"
                }`}
            >
                {signed && <Check className="w-3.5 h-3.5" />}
                {!signed && type}
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-neutral-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-neutral-700">
                {label}: {signed ? "Unterschrieben" : "Ausstehend"}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-neutral-800" />
            </div>
        </div>
    )
}

export default function AdminSubmissionsPage() {
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [pendingDienstplaene, setPendingDienstplaene] = useState<Submission[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

    // Modal states
    const [showReleaseModal, setShowReleaseModal] = useState(false)
    const [showSignatureModal, setShowSignatureModal] = useState(false)
    const [showPreviewModal, setShowPreviewModal] = useState(false)
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
    const [releaseNote, setReleaseNote] = useState("")
    const [processing, setProcessing] = useState(false)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewData, setPreviewData] = useState<PreviewData | null>(null)
    const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())

    // Month/Year filter
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1)
    const [filterYear, setFilterYear] = useState(new Date().getFullYear())

    useEffect(() => {
        fetchSubmissions()
    }, [filterMonth, filterYear])

    const fetchSubmissions = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/submissions?month=${filterMonth}&year=${filterYear}`)
            if (res.ok) {
                const data = await res.json()
                setSubmissions(data.submissions || [])
                setPendingDienstplaene(data.pendingDienstplaene || [])
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

    const goToToday = () => {
        const now = new Date()
        setFilterMonth(now.getMonth() + 1)
        setFilterYear(now.getFullYear())
    }

    const navigateMonth = (direction: -1 | 1) => {
        let newMonth = filterMonth + direction
        let newYear = filterYear

        if (newMonth < 1) {
            newMonth = 12
            newYear--
        } else if (newMonth > 12) {
            newMonth = 1
            newYear++
        }

        setFilterMonth(newMonth)
        setFilterYear(newYear)
    }

    const toggleClientExpand = (clientName: string) => {
        setExpandedClients(prev => {
            const next = new Set(prev)
            if (next.has(clientName)) {
                next.delete(clientName)
            } else {
                next.add(clientName)
            }
            return next
        })
    }

    const toggleItemSelect = (id: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    // Get submissions for current month grouped by client
    const activeSubmissions = submissions.filter(s => s.month === filterMonth && s.year === filterYear)
    const allDienstplaene = [...activeSubmissions, ...pendingDienstplaene].sort((a, b) =>
        a.recipientName.localeCompare(b.recipientName)
    )

    // Group by client (recipientName)
    const clientGroups = allDienstplaene.reduce((acc, sub) => {
        const clientName = sub.recipientName || "Unbekannt"
        if (!acc[clientName]) {
            acc[clientName] = []
        }
        acc[clientName].push(sub)
        return acc
    }, {} as Record<string, Submission[]>)

    // Calculate totals
    const totalCount = allDienstplaene.length
    const totalHours = allDienstplaene.reduce((sum, s) => sum + (s.totalEmployees * 8), 0) // Placeholder

    // Modal handlers
    const openReleaseModal = (submission: Submission) => {
        setSelectedSubmission(submission)
        setReleaseNote("")
        setShowReleaseModal(true)
    }

    const handleRelease = async () => {
        if (!selectedSubmission || !releaseNote.trim() || !selectedSubmission.id) {
            toast.error("Bitte geben Sie einen Grund ein")
            return
        }

        setProcessing(true)
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
            setProcessing(false)
        }
    }

    const handleRevertRelease = async (submissionId: string) => {
        if (!window.confirm("Möchten Sie die manuelle Freigabe wirklich widerrufen?")) {
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

    const openSignatureModal = (submission: Submission) => {
        setSelectedSubmission(submission)
        setShowSignatureModal(true)
    }

    const handleDeleteSignature = async (submissionId: string, employeeId: string, employeeName: string) => {
        if (!window.confirm(`Unterschrift von ${employeeName} wirklich löschen?`)) {
            return
        }

        setProcessing(true)
        try {
            const res = await fetch(`/api/admin/submissions/${submissionId}/signatures/${employeeId}`, {
                method: "DELETE"
            })

            const data = await res.json()

            if (res.ok) {
                toast.success(`Unterschrift gelöscht`)
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

    const handleDeleteRecipientSignature = async (submissionId: string) => {
        if (!window.confirm("Assistenznehmer-Unterschrift wirklich löschen? Status wird auf 'Ausstehend' zurückgesetzt.")) {
            return
        }

        setProcessing(true)
        try {
            const res = await fetch(`/api/admin/submissions/${submissionId}/signatures/recipient`, {
                method: "DELETE"
            })

            const data = await res.json()

            if (res.ok) {
                toast.success("Assistenznehmer-Unterschrift gelöscht")
                setShowSignatureModal(false)
                setSelectedSubmission(null)
                await fetchSubmissions()
            } else {
                toast.error(data.error || "Fehler beim Löschen")
            }
        } catch (error) {
            console.error("Error deleting recipient signature:", error)
            toast.error("Fehler beim Löschen")
        } finally {
            setProcessing(false)
        }
    }

    const handleReset = async (submissionId: string, sheetFileName: string) => {
        const reason = window.prompt("Grund für Reset (optional):")
        if (reason === null) return

        if (!window.confirm("Wirklich ALLE Unterschriften löschen?")) {
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
                toast.success(`Einreichung zurückgesetzt`)
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

    const openPreviewModal = async (submission: Submission) => {
        setSelectedSubmission(submission)
        setShowPreviewModal(true)
        setPreviewLoading(true)
        setExpandedEmployees(new Set())

        try {
            const res = await fetch(
                `/api/admin/submissions/preview?sheetFileName=${encodeURIComponent(submission.sheetFileName)}&month=${submission.month}&year=${submission.year}`
            )

            if (res.ok) {
                const data = await res.json()
                setPreviewData(data)
            } else {
                toast.error("Fehler beim Laden der Vorschau")
                setShowPreviewModal(false)
            }
        } catch (error) {
            console.error("Error loading preview:", error)
            toast.error("Fehler beim Laden der Vorschau")
            setShowPreviewModal(false)
        } finally {
            setPreviewLoading(false)
        }
    }

    const toggleEmployeeExpand = (employeeId: string) => {
        setExpandedEmployees(prev => {
            const next = new Set(prev)
            if (next.has(employeeId)) {
                next.delete(employeeId)
            } else {
                next.add(employeeId)
            }
            return next
        })
    }

    // Format date for display
    const formatDisplayDate = (dateStr?: string) => {
        if (!dateStr) return ""
        const date = new Date(dateStr)
        return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            {/* Header */}
            <div className="border-b border-neutral-800 px-6 py-4">
                <h1 className="text-xl font-semibold">Stundennachweise</h1>

                {/* Filter bar */}
                <div className="flex items-center gap-4 mt-4">
                    {/* Count badge */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 rounded-lg text-sm">
                        <span className="text-neutral-400">≡</span>
                        <span className="font-medium">{totalCount}</span>
                    </div>

                    {/* Month navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => navigateMonth(-1)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-3 py-1.5 font-medium min-w-[140px] text-center">
                            {MONTH_NAMES[filterMonth - 1]} {filterYear}
                        </span>
                        <button
                            onClick={() => navigateMonth(1)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Today button */}
                    <button
                        onClick={goToToday}
                        className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                        Heute
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
                {loading ? (
                    <div className="text-center py-12 text-neutral-500">
                        Laden...
                    </div>
                ) : Object.keys(clientGroups).length === 0 ? (
                    <div className="text-center py-12 text-neutral-500">
                        Keine Stundennachweise für {MONTH_NAMES[filterMonth - 1]} {filterYear}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {Object.entries(clientGroups).map(([clientName, clientSubmissions], clientIndex) => {
                            const isExpanded = expandedClients.has(clientName)
                            const totalClientHours = clientSubmissions.reduce((sum, s) => {
                                // Calculate actual hours from employee signatures or estimate
                                return sum + (s.signedEmployees * 8)
                            }, 0)
                            const allSigned = clientSubmissions.every(s =>
                                s.signedEmployees === s.totalEmployees && s.recipientSignedAt
                            )

                            return (
                                <div key={clientName} className="bg-neutral-900 rounded-xl overflow-hidden">
                                    {/* Client header */}
                                    <button
                                        onClick={() => toggleClientExpand(clientName)}
                                        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-neutral-800/50 transition-colors"
                                    >
                                        {/* Checkbox */}
                                        <div
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                                allSigned
                                                    ? "bg-emerald-500 border-emerald-500"
                                                    : "border-neutral-600"
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                            }}
                                        >
                                            {allSigned && <Check className="w-3 h-3 text-white" />}
                                        </div>

                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-lg">
                                            {getAvatar(clientIndex)}
                                        </div>

                                        {/* Client name */}
                                        <span className="font-medium flex-1 text-left">{clientName}</span>

                                        {/* Chevron */}
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-neutral-500" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-neutral-500" />
                                        )}
                                    </button>

                                    {/* Expanded employee list */}
                                    {isExpanded && (
                                        <div className="border-t border-neutral-800">
                                            {clientSubmissions.map((submission, subIndex) => {
                                                const assistentSigned = submission.signedEmployees === submission.totalEmployees
                                                const klientSigned = !!submission.recipientSignedAt

                                                return (
                                                    <div
                                                        key={submission.id || `${submission.sheetFileName}-${subIndex}`}
                                                        className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-800/30 transition-colors border-t border-neutral-800/50 first:border-t-0"
                                                    >
                                                        {/* Checkbox */}
                                                        <div
                                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${
                                                                selectedItems.has(submission.id || submission.sheetFileName)
                                                                    ? "bg-violet-500 border-violet-500"
                                                                    : "border-neutral-600 hover:border-neutral-500"
                                                            }`}
                                                            onClick={() => toggleItemSelect(submission.id || submission.sheetFileName)}
                                                        >
                                                            {selectedItems.has(submission.id || submission.sheetFileName) && (
                                                                <Check className="w-3 h-3 text-white" />
                                                            )}
                                                        </div>

                                                        {/* Avatar */}
                                                        <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-lg">
                                                            {getAvatar(subIndex + 5)}
                                                        </div>

                                                        {/* Employee names */}
                                                        <div className="flex-1 min-w-0">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    openPreviewModal(submission)
                                                                }}
                                                                className="font-medium truncate block text-violet-400 underline hover:text-violet-300 transition-colors text-left"
                                                            >
                                                                {submission.employeeNames && submission.employeeNames.length > 0
                                                                    ? submission.employeeNames.join(", ")
                                                                    : submission.sheetFileName
                                                                }
                                                            </button>
                                                        </div>

                                                        {/* Hours */}
                                                        <span className="text-neutral-400 text-sm tabular-nums">
                                                            {submission.signedEmployees > 0
                                                                ? `${submission.signedEmployees * 8}h`
                                                                : "0m"
                                                            }
                                                        </span>

                                                        {/* Action buttons (on hover) */}
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    openPreviewModal(submission)
                                                                }}
                                                                className="p-1.5 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white"
                                                                title="Vorschau"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        {/* Signature badges */}
                                                        <div className="flex items-center gap-2">
                                                            <SignatureBadge
                                                                type="A"
                                                                signed={assistentSigned}
                                                                label="Assistent"
                                                            />
                                                            <SignatureBadge
                                                                type="K"
                                                                signed={klientSigned}
                                                                label="Klient"
                                                            />
                                                        </div>

                                                        {/* Date */}
                                                        <span className="text-neutral-500 text-sm w-16 text-right">
                                                            {formatDisplayDate(submission.updatedAt || submission.createdAt)}
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Release Modal */}
            {showReleaseModal && selectedSubmission && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-md w-full p-6">
                        <h2 className="text-xl font-bold mb-4">Einreichung manuell freigeben</h2>

                        <div className="mb-4 text-sm text-neutral-400">
                            <strong className="text-white">{selectedSubmission.sheetFileName}</strong>
                            <br />
                            {selectedSubmission.signedEmployees} von {selectedSubmission.totalEmployees} Mitarbeitern haben unterschrieben.
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium mb-2">
                                Grund für die Freigabe *
                            </label>
                            <textarea
                                value={releaseNote}
                                onChange={(e) => setReleaseNote(e.target.value)}
                                placeholder="z.B. Mitarbeiter im Urlaub, Krankheit, etc."
                                rows={3}
                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowReleaseModal(false)
                                    setSelectedSubmission(null)
                                    setReleaseNote("")
                                }}
                                disabled={processing}
                                className="px-4 py-2 text-neutral-400 hover:text-white"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleRelease}
                                disabled={processing || !releaseNote.trim()}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                            >
                                {processing ? "Wird freigegeben..." : "Freigeben"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Signature Management Modal */}
            {showSignatureModal && selectedSubmission && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-lg w-full p-6">
                        <h2 className="text-xl font-bold mb-4">Unterschriften verwalten</h2>

                        <div className="mb-4 text-sm text-neutral-400">
                            <strong className="text-white">{selectedSubmission.sheetFileName}</strong>
                            <br />
                            {selectedSubmission.employeeSignatures.length} Unterschrift(en) vorhanden
                        </div>

                        <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
                            {selectedSubmission.employeeSignatures.map((sig) => (
                                <div key={sig.employeeId} className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                                    <div>
                                        <p className="font-medium">{sig.employeeName || sig.employeeEmail}</p>
                                        <p className="text-xs text-neutral-500">
                                            {new Date(sig.signedAt).toLocaleString("de-DE")}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteSignature(selectedSubmission.id!, sig.employeeId, sig.employeeName || sig.employeeEmail)}
                                        disabled={processing}
                                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Assistenznehmer-Unterschrift (falls vorhanden) */}
                        {selectedSubmission.recipientSignedAt && (
                            <div className="mt-4 border-t border-neutral-800 pt-4">
                                <h3 className="font-medium mb-2 text-white">Assistenznehmer-Unterschrift</h3>
                                <div className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                                    <div>
                                        <p className="font-medium text-white">
                                            {selectedSubmission.recipientName || "Unbekannt"}
                                        </p>
                                        <p className="text-xs text-neutral-500">
                                            Unterschrieben: {new Date(selectedSubmission.recipientSignedAt).toLocaleString("de-DE")}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteRecipientSignature(selectedSubmission.id!)}
                                        disabled={processing}
                                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                                        title="Unterschrift löschen"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => {
                                    setShowSignatureModal(false)
                                    setSelectedSubmission(null)
                                }}
                                disabled={processing}
                                className="px-4 py-2 text-neutral-400 hover:text-white"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {showPreviewModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-neutral-800 bg-gradient-to-r from-violet-600 to-purple-600">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Eye className="w-5 h-5" />
                                Vorschau
                            </h2>
                            {previewData && (
                                <p className="text-violet-200 text-sm mt-1">
                                    {previewData.sheetFileName} - {MONTH_NAMES[previewData.month - 1]} {previewData.year}
                                </p>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {previewLoading ? (
                                <div className="text-center py-12 text-neutral-500">
                                    Lade Vorschau...
                                </div>
                            ) : previewData ? (
                                <div className="space-y-6">
                                    {/* Summary */}
                                    <div className="bg-neutral-800 rounded-lg p-4">
                                        <h3 className="font-bold mb-3">Zusammenfassung</h3>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-neutral-400">Assistenznehmer:</span>
                                                <span className="ml-2">{previewData.recipientName}</span>
                                            </div>
                                            <div>
                                                <span className="text-neutral-400">Mitarbeiter:</span>
                                                <span className="ml-2">{previewData.employees.length}</span>
                                            </div>
                                            <div>
                                                <span className="text-neutral-400">Gesamtstunden:</span>
                                                <span className="ml-2">{previewData.totalHours.toFixed(2)} Std.</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Employees */}
                                    <div>
                                        <h3 className="font-bold mb-3">Mitarbeiter-Details</h3>
                                        <div className="space-y-2">
                                            {previewData.employees.map((emp) => (
                                                <div key={emp.id} className="bg-neutral-800 rounded-lg overflow-hidden">
                                                    <button
                                                        onClick={() => toggleEmployeeExpand(emp.id)}
                                                        className="w-full flex items-center justify-between p-4 hover:bg-neutral-700/50"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {expandedEmployees.has(emp.id) ? (
                                                                <ChevronDown className="w-4 h-4 text-neutral-500" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 text-neutral-500" />
                                                            )}
                                                            <span className="font-medium">{emp.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-sm">
                                                            <span className="bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">
                                                                {emp.totalHours.toFixed(1)} Std.
                                                            </span>
                                                            {emp.nightHours > 0 && (
                                                                <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                                                                    {emp.nightHours.toFixed(1)}h Nacht
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>

                                                    {expandedEmployees.has(emp.id) && (
                                                        <div className="px-4 pb-4 border-t border-neutral-700">
                                                            <table className="w-full text-sm mt-3">
                                                                <thead>
                                                                    <tr className="text-left text-neutral-500">
                                                                        <th className="py-1">Datum</th>
                                                                        <th className="py-1">Geplant</th>
                                                                        <th className="py-1">Tatsächlich</th>
                                                                        <th className="py-1">Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {emp.timesheets.map((ts, idx) => (
                                                                        <tr key={idx} className="border-t border-neutral-700/50">
                                                                            <td className="py-2">
                                                                                {new Date(ts.date).toLocaleDateString("de-DE", {
                                                                                    weekday: 'short',
                                                                                    day: '2-digit',
                                                                                    month: '2-digit'
                                                                                })}
                                                                            </td>
                                                                            <td className="py-2">{formatTimeRange(ts.plannedStart, ts.plannedEnd)}</td>
                                                                            <td className="py-2">
                                                                                {ts.absenceType === "SICK" ? (
                                                                                    <span className="text-red-400">Krank</span>
                                                                                ) : ts.absenceType === "VACATION" ? (
                                                                                    <span className="text-cyan-400">Urlaub</span>
                                                                                ) : ts.actualStart ? (
                                                                                    formatTimeRange(ts.actualStart, ts.actualEnd)
                                                                                ) : (
                                                                                    <span className="text-neutral-500">-</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="py-2">
                                                                                <span className={`px-2 py-0.5 rounded text-xs ${
                                                                                    ts.status === "SUBMITTED" ? "bg-blue-500/20 text-blue-300" :
                                                                                    ts.status === "CONFIRMED" ? "bg-green-500/20 text-green-300" :
                                                                                    ts.status === "CHANGED" ? "bg-amber-500/20 text-amber-300" :
                                                                                    "bg-neutral-700 text-neutral-400"
                                                                                }`}>
                                                                                    {ts.status}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-neutral-500">
                                    Keine Daten verfügbar
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-neutral-800 flex justify-end">
                            <button
                                onClick={() => {
                                    setShowPreviewModal(false)
                                    setSelectedSubmission(null)
                                    setPreviewData(null)
                                }}
                                className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
