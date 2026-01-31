"use client"

import { useState, useMemo } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import {
    X,
    Eye,
    CheckCircle2,
    Clock,
    Download,
    FileSpreadsheet,
    Loader2,
    Mail
} from "lucide-react"
import useSWR from "swr"
import { showToast } from "@/lib/toast-utils"

const fetcher = (url: string) => fetch(url).then(res => res.json())

// German month names
const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

interface CombinedTimesheetModalProps {
    isOpen: boolean
    onClose: () => void
    sheetFileName: string
    clientId: string
    month: number
    year: number
    onOpenIndividual?: (employeeId: string, clientId: string) => void
}

interface Timesheet {
    id: string
    date: string
    formattedDate: string
    weekday: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    hours: number
    note: string | null
    absenceType: string | null
    employeeId: string
    employeeName: string
}

interface EmployeeInfo {
    id: string
    name: string
    email: string
    stats: {
        totalHours: number
    }
}

interface CombinedTimesheetData {
    client: {
        id: string
        fullName: string
        email: string | null
    }
    employees: EmployeeInfo[]
    timesheets: Timesheet[]
    totalHours: number
    signatures: {
        employees: Array<{
            employeeId: string
            employeeName: string
            signed: boolean
            signedAt: string | null
        }>
        client: {
            signed: boolean
            signedAt: string | null
            signatureUrl: string | null
        }
    }
}

interface GroupedTimesheet {
    date: string
    formattedDate: string
    weekday: string
    isNewDate: boolean
    timesheets: Timesheet[]
}

// Avatar component
function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
    const colors = [
        "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
        "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500",
        "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500",
        "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500"
    ]
    const colorIndex = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    const sizeClasses = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm"

    return (
        <div className={`${colors[colorIndex]} ${sizeClasses} rounded-full flex items-center justify-center text-white font-semibold`}>
            {initials}
        </div>
    )
}

