"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { format, addMonths, subMonths } from "date-fns"
import { de } from "date-fns/locale"
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, ExternalLink, Check } from "lucide-react"
import useSWR from "swr"
import TimesheetDetail from "@/components/TimesheetDetail"

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface Employee {
    id: string
    name: string
    email: string
    totalHours: number
    totalMinutes: number
    employeeSigned: boolean
    clientSigned: boolean
    submissionId: string | null
    submissionStatus: string | null
    lastActivity: string | null
    timesheetCount: number
}

interface Client {
    id: string
    firstName: string
    lastName: string
    email: string | null
    displayOrder: number
    submissionId: string | null
    submissionStatus: string | null
    employees: Employee[]
    totalEmployees: number
    allEmployeesSigned: boolean
    clientSigned: boolean
}

// Avatar-Komponente mit Farbe basierend auf Name
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
    const colors = [
        "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
        "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500",
        "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500",
        "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500"
    ]

    const colorIndex = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

    const sizeClasses = {
        sm: "w-8 h-8 text-xs",
        md: "w-10 h-10 text-sm",
        lg: "w-12 h-12 text-base"
    }

    return (
        <div className={`${colors[colorIndex]} ${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-semibold`}>
            {initials}
        </div>
    )
}

// Badge für Unterschriftsstatus
function SignatureBadge({ label, signed }: { label: string; signed: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            signed
                ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700"
                : "bg-neutral-800 text-neutral-500 border border-neutral-700"
        }`}>
            {signed && <Check size={12} />}
            {label}
        </span>
    )
}

export default function AdminPage() {
    const { data: session } = useSession()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({})
    const [selectedEmployee, setSelectedEmployee] = useState<{ employee: Employee; client: Client } | null>(null)

    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    // Daten laden
    const { data, isLoading, mutate } = useSWR<{ clients: Client[]; month: number; year: number }>(
        `/api/admin/submissions/overview?month=${month}&year=${year}`,
        fetcher,
        { revalidateOnFocus: false }
    )

    const clients = data?.clients || []

    // Alle Gruppen standardmäßig aufklappen
    useEffect(() => {
        if (clients.length > 0) {
            const expanded: Record<string, boolean> = {}
            clients.forEach(c => {
                if (expandedClients[c.id] === undefined) {
                    expanded[c.id] = true
                }
            })
            if (Object.keys(expanded).length > 0) {
                setExpandedClients(prev => ({ ...prev, ...expanded }))
            }
        }
    }, [clients])

    const toggleClient = (clientId: string) => {
        setExpandedClients(prev => ({ ...prev, [clientId]: !prev[clientId] }))
    }

    const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1))
    const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1))
    const goToToday = () => setCurrentDate(new Date())

    const formatHours = (minutes: number) => {
        if (minutes === 0) return "0m"
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours === 0) return `${mins}m`
        if (mins === 0) return `${hours}h`
        return `${hours}h ${mins}m`
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return ""
        const date = new Date(dateStr)
        return format(date, "d. MMM", { locale: de })
    }

    if (!session) return null

    return (
        <div className="min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
                    <div className="p-4 border-b border-neutral-800">
                        <h1 className="text-lg font-semibold text-white">Stundennachweise</h1>
                    </div>

                    {/* Monat-Navigation */}
                    <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={goToPreviousMonth}
                                    className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="text-white font-medium min-w-[140px] text-center">
                                    {format(currentDate, "MMMM yyyy", { locale: de })}
                                </span>
                                <button
                                    onClick={goToNextMonth}
                                    className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                            <button
                                onClick={goToToday}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                            >
                                Heute
                            </button>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white font-medium hover:bg-neutral-700 transition-colors">
                            <Plus size={18} />
                            Erstellen
                        </button>
                    </div>

                    {/* Loading State */}
                    {isLoading && (
                        <div className="p-8 text-center text-neutral-400">
                            Lade Stundennachweise...
                        </div>
                    )}

                    {/* Kein Inhalt */}
                    {!isLoading && clients.length === 0 && (
                        <div className="p-8 text-center text-neutral-400">
                            Keine Stundennachweise für diesen Monat.
                        </div>
                    )}

                    {/* Klienten-Liste */}
                    {!isLoading && clients.length > 0 && (
                        <div className="divide-y divide-neutral-800">
                            {clients.map(client => (
                                <div key={client.id}>
                                    {/* Klient-Header */}
                                    <button
                                        onClick={() => toggleClient(client.id)}
                                        className="w-full flex items-center gap-4 p-4 hover:bg-neutral-800/50 transition-colors"
                                    >
                                        <Avatar name={`${client.firstName} ${client.lastName}`} />
                                        <div className="flex-1 text-left">
                                            <h3 className="text-white font-medium">
                                                {client.firstName} {client.lastName}
                                            </h3>
                                            <p className="text-xs text-neutral-500">
                                                {client.totalEmployees} Assistent{client.totalEmployees !== 1 ? "en" : ""}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                // TODO: Link zur Detail-Übersicht des Klienten
                                            }}
                                            className="p-2 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                        >
                                            <ExternalLink size={18} />
                                        </button>
                                        {expandedClients[client.id] ? (
                                            <ChevronUp size={20} className="text-neutral-400" />
                                        ) : (
                                            <ChevronDown size={20} className="text-neutral-400" />
                                        )}
                                    </button>

                                    {/* Mitarbeiter-Liste */}
                                    {expandedClients[client.id] && (
                                        <div className="bg-neutral-900/50">
                                            {client.employees.map(employee => (
                                                <button
                                                    key={employee.id}
                                                    onClick={() => setSelectedEmployee({ employee, client })}
                                                    className="w-full flex items-center gap-4 p-4 pl-8 hover:bg-neutral-800/50 transition-colors border-t border-neutral-800/50"
                                                >
                                                    <Avatar name={employee.name || "?"} size="sm" />
                                                    <div className="flex-1 text-left">
                                                        <span className="text-white font-medium">
                                                            {employee.name}
                                                        </span>
                                                    </div>
                                                    <span className="text-neutral-400 font-medium min-w-[60px] text-right">
                                                        {formatHours(employee.totalMinutes)}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <SignatureBadge label="A" signed={employee.employeeSigned} />
                                                        <SignatureBadge label="K" signed={employee.clientSigned} />
                                                    </div>
                                                    <span className="text-neutral-500 text-sm min-w-[70px] text-right">
                                                        {formatDate(employee.lastActivity)}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail-Modal */}
                {selectedEmployee && (
                    <TimesheetDetail
                        employeeId={selectedEmployee.employee.id}
                        clientId={selectedEmployee.client.id}
                        month={month}
                        year={year}
                        onClose={() => setSelectedEmployee(null)}
                        onDelete={() => mutate()}
                    />
                )}
            </div>
        </div>
    )
}
