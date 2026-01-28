"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { Users, Edit2, Search, ArrowUpDown, ExternalLink } from "lucide-react"
import Link from "next/link"

interface Employee {
    id: string
    email: string
    name: string
    employeeId: string | null
    team: { name: string } | null
    entryDate: string | null
    exitDate: string | null
}

// Generate a consistent color from a string
function getAvatarColor(name: string): string {
    const colors = [
        "bg-blue-500",
        "bg-green-500",
        "bg-yellow-500",
        "bg-red-500",
        "bg-pink-500",
        "bg-indigo-500",
        "bg-teal-500",
        "bg-orange-500",
        "bg-cyan-500",
        "bg-purple-500"
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}

export default function AssistantsPage() {
    const { data: session } = useSession()
    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<"active" | "inactive">("active")
    const [searchQuery, setSearchQuery] = useState("")
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

    useEffect(() => {
        fetchEmployees()
    }, [])

    const fetchEmployees = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/employees")
            if (res.ok) {
                const data = await res.json()
                setEmployees(data.employees || [])
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    // Determine if employee is active (has no exit date or exit date is in the future)
    const isEmployeeActive = (emp: Employee): boolean => {
        if (!emp.exitDate) return true
        return new Date(emp.exitDate) > new Date()
    }

    // Filter and sort employees
    const filteredEmployees = employees
        .filter(emp => isEmployeeActive(emp) === (activeTab === "active"))
        .filter(emp => {
            if (!searchQuery) return true
            const name = emp.name?.toLowerCase() || ""
            const email = emp.email?.toLowerCase() || ""
            const query = searchQuery.toLowerCase()
            return name.includes(query) || email.includes(query)
        })
        .sort((a, b) => {
            const nameA = (a.name || "").toLowerCase()
            const nameB = (b.name || "").toLowerCase()
            return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
        })

    const activeCount = employees.filter(emp => isEmployeeActive(emp)).length
    const inactiveCount = employees.filter(emp => !isEmployeeActive(emp)).length

    if (loading && employees.length === 0) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 flex items-center justify-center">
                <div className="text-xl text-neutral-400">Lädt...</div>
            </div>
        )
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Users className="text-blue-400" size={28} />
                        Assistenten
                    </h1>
                    <Link
                        href="/admin/employees"
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition flex items-center gap-2 text-sm"
                    >
                        <ExternalLink size={16} />
                        Zur Mitarbeiter-Verwaltung
                    </Link>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === "active"
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                        }`}
                    >
                        Aktiv ({activeCount})
                    </button>
                    <button
                        onClick={() => setActiveTab("inactive")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === "inactive"
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                        }`}
                    >
                        Ausgeschieden ({inactiveCount})
                    </button>
                </div>

                {/* Search and Sort */}
                <div className="flex gap-3 mb-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <input
                            type="text"
                            placeholder="Suchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-700 transition flex items-center gap-2"
                    >
                        <ArrowUpDown size={16} />
                        {sortOrder === "asc" ? "A-Z" : "Z-A"}
                    </button>
                </div>

                {/* Employee List */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                    {filteredEmployees.length === 0 ? (
                        <div className="text-center py-12 text-neutral-500">
                            {searchQuery ? "Keine Assistenten gefunden" : `Keine ${activeTab === "active" ? "aktiven" : "ausgeschiedenen"} Assistenten`}
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-800">
                            {filteredEmployees.map((emp) => (
                                <div
                                    key={emp.id}
                                    className="flex items-center gap-4 p-4 hover:bg-neutral-800/50 transition group"
                                >
                                    {/* Avatar */}
                                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(emp.name || emp.email)} flex items-center justify-center shrink-0`}>
                                        <span className="text-white font-medium">
                                            {(emp.name || emp.email).charAt(0).toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">
                                            {emp.name || "Unbenannt"}
                                        </p>
                                        <p className="text-neutral-500 text-sm truncate">
                                            {emp.email}
                                        </p>
                                    </div>

                                    {/* Team Badge */}
                                    {emp.team && (
                                        <span className="hidden sm:inline-block px-2 py-1 bg-neutral-800 text-neutral-400 text-xs rounded truncate max-w-[150px]">
                                            {emp.team.name}
                                        </span>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <Link
                                            href="/admin/employees"
                                            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition"
                                            title="In Mitarbeiter-Verwaltung bearbeiten"
                                        >
                                            <Edit2 size={16} />
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info text */}
                <p className="text-center text-neutral-500 text-sm mt-6">
                    Um Assistenten hinzuzufügen oder zu bearbeiten, nutze die{" "}
                    <Link href="/admin/employees" className="text-blue-400 hover:underline">
                        Mitarbeiter-Verwaltung
                    </Link>
                </p>
            </div>
        </div>
    )
}
