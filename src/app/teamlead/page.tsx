"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { Users, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import StatisticsDetails from "@/components/StatisticsDetails"

export default function TeamleadPage() {
    const { data: session } = useSession()
    const [report, setReport] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    const fetchReport = async () => {
        setLoading(true)
        const month = currentDate.getMonth() + 1
        const year = currentDate.getFullYear()

        try {
            const res = await fetch(`/api/team/overview?month=${month}&year=${year}`)
            if (res.ok) {
                const data = await res.json()
                setReport(data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (session) fetchReport()
    }, [session, currentDate])

    if (!session) return null

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-4xl px-4 pt-4 flex items-center justify-between">
                <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:underline">
                    ← Dashboard
                </Link>
                <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="text-sm font-medium text-black hover:text-red-600"
                >
                    Abmelden
                </button>
            </div>
            <header className="border-b bg-white p-4 shadow-sm">
                <div className="mx-auto max-w-4xl flex items-center justify-between">
                    <h1 className="text-xl font-black text-black">Teamübersicht</h1>
                    <p className="text-sm text-gray-900 font-bold">
                        {format(currentDate, "MMMM yyyy", { locale: de })}
                    </p>
                </div>
            </header>

            <main className="mx-auto max-w-4xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                        <p className="text-sm font-semibold text-black uppercase font-medium">Mitglieder</p>
                        <p className="mt-2 text-3xl font-black text-gray-900">{report.length}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                        <p className="text-sm font-semibold text-black uppercase font-medium">Eingereicht</p>
                        <p className="mt-2 text-3xl font-black text-green-600">
                            {report.filter(r => r.status === "SUBMITTED").length}
                        </p>
                    </div>
                    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                        <p className="text-sm font-semibold text-black uppercase font-medium">Offen</p>
                        <p className="mt-2 text-3xl font-black text-amber-500">
                            {report.filter(r => r.status !== "SUBMITTED").length}
                        </p>
                    </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-black uppercase tracking-wider">Mitarbeiter</th>
                                <th className="px-6 py-4 text-xs font-bold text-black uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-black uppercase tracking-wider">Dienste</th>
                                <th className="px-6 py-4 text-xs font-bold text-black uppercase tracking-wider">Gesamt-Std</th>
                                <th className="px-6 py-4 text-xs font-bold text-black uppercase tracking-wider">Letzte Änderung</th>
                                <th className="px-6 py-4 text-xs font-bold text-black uppercase tracking-wider text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={6} className="p-10 text-center text-black font-medium">Lade Daten...</td></tr>
                            ) : report.map(row => (
                                <>
                                    <tr key={row.id} className={expandedRows.has(row.id) ? "bg-gray-50" : ""}>
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-black">{row.name}</p>
                                            <p className="text-xs text-gray-700 font-bold">{row.employeeId}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${row.status === "SUBMITTED" ? "bg-green-100 text-green-700" :
                                                row.status === "READY" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-black"
                                                }`}>
                                                {row.status === "SUBMITTED" && <CheckCircle size={12} />}
                                                {row.status === "SUBMITTED" ? "Abgeschlossen" : (row.status === "READY" ? "Bereit zum Senden" : "In Bearbeitung")}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                            {row.shiftCount}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-900">
                                            {row.stats?.totalHours?.toFixed(1) || "0"} Std
                                        </td>
                                        <td className="px-6 py-4 text-xs text-black font-medium">
                                            {row.lastUpdate ? format(new Date(row.lastUpdate), "dd.MM. HH:mm") : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => {
                                                    const newExpanded = new Set(expandedRows)
                                                    if (newExpanded.has(row.id)) {
                                                        newExpanded.delete(row.id)
                                                    } else {
                                                        newExpanded.add(row.id)
                                                    }
                                                    setExpandedRows(newExpanded)
                                                }}
                                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-bold"
                                            >
                                                {expandedRows.has(row.id) ? (
                                                    <>Weniger <ChevronUp size={16} /></>
                                                ) : (
                                                    <>Mehr <ChevronDown size={16} /></>
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedRows.has(row.id) && row.stats && (
                                        <tr key={`${row.id}-details`}>
                                            <td colSpan={6} className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                                                <StatisticsDetails stats={row.stats} variant="compact" />
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}
