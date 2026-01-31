"use client"

import { useState, useMemo } from "react"
import {
    FileText,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    Eye,
    Download,
    Check,
    Mail
} from "lucide-react"
import { useAdminSubmissions } from "@/hooks/use-admin-data"
import EmployeeAvatarStack from "@/components/EmployeeAvatarStack"
import SignatureProgress from "@/components/SignatureProgress"
import { showToast } from "@/lib/toast-utils"
import CombinedTimesheetModal from "@/components/CombinedTimesheetModal"

// German month names
const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

/**
 * Clean up sheet file name for display
 * Converts "Team_Team_Jana_Scheuer_2026_2026" to "Team Jana Scheuer"
 */
function cleanSheetFileName(sheetFileName: string): string {
    let cleaned = sheetFileName

    // Remove duplicate "Team_Team" prefix
    if (cleaned.startsWith("Team_Team_")) {
        cleaned = cleaned.replace("Team_Team_", "Team_")
    }

    // Replace underscores with spaces
    cleaned = cleaned.replace(/_/g, " ")

    // Remove year suffix (e.g., " 2026" or " 2026 2026")
    cleaned = cleaned.replace(/\s+\d{4}(\s+\d{4})?$/g, "")

    return cleaned
}

// Submission type from API
interface Submission {
    id: string | null
    sheetFileName: string
    employeeNames: string[]
    month: number
    year: number
    status: string
    createdAt?: Date
    updatedAt?: Date
    recipientEmail: string | null
    recipientName: string | null
    recipientSignedAt: Date | null
    manuallyReleasedAt?: Date | null
    manuallyReleasedBy?: string | null
    releaseNote?: string | null
    pdfUrl?: string | null
    totalEmployees: number
    signedEmployees: number
    employeeSignatures: Array<{
        employeeId: string
        employeeName: string
        employeeEmail: string
        signedAt: Date
    }>
    // Client info (added for grouping)
    client?: {
        id: string
        firstName: string
        lastName: string
        email: string | null
    } | null
    clientId?: string | null
    timesheetCount?: number // Number of timesheets (for pending)
}

// Client group type
interface ClientGroup {
    clientId: string
    clientName: string
    clientEmail: string | null
    submissions: Submission[]
}

/**
 * SignatureBadge - Small badge showing signature status (A1, A2, K)
 */
function SignatureBadge({ type, signed, label }: { type: string; signed: boolean; label: string }) {
    return (
        <div
            className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors duration-150 ${
                signed
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-neutral-700 text-neutral-400 border border-neutral-600"
            }`}
            title={`${label}: ${signed ? "Unterschrieben" : "Ausstehend"}`}
        >
            {signed && <Check size={12} />}
            {type}
        </div>
    )
}

/**
 * StatusBadge - Shows submission status
 */
function StatusBadge({ status, timesheetCount }: { status: string; timesheetCount?: number }) {
    const config: Record<string, { label: string; icon: string; color: string }> = {
        NOT_STARTED: {
            label: timesheetCount ? `Ausstehend (${timesheetCount} Schichten)` : "Ausstehend",
            icon: "⏳",
            color: "bg-amber-500/20 text-amber-300 border border-amber-500/30"
        },
        PENDING_EMPLOYEES: {
            label: "In Bearbeitung",
            icon: "🔄",
            color: "bg-blue-500/20 text-blue-300 border border-blue-500/30"
        },
        PENDING_RECIPIENT: {
            label: "Klient ausstehend",
            icon: "🔄",
            color: "bg-blue-500/20 text-blue-300 border border-blue-500/30"
        },
        COMPLETED: {
            label: "Eingereicht",
            icon: "✅",
            color: "bg-green-500/20 text-green-300 border border-green-500/30"
        }
    }

    const { label, icon, color } = config[status] || config.PENDING_EMPLOYEES

    return (
        <span className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 ${color}`}>
            <span>{icon}</span>
            <span>{label}</span>
        </span>
    )
}

/**
 * TeamSubmissionRow - Single team submission row with avatars, badges, and actions
 */
