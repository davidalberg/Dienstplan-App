"use client"

import { useState } from "react"
import { Send, Clock, CheckCircle, X, AlertCircle } from "lucide-react"
import { calculateTotalHoursFromTimesheets } from "@/lib/time-utils"

interface MonthlySummaryProps {
    timesheets: any[]
    onRefresh: () => void
    month?: number
    year?: number
}

export default function MonthlySummary({ timesheets, onRefresh, month, year }: MonthlySummaryProps) {
    const [loading, setLoading] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [error, setError] = useState("")

    // Sichere Extraktion von month/year mit Fallback auf Props
    const currentMonth = timesheets.length > 0 ? timesheets[0].month : month
    const currentYear = timesheets.length > 0 ? timesheets[0].year : year

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

    const handleSubmit = async () => {
        // Doppelte Sicherheitsprüfung
        if (!currentMonth || !currentYear) {
            setError("Keine Zeiterfassungen vorhanden")
            return
        }

        if (!confirm("Möchten Sie den aktuellen Monat wirklich abschließen? Eine Änderung ist danach nur noch über den Admin möglich.")) return

        setLoading(true)
        setError("")

        try {
            const res = await fetch("/api/timesheets/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month: currentMonth,
                    year: currentYear,
                })
            })

            if (!res.ok) {
                const data = await res.json()
                setError(data.error || "Einreichung fehlgeschlagen")
            } else {
                onRefresh()
            }
        } catch (err) {
            setError("Ein unerwarteter Fehler ist aufgetreten")
        } finally {
            setLoading(false)
        }
    }

    const handleCancelSubmit = async () => {
        // Doppelte Sicherheitsprüfung
        if (!currentMonth || !currentYear) {
            setError("Keine Zeiterfassungen vorhanden")
            return
        }

        if (!confirm("Möchten Sie die Einreichung wirklich rückgängig machen? Sie können den Monat dann erneut bearbeiten.")) return

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

            if (!res.ok) {
                const data = await res.json()
                setError(data.error || "Abbruch fehlgeschlagen")
            } else {
                onRefresh()
            }
        } catch (err) {
            setError("Ein unerwarteter Fehler ist aufgetreten")
        } finally {
            setCancelling(false)
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
                    Für diesen Monat wurden noch keine Dienste importiert.
                </p>
            </div>
        )
    }

    const total = calculateTotalHours()
    const ready = isReadyToSubmit()
    const submitted = isAlreadySubmitted()

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
                            Monat erfolgreich eingereicht
                        </div>
                        <button
                            type="button"
                            onClick={handleCancelSubmit}
                            disabled={cancelling}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold transition-all bg-white/20 text-white hover:bg-white/30 disabled:opacity-50"
                        >
                            <X size={18} />
                            {cancelling ? "Wird abgebrochen..." : "Einreichung rückgängig machen"}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!ready || loading}
                        className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold transition-all shadow-lg ${ready
                            ? "bg-white text-blue-600 shadow-blue-800/20 hover:scale-[1.02]"
                            : "bg-blue-400/50 text-blue-200 cursor-not-allowed"
                            }`}
                    >
                        <Send size={18} />
                        {loading ? "Wird eingereicht..." : "Monat Final Einreichen"}
                    </button>
                )}

                {!ready && !submitted && (
                    <p className="text-center text-[10px] text-blue-200 font-medium">
                        Bitte bestätigen Sie alle geplanten Dienste zum Einreichen.
                    </p>
                )}
            </div>
        </div>
    )
}