export default function CombinedTimesheetModal({
    isOpen,
    onClose,
    sheetFileName,
    clientId,
    month,
    year,
    onOpenIndividual
}: CombinedTimesheetModalProps) {
    const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null)
    const [sendingEmail, setSendingEmail] = useState(false)

    // Fetch combined timesheet data
    const { data, error, isLoading } = useSWR<CombinedTimesheetData>(
        isOpen
            ? `/api/admin/timesheets/combined?sheetFileName=${encodeURIComponent(sheetFileName)}&clientId=${clientId}&month=${month}&year=${year}`
            : null,
        fetcher
    )

    const monthName = `${MONTH_NAMES[month - 1]} ${year}`

    // Group timesheets chronologically by date
    const groupedTimesheets = useMemo((): GroupedTimesheet[] => {
        if (!data) return []

        // Sort all timesheets by date
        const sorted = [...data.timesheets].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        // Group by date
        const groups: GroupedTimesheet[] = []
        let currentDate = ''

        sorted.forEach(ts => {
            const isNewDate = ts.date !== currentDate

            if (isNewDate) {
                currentDate = ts.date
                groups.push({
                    date: ts.date,
                    formattedDate: ts.formattedDate,
                    weekday: ts.weekday,
                    isNewDate: true,
                    timesheets: [ts]
                })
            } else {
                groups[groups.length - 1].timesheets.push(ts)
            }
        })

        return groups
    }, [data])

    // Format date for display
    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), "dd.MM.yyyy, HH:mm", { locale: de })
        } catch {
            return dateStr
        }
    }

    // Handle opening individual timesheet
    const handleOpenIndividual = (employeeId: string) => {
        if (onOpenIndividual) {
            onOpenIndividual(employeeId, clientId)
        }
    }

    // Handle PDF download
    const handleDownloadPDF = async () => {
        setDownloading('pdf')
        try {
            const res = await fetch(
                `/api/admin/timesheets/combined/export?sheetFileName=${encodeURIComponent(sheetFileName)}&clientId=${clientId}&month=${month}&year=${year}&format=pdf`
            )

            if (!res.ok) throw new Error("Download fehlgeschlagen")

            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${sheetFileName}_${month}_${year}.pdf`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            showToast("success", "PDF-Download gestartet")
        } catch (err) {
            showToast("error", "PDF-Download fehlgeschlagen")
        } finally {
            setDownloading(null)
        }
    }

    // Handle Excel download
    const handleDownloadExcel = async () => {
        setDownloading('excel')
        try {
            const res = await fetch(
                `/api/admin/timesheets/combined/export?sheetFileName=${encodeURIComponent(sheetFileName)}&clientId=${clientId}&month=${month}&year=${year}&format=xlsx`
            )

            if (!res.ok) throw new Error("Download fehlgeschlagen")

            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${sheetFileName}_${month}_${year}.xlsx`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            showToast("success", "Excel-Download gestartet")
        } catch (err) {
            showToast("error", "Excel-Download fehlgeschlagen")
        } finally {
            setDownloading(null)
        }
    }

    // Handle email sending
    const handleSendEmail = async () => {
        if (!clientId || !data?.client) {
            showToast("error", "Klient-Information fehlt")
            return
        }

        setSendingEmail(true)
        try {
            const res = await fetch("/api/admin/submissions/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sheetFileName,
                    month,
                    year,
                    clientId
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
        } finally {
            setSendingEmail(false)
        }
    }

    // Handle escape key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div className="bg-neutral-900 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                    <div>
                        <h2 className="text-xl font-bold text-white">
                            Kombinierter Stundennachweis - {sheetFileName}
                        </h2>
                        <p className="text-sm text-neutral-400 mt-1">
                            {monthName}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                        aria-label="Schließen"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-red-400 mb-4">Fehler beim Laden der Daten</p>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                )}

                {/* Content: Two-column layout */}
                {data && !isLoading && (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left: Combined Table */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold text-white mb-2">Chronologische Übersicht</h3>
                                <p className="text-sm text-neutral-400">
                                    Alle Schichten von {data.employees.length} Mitarbeiter{data.employees.length !== 1 ? 'n' : ''}
                                </p>
                            </div>

                            {/* Table */}
                            <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-800 sticky top-0">
                                        <tr className="border-b border-neutral-700">
                                            <th className="px-3 py-2 text-left text-neutral-400 font-medium">Datum</th>
                                            <th className="px-3 py-2 text-left text-neutral-400 font-medium">Mitarbeiter</th>
                                            <th className="px-3 py-2 text-left text-neutral-400 font-medium">Geplant</th>
                                            <th className="px-3 py-2 text-left text-neutral-400 font-medium">Tatsächlich</th>
                                            <th className="px-3 py-2 text-right text-neutral-400 font-medium">Stunden</th>
                                            <th className="px-3 py-2 text-left text-neutral-400 font-medium">Notiz</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {groupedTimesheets.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                                                    Keine Schichten für diesen Zeitraum
                                                </td>
                                            </tr>
                                        )}
                                        {groupedTimesheets.map((group, groupIdx) => (
                                            <>
                                                {/* Date Header Row */}
                                                <tr key={`header-${groupIdx}`} className="bg-neutral-800/50">
                                                    <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-neutral-300">
                                                        {group.formattedDate} {group.weekday}
                                                    </td>
                                                </tr>

                                                {/* Employee Rows for this date */}
                                                {group.timesheets.map((ts) => (
                                                    <tr key={ts.id} className="hover:bg-neutral-800/30 transition-colors">
                                                        <td className="px-3 py-2 text-neutral-400 text-xs">
                                                            {/* Empty - date shown in header */}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <button
                                                                onClick={() => handleOpenIndividual(ts.employeeId)}
                                                                className="text-white hover:text-violet-400 transition font-medium text-left"
                                                            >
                                                                {ts.employeeName}
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-2 text-neutral-400">
                                                            {ts.plannedStart && ts.plannedEnd
                                                                ? `${ts.plannedStart} - ${ts.plannedEnd}`
                                                                : '-'
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 text-neutral-400">
                                                            {ts.actualStart && ts.actualEnd
                                                                ? `${ts.actualStart} - ${ts.actualEnd}`
                                                                : ts.absenceType === "SICK"
                                                                    ? "Krank"
                                                                    : ts.absenceType === "VACATION"
                                                                        ? "Urlaub"
                                                                        : '-'
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-white font-medium">
                                                            {ts.absenceType ? '-' : `${ts.hours.toFixed(2)}h`}
                                                        </td>
                                                        <td className="px-3 py-2 text-neutral-400 text-xs truncate max-w-xs">
                                                            {ts.note || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Right: Sidebar with Signatures & Stats */}
                        <div className="w-80 border-l border-neutral-800 overflow-y-auto p-6">
                            {/* Employee Signatures */}
                            <div className="space-y-4 mb-6">
                                <h3 className="text-sm font-semibold text-white">Mitarbeiter-Unterschriften</h3>

                                <div className="space-y-2">
                                    {data.signatures.employees.map(emp => (
                                        <div
                                            key={emp.employeeId}
                                            className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                                emp.signed
                                                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                                                    : 'bg-neutral-800 border border-neutral-700'
                                            }`}
                                        >
                                            {emp.signed ? (
                                                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                                            ) : (
                                                <Clock size={16} className="text-neutral-500 flex-shrink-0" />
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${
                                                    emp.signed ? 'text-emerald-400' : 'text-neutral-400'
                                                }`}>
                                                    {emp.employeeName}
                                                </p>
                                                {emp.signedAt && (
                                                    <p className="text-xs text-neutral-500">
                                                        {formatDate(emp.signedAt)}
                                                    </p>
                                                )}
                                            </div>

                                            {emp.signed && onOpenIndividual && (
                                                <button
                                                    onClick={() => handleOpenIndividual(emp.employeeId)}
                                                    className="text-neutral-400 hover:text-violet-400 transition-colors flex-shrink-0"
                                                    title="Einzelansicht öffnen"
                                                    aria-label="Einzelansicht öffnen"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Client Signature */}
                            <div className="space-y-4 mb-6">
                                <h3 className="text-sm font-semibold text-white">Klient-Unterschrift</h3>

                                {data.signatures.client.signed ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <CheckCircle2 size={16} className="text-emerald-400" />
                                            <span className="text-sm font-medium text-emerald-400">Unterschrieben</span>
                                        </div>

                                        {data.signatures.client.signatureUrl && (
                                            <div className="bg-white rounded p-2 mb-3">
                                                <img
                                                    src={data.signatures.client.signatureUrl}
                                                    alt="Klient-Unterschrift"
                                                    className="w-full h-16 object-contain"
                                                />
                                            </div>
                                        )}

                                        <div className="text-xs text-neutral-400">
                                            <p className="font-medium text-white">{data.client.fullName}</p>
                                            {data.signatures.client.signedAt && (
                                                <p>{formatDate(data.signatures.client.signedAt)}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock size={16} className="text-neutral-500" />
                                            <span className="text-sm font-medium text-neutral-400">Ausstehend</span>
                                        </div>
                                        <p className="text-xs text-neutral-500">
                                            Der Klient wurde noch nicht zur Unterschrift aufgefordert.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="space-y-4 mb-6">
                                <h3 className="text-sm font-semibold text-white">Statistik</h3>

                                <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-sm text-neutral-400">Gesamt:</span>
                                            <span className="text-sm font-bold text-white">
                                                {data.totalHours.toFixed(2)}h
                                            </span>
                                        </div>

                                        {data.employees.map(emp => (
                                            <div key={emp.id} className="flex justify-between text-xs">
                                                <span className="text-neutral-400 truncate mr-2">- {emp.name}:</span>
                                                <span className="text-neutral-300 font-medium flex-shrink-0">
                                                    {emp.stats.totalHours.toFixed(2)}h
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* E-Mail versenden Button */}
                            <div className="border-t border-neutral-700 pt-4 mb-4">
                                <button
                                    onClick={handleSendEmail}
                                    disabled={sendingEmail || !data.signatures.employees.every(sig => sig.signed)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-medium transition"
                                >
                                    {sendingEmail ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Sendet...
                                        </>
                                    ) : (
                                        <>
                                            <Mail size={16} />
                                            E-Mail an Klient senden
                                        </>
                                    )}
                                </button>
                                {!data.signatures.employees.every(sig => sig.signed) && (
                                    <p className="text-xs text-neutral-500 mt-2 text-center">
                                        E-Mail kann nur versendet werden, wenn alle Mitarbeiter unterschrieben haben
                                    </p>
                                )}
                            </div>

                            {/* Download Buttons */}
                            <div className="flex gap-2 pt-4 border-t border-neutral-800">
                                <button
                                    onClick={handleDownloadPDF}
                                    disabled={downloading !== null}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                                >
                                    {downloading === 'pdf' ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Download size={16} />
                                    )}
                                    PDF
                                </button>

                                <button
                                    onClick={handleDownloadExcel}
                                    disabled={downloading !== null}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                                >
                                    {downloading === 'excel' ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <FileSpreadsheet size={16} />
                                    )}
                                    Excel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
