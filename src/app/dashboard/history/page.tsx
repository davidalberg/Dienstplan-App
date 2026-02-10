"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle } from "lucide-react"


interface HistoryShift {
    id: string
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    status: string
    absenceType: string | null
    note: string | null
}

const MONTH_NAMES = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

export default function HistoryPage() {
    const { data: session } = useSession()
    const [shifts, setShifts] = useState<HistoryShift[]>([])
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())

    useEffect(() => {
        if (!session) return
        setLoading(true)
        fetch(`/api/timesheets?month=${month}&year=${year}`)
            .then(res => res.json())
            .then(data => setShifts(data.timesheets || []))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [session, month, year])

    const prevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1) }
        else setMonth(m => m - 1)
    }

    const nextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1) }
        else setMonth(m => m + 1)
    }

    // Berechne Gesamtstunden
    const totalHours = shifts.reduce((sum, s) => {
        const start = s.actualStart || s.plannedStart
        const end = s.actualEnd || s.plannedEnd
        if (!start || !end || s.absenceType) return sum
        const [sh, sm] = start.split(":").map(Number)
        const [eh, em] = end.split(":").map(Number)
        let diff = (eh * 60 + em) - (sh * 60 + sm)
        if (diff < 0) diff += 24 * 60
        return sum + diff / 60
    }, 0)

    if (!session) return null

    return (
        <div className="pb-20">
            <header className="sticky top-0 z-10 border-b bg-white p-4 shadow-sm">
                <div className="mx-auto flex max-w-2xl items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-black">Schichtverlauf</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100">
                            <ChevronLeft size={18} className="text-gray-600" />
                        </button>
                        <span className="text-sm font-bold text-black min-w-[130px] text-center">
                            {MONTH_NAMES[month - 1]} {year}
                        </span>
                        <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100">
                            <ChevronRight size={18} className="text-gray-600" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-2xl p-4">
                {/* Zusammenfassung */}
                <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between items-center">
                    <div>
                        <p className="text-sm text-gray-500">Gesamt</p>
                        <p className="text-2xl font-bold text-black">{totalHours.toFixed(1)}h</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-500">Schichten</p>
                        <p className="text-2xl font-bold text-black">{shifts.length}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="py-10 text-center text-gray-500">Lade Daten...</div>
                ) : shifts.length === 0 ? (
                    <div className="py-10 text-center text-gray-500">
                        Keine Schichten fuer diesen Monat
                    </div>
                ) : (
                    <div className="space-y-2">
                        {shifts.map(shift => {
                            const date = new Date(shift.date)
                            const isConfirmed = shift.status !== "PLANNED"

                            return (
                                <div key={shift.id} className="bg-white rounded-xl shadow-sm p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {shift.absenceType === "SICK" ? (
                                                <XCircle size={18} className="text-red-500" />
                                            ) : shift.absenceType === "VACATION" ? (
                                                <Clock size={18} className="text-cyan-500" />
                                            ) : isConfirmed ? (
                                                <CheckCircle2 size={18} className="text-green-500" />
                                            ) : (
                                                <Clock size={18} className="text-gray-400" />
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-black">
                                                    {format(date, "EEEE, dd. MMMM", { locale: de })}
                                                </p>
                                                {shift.absenceType ? (
                                                    <p className="text-xs text-gray-500">
                                                        {shift.absenceType === "SICK" ? "Krank" : "Urlaub"}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-gray-500">
                                                        {shift.actualStart || shift.plannedStart} - {shift.actualEnd || shift.plannedEnd}
                                                        {shift.actualStart && shift.actualStart !== shift.plannedStart && (
                                                            <span className="text-amber-500 ml-1">(geaendert)</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            shift.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                                            shift.status === "SUBMITTED" ? "bg-blue-100 text-blue-700" :
                                            shift.status === "CONFIRMED" ? "bg-green-50 text-green-600" :
                                            shift.status === "CHANGED" ? "bg-amber-100 text-amber-700" :
                                            "bg-gray-100 text-gray-600"
                                        }`}>
                                            {shift.status === "COMPLETED" ? "Abgeschlossen" :
                                             shift.status === "SUBMITTED" ? "Eingereicht" :
                                             shift.status === "CONFIRMED" ? "Bestaetigt" :
                                             shift.status === "CHANGED" ? "Geaendert" :
                                             "Geplant"}
                                        </span>
                                    </div>
                                    {shift.note && (
                                        <p className="text-xs text-gray-400 mt-2 pl-8">{shift.note}</p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </main>
        </div>
    )
}
