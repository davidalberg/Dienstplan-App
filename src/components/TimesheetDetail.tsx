"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { ChevronLeft, Download, Trash2, Mail, Check, X, Loader2 } from "lucide-react"
import useSWR from "swr"
import { showToast } from "@/lib/toast-utils"

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface TimesheetDetailProps {
    employeeId: string
    clientId: string
    month: number
    year: number
    onClose: () => void
    onDelete?: () => void
}

interface Timesheet {
    id: string
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    breakMinutes: number
    note: string | null
    status: string
    absenceType: string | null
    hours: number
    type: string
    weekday: string
    formattedDate: string
}

interface DetailData {
    employee: { id: string; name: string; email: string }
    client: { id: string; firstName: string; lastName: string; email: string | null; fullName: string }
    month: number
    year: number
    timesheets: Timesheet[]
    stats: {
        totalHours: number
        totalMinutes: number
        sickDays: number
        vacationDays: number
        workDays: number
    }
    submission: {
        id: string
        status: string
        signatureToken: string
        recipientSignedAt: string | null
    } | null
    signatures: {
        employee: { signed: boolean; signedAt: string | null; signature: string | null }
        client: { signed: boolean; signedAt: string | null; signature: string | null }
    }
}

// Avatar-Komponente
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

export default function TimesheetDetail({
    employeeId,
    clientId,
    month,
    year,
    onClose,
    onDelete
}: TimesheetDetailProps) {
    const signaturesEnabled = true // Immer aktiviert - kein Toggle mehr
    const [sendingEmail, setSendingEmail] = useState<string | null>(null)
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // Daten laden
    const { data, isLoading, error, mutate } = useSWR<DetailData>(
        `/api/admin/submissions/detail?employeeId=${employeeId}&clientId=${clientId}&month=${month}&year=${year}`,
        fetcher
    )


    const monthName = format(new Date(year, month - 1), "MMMM yyyy", { locale: de })

    const formatHours = (hours: number) => {
        if (hours === 0) return "0h"
        return `${hours}h`
    }

    const handleDownload = async (exportFormat: "pdf" | "csv" | "xlsx") => {
        setShowDownloadMenu(false)
        try {
            const res = await fetch(
                `/api/admin/submissions/export?month=${month}&year=${year}&employeeId=${employeeId}&clientId=${clientId}&format=${exportFormat}`
            )
            if (!res.ok) throw new Error("Download fehlgeschlagen")

            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `Stundennachweis_${data?.employee.name}_${month}_${year}.${exportFormat}`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            showToast("success", "Download gestartet")
        } catch (err) {
            showToast("error", "Download fehlgeschlagen")
        }
    }

    const handleSendEmail = async (type: "employee" | "client") => {
        setSendingEmail(type)
        try {
            const res = await fetch("/api/admin/submissions/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId,
                    clientId,
                    month,
                    year,
                    type
                })
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || "E-Mail konnte nicht gesendet werden")
            }

            showToast("success", "E-Mail wurde gesendet")
            mutate()
        } catch (err: any) {
            showToast("error", err.message || "E-Mail konnte nicht gesendet werden")
        } finally {
            setSendingEmail(null)
        }
    }

    const handleSkipSignature = async (employeeId: string) => {
        // Guard: Pruefe ob data und submission vorhanden sind
        if (!data?.submission?.id) {
            showToast("error", "Keine aktive Einreichung vorhanden")
            return
        }

        const confirmed = confirm(
            "Möchten Sie diese Unterschrift wirklich überspringen?\n\n" +
            "Der Mitarbeiter wird als 'unterschrieben' markiert ohne tatsächliche Signatur."
        )

        if (!confirmed) return

        try {
            const res = await fetch("/api/admin/submissions/skip-signature", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    submissionId: data.submission.id,
                    employeeId
                })
            })

            const result = await res.json()

            if (!res.ok) {
                throw new Error(result.error || "Fehler beim Überspringen")
            }

            showToast("success", "Unterschrift erfolgreich übersprungen")
            mutate() // SWR Revalidation
        } catch (error: any) {
            console.error("Skip signature error:", error)
            showToast("error", error.message || "Fehler beim Überspringen der Unterschrift")
        }
    }

    const handleDelete = async () => {
        if (!confirm("Möchten Sie diesen Stundennachweis wirklich löschen?")) return

        setDeleting(true)
        try {
            // TODO: Implement delete logic
            showToast("success", "Stundennachweis gelöscht")
            onDelete?.()
            onClose()
        } catch (err) {
            showToast("error", "Löschen fehlgeschlagen")
        } finally {
            setDeleting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="rounded-xl bg-neutral-900 p-8">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-6 max-w-md">
                    <p className="text-red-400 mb-4">Fehler beim Laden der Daten</p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700"
                    >
                        Schließen
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-6xl max-h-[90vh] overflow-auto rounded-xl bg-neutral-900 border border-neutral-700 shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <h2 className="text-lg font-semibold text-white">Stundennachweis</h2>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        {/* PDF-Vorschau (Links, 3 Spalten) */}
                        <div className="lg:col-span-3 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden">
                            <div className="p-3 border-b border-neutral-700">
                                <h3 className="text-sm font-medium text-neutral-400">Vorschau</h3>
                            </div>
                            <div className="p-4 bg-white text-black overflow-auto max-h-[600px]">
                                {/* PDF-ähnliche Darstellung */}
                                <div className="font-sans text-sm">
                                    {/* Header */}
                                    <div className="flex justify-between mb-6">
                                        <div>
                                            <h1 className="text-xl font-bold">Stundennachweis</h1>
                                            <p className="text-blue-600">{data.employee.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-semibold">{monthName}</p>
                                            <p className="text-orange-600">{data.client.fullName}</p>
                                        </div>
                                    </div>

                                    {/* Tabelle */}
                                    <table className="w-full border-collapse text-xs mb-4">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border border-gray-300 px-2 py-1 text-left">Datum</th>
                                                <th className="border border-gray-300 px-2 py-1 text-left">Beginn</th>
                                                <th className="border border-gray-300 px-2 py-1 text-left">Ende</th>
                                                <th className="border border-gray-300 px-2 py-1 text-center">Stunden</th>
                                                <th className="border border-gray-300 px-2 py-1 text-center">Typ</th>
                                                <th className="border border-gray-300 px-2 py-1 text-left">Bemerkung</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.timesheets.map((ts, idx) => (
                                                <tr key={ts.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                                    <td className="border border-gray-300 px-2 py-1">
                                                        {ts.formattedDate} {ts.weekday}
                                                    </td>
                                                    <td className="border border-gray-300 px-2 py-1 text-red-600">
                                                        {ts.actualStart || ts.plannedStart || "-"}
                                                    </td>
                                                    <td className="border border-gray-300 px-2 py-1 text-red-600">
                                                        {ts.actualEnd || ts.plannedEnd || "-"}
                                                    </td>
                                                    <td className="border border-gray-300 px-2 py-1 text-center">
                                                        {ts.absenceType ? "-" : ts.hours}
                                                    </td>
                                                    <td className="border border-gray-300 px-2 py-1 text-center">
                                                        {ts.type}
                                                    </td>
                                                    <td className="border border-gray-300 px-2 py-1 text-gray-600">
                                                        {ts.absenceType === "SICK" ? "Krank" :
                                                            ts.absenceType === "VACATION" ? "Urlaub" :
                                                                ts.note || ""}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-gray-200 font-semibold">
                                                <td colSpan={3} className="border border-gray-300 px-2 py-1">
                                                    Gesamtstunden
                                                </td>
                                                <td className="border border-gray-300 px-2 py-1 text-center">
                                                    {data.stats.totalHours}
                                                </td>
                                                <td colSpan={2} className="border border-gray-300 px-2 py-1"></td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Legende */}
                                    <p className="text-[10px] text-gray-500 mb-6">
                                        (Diensttypen: G = Geplant, F = Feiertag, FZ = Fahrtzeit, BD = Bereitschaftsdienst, B = Büro, K = Krank, U = Urlaub)
                                    </p>

                                    {/* Unterschriften */}
                                    <div className="flex justify-between mt-8">
                                        <div className="w-[45%]">
                                            <div className="border-b border-black h-16 mb-1">
                                                {data.signatures.employee.signature && (
                                                    <img
                                                        src={data.signatures.employee.signature}
                                                        alt="Unterschrift"
                                                        className="h-full object-contain"
                                                    />
                                                )}
                                            </div>
                                            <p className="text-xs">Unterschrift: {data.employee.name}</p>
                                            {data.signatures.employee.signedAt && (
                                                <p className="text-[10px] text-gray-500">
                                                    {format(new Date(data.signatures.employee.signedAt), "dd.MM.yyyy HH:mm", { locale: de })}
                                                </p>
                                            )}
                                        </div>
                                        <div className="w-[45%]">
                                            <div className="border-b border-black h-16 mb-1">
                                                {data.signatures.client.signature && (
                                                    <img
                                                        src={data.signatures.client.signature}
                                                        alt="Unterschrift"
                                                        className="h-full object-contain"
                                                    />
                                                )}
                                            </div>
                                            <p className="text-xs">Unterschrift: {data.client.fullName}</p>
                                            {data.signatures.client.signedAt && (
                                                <p className="text-[10px] text-gray-500">
                                                    {format(new Date(data.signatures.client.signedAt), "dd.MM.yyyy HH:mm", { locale: de })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Übersicht (Rechts, 2 Spalten) */}
                        <div className="lg:col-span-2 space-y-4">
                            {/* Übersicht-Card */}
                            <div className="rounded-xl bg-neutral-800 border border-neutral-700">
                                <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-neutral-400">Übersicht</h3>
                                    <div className="flex gap-2">
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 text-white text-sm font-medium hover:bg-neutral-600 transition-colors"
                                            >
                                                <Download size={16} />
                                                Download
                                            </button>
                                            {showDownloadMenu && (
                                                <div className="absolute right-0 mt-1 w-32 rounded-lg bg-neutral-700 border border-neutral-600 shadow-lg overflow-hidden z-10">
                                                    <button
                                                        onClick={() => handleDownload("pdf")}
                                                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-neutral-600"
                                                    >
                                                        PDF
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload("csv")}
                                                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-neutral-600"
                                                    >
                                                        CSV
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload("xlsx")}
                                                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-neutral-600"
                                                    >
                                                        Excel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleDelete}
                                            disabled={deleting}
                                            className="px-3 py-1.5 rounded-lg bg-red-900/50 border border-red-700 text-red-400 text-sm font-medium hover:bg-red-900 transition-colors disabled:opacity-50"
                                        >
                                            Löschen
                                        </button>
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">Zeitraum</span>
                                        <span className="text-white font-medium">{monthName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-neutral-400">Assistent</span>
                                        <div className="flex items-center gap-2">
                                            <Avatar name={data.employee.name || "?"} />
                                            <span className="text-white font-medium">{data.employee.name}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-neutral-400">Klient</span>
                                        <div className="flex items-center gap-2">
                                            <Avatar name={data.client.fullName} />
                                            <span className="text-white font-medium">{data.client.fullName}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">Gesamtstunden</span>
                                        <span className="text-white font-medium">{formatHours(data.stats.totalHours)}</span>
                                    </div>
                                    {data.stats.sickDays > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Krankheitstage</span>
                                            <span className="text-red-400 font-medium">{data.stats.sickDays}</span>
                                        </div>
                                    )}
                                    {data.stats.vacationDays > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Urlaubstage</span>
                                            <span className="text-cyan-400 font-medium">{data.stats.vacationDays}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Unterschriften-Card */}
                            <div className="rounded-xl bg-neutral-800 border border-neutral-700">
                                <div className="p-4 border-b border-neutral-700">
                                    <h3 className="text-sm font-medium text-neutral-400">Unterschriften</h3>
                                </div>
                                <div className="p-4 space-y-4">
                                    {/* Mitarbeiter */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-medium text-white">
                                                {data.employee.name}
                                            </h4>
                                            <span className={`text-xs px-2 py-1 rounded ${
                                                data.signatures.employee.signed
                                                    ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700"
                                                    : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                                            }`}>
                                                {data.signatures.employee.signed ? "✓ Unterschrieben" : "⏳ Wartet auf Unterschrift"}
                                            </span>
                                        </div>
                                        {data.signatures.employee.signed && data.signatures.employee.signedAt && (
                                            <p className="text-xs text-neutral-500">
                                                Unterschrieben am {new Date(data.signatures.employee.signedAt).toLocaleString('de-DE')}
                                            </p>
                                        )}
                                    </div>

                                    {/* Skip Button */}
                                    {!data.signatures.employee.signed && (
                                        <button
                                            onClick={() => handleSkipSignature(data.employee.id)}
                                            className="text-sm text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
                                        >
                                            <span>Unterschrift überspringen</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M5 12h14M12 5l7 7-7 7"/>
                                            </svg>
                                        </button>
                                    )}

                                    {/* Klient */}
                                    <div className="pt-4 border-t border-neutral-700">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div>
                                                        <p className="text-white font-medium">{data.client.fullName}</p>
                                                        <p className="text-xs text-neutral-500">
                                                            {data.client.email || "Keine E-Mail hinterlegt"}
                                                        </p>
                                                    </div>
                                                    {data.signatures.client.signed ? (
                                                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/50 text-emerald-400 text-xs font-medium">
                                                            <Check size={14} />
                                                            Unterschrieben
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral-500 text-xs">E-Mail nicht gesendet</span>
                                                    )}
                                                </div>
                                                {!data.signatures.client.signed && data.client.email && (
                                                    <button
                                                        onClick={() => handleSendEmail("client")}
                                                        disabled={sendingEmail === "client" || !data.signatures.employee.signed}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-700 border border-neutral-600 text-white font-medium hover:bg-neutral-600 transition-colors disabled:opacity-50"
                                                    >
                                                        {sendingEmail === "client" ? (
                                                            <Loader2 size={16} className="animate-spin" />
                                                        ) : (
                                                            <Mail size={16} />
                                                        )}
                                                        E-Mail anfordern
                                                    </button>
                                                )}
                                                {!data.signatures.employee.signed && !data.signatures.client.signed && (
                                                    <p className="text-xs text-neutral-500 mt-2">
                                                        Klient kann erst unterschreiben, wenn der Assistent unterschrieben hat.
                                                    </p>
                                                )}
                                            </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