function TeamSubmissionRow({
    submission,
    onViewCombined,
    onDownload,
    onSendEmail
}: {
    submission: Submission
    onViewCombined: () => void
    onDownload: () => void
    onSendEmail: () => void
}) {
    // Map employee names to avatar format
    const employeeAvatars = submission.employeeNames.map((name, idx) => ({
        id: `${submission.id}-emp-${idx}`,
        name
    }))

    return (
        <div className="px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50 transition-colors duration-150 gap-4">
            {/* Left: Employee Avatars + Sheet Name */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <EmployeeAvatarStack
                    employees={employeeAvatars}
                    maxVisible={3}
                    size="sm"
                />

                <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{cleanSheetFileName(submission.sheetFileName)}</p>
                    {submission.status === "NOT_STARTED" ? (
                        <p className="text-xs text-neutral-400 truncate">
                            Mitarbeiter: {submission.employeeNames.join(", ")}
                        </p>
                    ) : (
                        <p className="text-xs text-neutral-400 truncate">
                            {submission.employeeNames.join(", ")}
                        </p>
                    )}
                </div>
            </div>

            {/* Middle: Signature Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
                {submission.employeeNames.map((name, idx) => {
                    const signed = submission.employeeSignatures.some(s => s.employeeName === name)
                    return (
                        <SignatureBadge
                            key={idx}
                            type={`A${idx + 1}`}
                            signed={signed}
                            label={name}
                        />
                    )
                })}
                <SignatureBadge
                    type="K"
                    signed={!!submission.recipientSignedAt}
                    label="Klient"
                />
            </div>

            {/* Right: Status Badge + Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={submission.status} timesheetCount={submission.timesheetCount} />

                {submission.status !== "NOT_STARTED" ? (
                    <>
                        <button
                            onClick={onViewCombined}
                            className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition-colors duration-150"
                            title="Team-Ansicht öffnen"
                            aria-label="Team-Ansicht öffnen"
                        >
                            <Eye size={14} />
                        </button>

                        {submission.pdfUrl ? (
                            <button
                                onClick={onDownload}
                                className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition-colors duration-150"
                                title="PDF herunterladen"
                                aria-label="PDF herunterladen"
                            >
                                <Download size={14} />
                            </button>
                        ) : (
                            <button
                                onClick={onSendEmail}
                                className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition-colors duration-150"
                                title="E-Mail senden"
                                aria-label="E-Mail an Klient senden"
                            >
                                <Mail size={14} />
                            </button>
                        )}
                    </>
                ) : (
                    <div className="text-xs text-neutral-500 italic px-2">
                        Noch nicht eingereicht
                    </div>
                )}
            </div>
        </div>
    )
}

/**
 * Main Timesheets Admin Page
 */
export default function TimesheetsPage() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
    const [showCombinedModal, setShowCombinedModal] = useState(false)
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    // Fetch submissions data
    const { submissions, pendingDienstplaene, targetMonth, targetYear, isLoading, mutate } = useAdminSubmissions(month, year)

    // Combine submissions and pending dienstplaene
    const allSubmissions = useMemo(() => {
        return [...submissions, ...pendingDienstplaene]
    }, [submissions, pendingDienstplaene])

    // Get initials for avatar
    const getInitials = (name: string): string => {
        const parts = name.trim().split(/\s+/)
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        }
        return name.substring(0, 2).toUpperCase()
    }

    // Group submissions by client
    const groupedByClient = useMemo(() => {
        const map = new Map<string, ClientGroup>()

        allSubmissions.forEach(sub => {
            // Determine client ID and name
            const clientId = sub.clientId || sub.client?.id || "unknown"
            const clientName = sub.client
                ? `${sub.client.firstName} ${sub.client.lastName}`
                : sub.recipientName || "Unbekannter Klient"
            const clientEmail = sub.client?.email || sub.recipientEmail || null

            if (!map.has(clientId)) {
                map.set(clientId, {
                    clientId,
                    clientName,
                    clientEmail,
                    submissions: []
                })
            }

            map.get(clientId)!.submissions.push(sub)
        })

        // Convert to array and sort by client name
        return Array.from(map.values()).sort((a, b) => {
            if (a.clientId === "unknown") return 1
            if (b.clientId === "unknown") return -1
            return a.clientName.localeCompare(b.clientName)
        })
    }, [allSubmissions])

    // Calculate stats
    const stats = useMemo(() => {
        const totalCount = allSubmissions.length
        const completedCount = allSubmissions.filter(s => s.status === "COMPLETED").length
        const pendingCount = totalCount - completedCount

        return { totalCount, completedCount, pendingCount }
    }, [allSubmissions])

    // Expand all clients by default when data loads
    useMemo(() => {
        if (groupedByClient.length > 0) {
            setExpandedClients(new Set(groupedByClient.map(g => g.clientId)))
        }
    }, [groupedByClient.length])

    // Toggle client expansion
    const toggleClient = (clientId: string) => {
        setExpandedClients(prev => {
            const next = new Set(prev)
            if (next.has(clientId)) {
                next.delete(clientId)
            } else {
                next.add(clientId)
            }
            return next
        })
    }

    // Month navigation
    const navigateMonth = (delta: number) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
        setCurrentDate(newDate)
    }

    // Open Combined Timesheet Modal
    const handleViewCombined = (submission: Submission) => {
        if (!submission.clientId) {
            showToast("error", "Klient-Zuordnung fehlt für diese Einreichung")
            return
        }
        setSelectedSubmission(submission)
        setShowCombinedModal(true)
    }

    const handleDownload = async (submission: Submission) => {
        if (!submission.pdfUrl) {
            showToast("error", "Keine PDF-URL vorhanden")
            return
        }

        try {
            window.open(submission.pdfUrl, "_blank")
            showToast("success", "PDF wird geöffnet")
        } catch (error) {
            showToast("error", "Fehler beim Öffnen der PDF")
        }
    }

    const handleSendEmail = async (submission: Submission) => {
        if (!submission.recipientEmail) {
            showToast("error", "Keine E-Mail-Adresse vorhanden")
            return
        }

        if (!submission.clientId) {
            showToast("error", "Klient-Information fehlt")
            return
        }

        // Check if all employees have signed
        const allEmployeesSigned = submission.signedEmployees === submission.totalEmployees
        if (!allEmployeesSigned) {
            showToast("error", "E-Mail kann nur versendet werden, wenn alle Mitarbeiter unterschrieben haben")
            return
        }

        try {
            const res = await fetch("/api/admin/submissions/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sheetFileName: submission.sheetFileName,
                    month: submission.month,
                    year: submission.year,
                    clientId: submission.clientId
                })
            })

            if (res.ok) {
                showToast("success", "E-Mail erfolgreich versendet")
            } else {
                const err = await res.json()
                showToast("error", err.error || "Fehler beim E-Mail-Versand")
            }
        } catch (error) {
            showToast("error", "Netzwerkfehler beim E-Mail-Versand")
        }
    }

    return (
        <div className="min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <FileText className="text-violet-400" size={28} />
                            Stundennachweise
                        </h1>
                        <p className="text-sm text-neutral-400 mt-1">
                            Team-basierte Übersicht mit Signaturen
                        </p>
                    </div>

                    {/* Month Navigation */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigateMonth(-1)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors duration-150 text-neutral-400 hover:text-white"
                            aria-label="Vorheriger Monat"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-white font-semibold min-w-[140px] text-center">
                            {MONTH_NAMES[month - 1]} {year}
                        </span>
                        <button
                            onClick={() => navigateMonth(1)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors duration-150 text-neutral-400 hover:text-white"
                            aria-label="Nächster Monat"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                        <p className="text-neutral-400 text-sm">Gesamt</p>
                        <p className="text-2xl font-bold text-white">{stats.totalCount}</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                        <p className="text-neutral-400 text-sm">Abgeschlossen</p>
                        <p className="text-2xl font-bold text-emerald-400">{stats.completedCount}</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                        <p className="text-neutral-400 text-sm">Ausstehend</p>
                        <p className="text-2xl font-bold text-amber-400">{stats.pendingCount}</p>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 bg-neutral-800 animate-pulse rounded-lg" />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && groupedByClient.length === 0 && (
                    <div className="text-center py-12 text-neutral-500">
                        <FileText size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Keine Dienste im {MONTH_NAMES[month - 1]} {year}</p>
                        <p className="text-sm mt-2">Es gibt keine geplanten Schichten für diesen Monat.</p>
                    </div>
                )}

                {/* Client Groups */}
                {!isLoading && groupedByClient.length > 0 && (
                    <div className="space-y-4">
                        {groupedByClient.map(group => {
                            const isExpanded = expandedClients.has(group.clientId)
                            const completedInGroup = group.submissions.filter(s => s.status === "COMPLETED").length

                            return (
                                <div key={group.clientId} className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
                                    {/* Client Group Header */}
                                    <button
                                        onClick={() => toggleClient(group.clientId)}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50 transition-colors duration-150"
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Client Avatar */}
                                            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-semibold border-2 border-neutral-900">
                                                {getInitials(group.clientName)}
                                            </div>

                                            <div className="text-left">
                                                <h3 className="font-semibold text-white">{group.clientName}</h3>
                                                <p className="text-sm text-neutral-400">
                                                    {group.submissions.length} Team{group.submissions.length !== 1 ? "s" : ""} • {completedInGroup} abgeschlossen
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <SignatureProgress
                                                completed={completedInGroup}
                                                total={group.submissions.length}
                                                variant="text"
                                                size="sm"
                                            />
                                            {isExpanded ? <ChevronUp size={20} className="text-neutral-400" /> : <ChevronDown size={20} className="text-neutral-400" />}
                                        </div>
                                    </button>

                                    {/* Team Submission Rows */}
                                    {isExpanded && (
                                        <div className="border-t border-neutral-800 divide-y divide-neutral-800">
                                            {group.submissions.map(submission => (
                                                <TeamSubmissionRow
                                                    key={submission.id || submission.sheetFileName}
                                                    submission={submission}
                                                    onViewCombined={() => handleViewCombined(submission)}
                                                    onDownload={() => handleDownload(submission)}
                                                    onSendEmail={() => handleSendEmail(submission)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Combined Timesheet Modal */}
            {selectedSubmission && selectedSubmission.clientId && (
                <CombinedTimesheetModal
                    isOpen={showCombinedModal}
                    sheetFileName={selectedSubmission.sheetFileName}
                    clientId={selectedSubmission.clientId}
                    month={selectedSubmission.month}
                    year={selectedSubmission.year}
                    onClose={() => {
                        setShowCombinedModal(false)
                        setSelectedSubmission(null)
                    }}
                />
            )}
        </div>
    )
}
