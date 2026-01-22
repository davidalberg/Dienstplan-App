"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, CheckCircle, AlertCircle, Clock } from "lucide-react"

export default function TeamDetailPage() {
    const params = useParams()
    const router = useRouter()
    const source = decodeURIComponent(params.source as string)

    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    })

    useEffect(() => {
        fetchTeamData()
    }, [source, filters])

    const fetchTeamData = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/team-details?source=${encodeURIComponent(source)}&month=${filters.month}&year=${filters.year}`)
            if (res.ok) {
                const result = await res.json()
                setData(result)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleExport = () => {
        const exportUrl = `/api/timesheets/export?source=${encodeURIComponent(source)}&month=${filters.month}&year=${filters.year}`
        const link = document.createElement("a")
        link.href = exportUrl
        link.download = `${source}_${filters.month}_${filters.year}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto max-w-6xl">
                    <p className="text-center text-black py-20">Lade Daten...</p>
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto max-w-6xl">
                    <p className="text-center text-red-600 py-20">Fehler beim Laden der Daten</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-6 flex items-center justify-between">
                    <Link
                        href="/admin"
                        className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
                    >
                        <ArrowLeft size={16} />
                        Zurück zum Admin Panel
                    </Link>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-green-700"
                    >
                        <Download size={20} />
                        Excel Export
                    </button>
                </div>

                <header className="mb-8">
                    <h1 className="text-3xl font-black text-black">{source}</h1>
                    <p className="text-gray-900 font-bold">Übersicht für {data.employees.length} Mitarbeiter</p>
                </header>

                <div className="mb-6 flex gap-2 items-center bg-white rounded-xl p-4 shadow-sm ring-1 ring-gray-200">
                    <span className="text-sm font-black uppercase text-black">Zeitraum:</span>
                    <input
                        type="number"
                        value={filters.month}
                        onChange={e => setFilters({ ...filters, month: parseInt(e.target.value) })}
                        className="w-16 rounded-lg border border-gray-200 p-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-300">/</span>
                    <input
                        type="number"
                        value={filters.year}
                        onChange={e => setFilters({ ...filters, year: parseInt(e.target.value) })}
                        className="w-20 rounded-lg border border-gray-200 p-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="space-y-4">
                    {data.employees.map((emp: any) => (
                        <div key={emp.id} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-black text-black">{emp.name}</h3>
                                    <p className="text-sm text-black">{emp.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {emp.hasSubmitted ? (
                                        <div className="flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">
                                            <CheckCircle size={16} />
                                            Eingereicht
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600">
                                            <Clock size={16} />
                                            Ausstehend
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6 mt-6">
                                <div className="rounded-xl bg-blue-50 p-4">
                                    <p className="text-xs font-black uppercase text-blue-600 mb-2">Geplante Stunden</p>
                                    <p className="text-2xl font-black text-blue-900">{emp.stats.plannedHours.toFixed(2)} Std.</p>
                                </div>
                                <div className="rounded-xl bg-green-50 p-4">
                                    <p className="text-xs font-black uppercase text-green-600 mb-2">Tatsächliche Stunden</p>
                                    <p className="text-2xl font-black text-green-900">{emp.stats.actualHours.toFixed(2)} Std.</p>
                                </div>
                                <div className={`rounded-xl p-4 ${emp.stats.difference >= 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
                                    <p className={`text-xs font-black uppercase mb-2 ${emp.stats.difference >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                        Differenz
                                    </p>
                                    <p className={`text-2xl font-black ${emp.stats.difference >= 0 ? 'text-amber-900' : 'text-red-900'}`}>
                                        {emp.stats.difference >= 0 ? '+' : ''}{emp.stats.difference.toFixed(2)} Std.
                                    </p>
                                </div>
                            </div>

                            {emp.stats.discrepancies.length > 0 && (
                                <div className="mt-6 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertCircle size={16} className="text-red-600" />
                                        <p className="text-sm font-black uppercase text-red-600">
                                            {emp.stats.discrepancies.length} Zeitliche Abweichung(en)
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        {emp.stats.discrepancies.map((disc: any, idx: number) => (
                                            <div key={idx} className="text-sm text-red-900">
                                                <span className="font-bold">{disc.date}:</span> Geplant {disc.planned}, Tatsächlich {disc.actual} ({disc.diffText})
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
