"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
    Calendar,
    Plus,
    Check,
    X,
    ChevronLeft,
    ChevronRight,
    Edit2,
    AlertCircle,
    Users,
    ExternalLink
} from "lucide-react"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { de } from "date-fns/locale"
import { toast } from "sonner"

interface VacationRequest {
    id: string
    employeeId: string
    employee: {
        id: string
        name: string | null
        email: string
    }
    startDate: string
    endDate: string
    days: number
    status: "PENDING" | "APPROVED" | "REJECTED"
    reason?: string | null
    createdAt: string
    source?: "vacation_request" | "dienstplan"  // Source indicator
}

interface VacationQuota {
    id: string
    employeeId: string
    employee: {
        id: string
        name: string | null
        email: string
    }
    year: number
    totalDays: number
    usedDays: number
    remainingDays: number
}

interface Employee {
    id: string
    name: string | null
    email: string
}

// Loading Fallback
function VacationsLoading() {
    return (
        <div className="min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                <p className="text-neutral-400 font-medium">Urlaubsdaten werden geladen...</p>
            </div>
        </div>
    )
}

// Main Page
export default function VacationsPage() {
    return (
        <Suspense fallback={<VacationsLoading />}>
            <VacationsContent />
        </Suspense>
    )
}

function VacationsContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    // Date state - Initialize from URL params, then localStorage, then current date
    const [currentDate, setCurrentDate] = useState(() => {
        // 1. URL-Parameter haben höchste Priorität
        const monthParam = searchParams.get('month')
        const yearParam = searchParams.get('year')
        if (monthParam && yearParam) {
            const m = parseInt(monthParam, 10)
            const y = parseInt(yearParam, 10)
            if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
                return new Date(y, m - 1, 1)
            }
        }

        // 2. localStorage als Fallback (für Navigation ohne Query-Strings)
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('admin-selected-month')
                if (saved) {
                    const { month: savedMonth, year: savedYear } = JSON.parse(saved)
                    if (savedMonth >= 1 && savedMonth <= 12 && savedYear >= 2020 && savedYear <= 2100) {
                        return new Date(savedYear, savedMonth - 1, 1)
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }

        // 3. Fallback: Aktueller Monat
        return new Date()
    })

    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    // Sync URL AND localStorage when month changes
    useEffect(() => {
        // Update URL
        const params = new URLSearchParams(searchParams.toString())
        params.set('month', String(month))
        params.set('year', String(year))
        const newUrl = `${pathname}?${params.toString()}`
        router.replace(newUrl, { scroll: false })

        // Persist to localStorage for cross-page navigation
        try {
            localStorage.setItem('admin-selected-month', JSON.stringify({ month, year }))
        } catch {
            // Ignore storage errors (e.g., private browsing)
        }
    }, [month, year, pathname, router, searchParams])

    // Data states
    const [requests, setRequests] = useState<VacationRequest[]>([])
    const [quotas, setQuotas] = useState<VacationQuota[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)

    // Filter state
    const [statusFilter, setStatusFilter] = useState<string>("ALL")

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showQuotaModal, setShowQuotaModal] = useState(false)
    const [editingQuota, setEditingQuota] = useState<VacationQuota | null>(null)

    // Form states
    const [createForm, setCreateForm] = useState({
        employeeId: "",
        startDate: "",
        endDate: "",
        reason: ""
    })

    const [quotaForm, setQuotaForm] = useState({
        employeeId: "",
        year: year,
        totalDays: 30
    })

    // Load data
    useEffect(() => {
        loadData()
        loadEmployees()
        loadQuotas()
    }, [month, year, statusFilter])

    const loadData = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                month: month.toString(),
                year: year.toString()
            })
            if (statusFilter !== "ALL") {
                params.append("status", statusFilter)
            }

            const res = await fetch(`/api/admin/vacations?${params}`)
            if (res.ok) {
                const data = await res.json()
                // Use new combined "requests" field, fallback to vacationRequests for backward compat
                setRequests(data.requests || data.vacationRequests || [])
            } else {
                toast.error("Fehler beim Laden der Urlaubsanträge")
            }
        } catch (error) {
            console.error("Error loading vacation requests:", error)
            toast.error("Netzwerkfehler beim Laden")
        } finally {
            setLoading(false)
        }
    }

    const loadEmployees = async () => {
        try {
            const res = await fetch("/api/admin/employees")
            if (res.ok) {
                const data = await res.json()
                setEmployees(data.employees || [])
            }
        } catch (error) {
            console.error("Error loading employees:", error)
        }
    }

    const loadQuotas = async () => {
        try {
            const res = await fetch(`/api/admin/vacations/quota?year=${year}`)
            if (res.ok) {
                const data = await res.json()
                setQuotas(data.quotas || [])
            }
        } catch (error) {
            console.error("Error loading quotas:", error)
        }
    }

    const navigateMonth = (delta: number) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
        setCurrentDate(newDate)
    }

    const handleCreateRequest = async () => {
        if (!createForm.employeeId || !createForm.startDate || !createForm.endDate) {
            toast.error("Bitte alle Pflichtfelder ausfüllen")
            return
        }

        try {
            const res = await fetch("/api/admin/vacations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(createForm)
            })

            if (res.ok) {
                toast.success("Urlaubsantrag erstellt")
                setShowCreateModal(false)
                resetCreateForm()
                loadData()
                loadQuotas()
            } else {
                const err = await res.json()
                toast.error(err.error || "Fehler beim Erstellen")
            }
        } catch (error) {
            console.error("Error creating vacation request:", error)
            toast.error("Netzwerkfehler")
        }
    }

    const handleApprove = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/vacations/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "APPROVED" })
            })

            if (res.ok) {
                toast.success("Antrag genehmigt")
                loadData()
                loadQuotas()
            } else {
                const err = await res.json()
                toast.error(err.error || "Fehler beim Genehmigen")
            }
        } catch (error) {
            console.error("Error approving request:", error)
            toast.error("Netzwerkfehler")
        }
    }

    const handleReject = async (id: string) => {
        if (!confirm("Antrag wirklich ablehnen?")) return

        try {
            const res = await fetch(`/api/admin/vacations/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "REJECTED" })
            })

            if (res.ok) {
                toast.success("Antrag abgelehnt")
                loadData()
                loadQuotas()
            } else {
                const err = await res.json()
                toast.error(err.error || "Fehler beim Ablehnen")
            }
        } catch (error) {
            console.error("Error rejecting request:", error)
            toast.error("Netzwerkfehler")
        }
    }

    const handleUpdateQuota = async () => {
        if (!quotaForm.employeeId) {
            toast.error("Bitte Mitarbeiter auswählen")
            return
        }

        try {
            const res = await fetch("/api/admin/vacations/quota", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(quotaForm)
            })

            if (res.ok) {
                toast.success("Urlaubskontingent aktualisiert")
                setShowQuotaModal(false)
                setEditingQuota(null)
                resetQuotaForm()
                loadQuotas()
            } else {
                const err = await res.json()
                toast.error(err.error || "Fehler beim Speichern")
            }
        } catch (error) {
            console.error("Error updating quota:", error)
            toast.error("Netzwerkfehler")
        }
    }

    const openEditQuota = (quota: VacationQuota) => {
        setQuotaForm({
            employeeId: quota.employeeId,
            year: quota.year,
            totalDays: quota.totalDays
        })
        setEditingQuota(quota)
        setShowQuotaModal(true)
    }

    const resetCreateForm = () => {
        setCreateForm({
            employeeId: "",
            startDate: "",
            endDate: "",
            reason: ""
        })
    }

    const resetQuotaForm = () => {
        setQuotaForm({
            employeeId: "",
            year: year,
            totalDays: 30
        })
    }

    // Calculate stats
    const stats = {
        pending: requests.filter(r => r.status === "PENDING").length,
        approved: requests.filter(r => r.status === "APPROVED").length,
        totalRemaining: quotas.reduce((sum, q) => sum + q.remainingDays, 0)
    }

    if (loading && requests.length === 0) {
        return <VacationsLoading />
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Calendar className="text-violet-400" size={28} />
                        Urlaubsverwaltung
                    </h1>

                    <div className="flex items-center gap-3">
                        <a
                            href="https://urlaubsapp-12920.web.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-600 transition font-medium"
                        >
                            <ExternalLink size={20} />
                            Urlaubs-App
                        </a>
                        <button
                            onClick={() => setShowQuotaModal(true)}
                            className="flex items-center gap-2 bg-neutral-700 text-white px-4 py-2 rounded-lg hover:bg-neutral-600 transition font-medium"
                        >
                            <Users size={20} />
                            Kontingente
                        </button>
                        <button
                            onClick={() => {
                                resetCreateForm()
                                setShowCreateModal(true)
                            }}
                            className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition font-medium"
                        >
                            <Plus size={20} />
                            Neuer Antrag
                        </button>
                    </div>
                </div>

                {/* Month Navigation & Stats */}
                <div className="bg-neutral-900 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => navigateMonth(-1)}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="font-bold text-lg min-w-[150px] text-center text-white">
                                {format(currentDate, "MMMM yyyy", { locale: de })}
                            </span>
                            <button
                                onClick={() => navigateMonth(1)}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-medium text-white"
                        >
                            <option value="ALL">Alle Status</option>
                            <option value="PENDING">Offen</option>
                            <option value="APPROVED">Genehmigt</option>
                            <option value="REJECTED">Abgelehnt</option>
                        </select>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Offene Anträge</p>
                                    <p className="text-3xl font-bold text-amber-400 mt-1">{stats.pending}</p>
                                </div>
                                <AlertCircle className="text-amber-400" size={32} />
                            </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Genehmigt</p>
                                    <p className="text-3xl font-bold text-green-400 mt-1">{stats.approved}</p>
                                </div>
                                <Check className="text-green-400" size={32} />
                            </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-neutral-400 text-sm">Rest-Urlaub gesamt</p>
                                    <p className="text-3xl font-bold text-violet-400 mt-1">{stats.totalRemaining}</p>
                                </div>
                                <Calendar className="text-violet-400" size={32} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Requests Table */}
                <div className="bg-neutral-900 rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-neutral-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Mitarbeiter</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Von</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Bis</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-400 uppercase tracking-wide">Tage</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide">Grund</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wide">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {requests.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                                        Keine Urlaubsanträge für diesen Zeitraum
                                    </td>
                                </tr>
                            ) : (
                                requests.map((request) => (
                                    <tr key={request.id} className="hover:bg-neutral-800/50 transition">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                                                    <span className="text-white text-sm font-semibold">
                                                        {(request.employee.name || request.employee.email).charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">
                                                        {request.employee.name || "Unbenannt"}
                                                    </p>
                                                    <p className="text-neutral-400 text-xs">
                                                        {request.employee.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-white text-sm">
                                            {format(new Date(request.startDate), "dd.MM.yyyy", { locale: de })}
                                        </td>
                                        <td className="px-4 py-3 text-white text-sm">
                                            {format(new Date(request.endDate), "dd.MM.yyyy", { locale: de })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="bg-neutral-800 px-2 py-1 rounded text-sm font-medium text-white">
                                                {request.days}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                                    request.status === "PENDING" ? "bg-amber-900/50 text-amber-400" :
                                                    request.status === "APPROVED" ? "bg-green-900/50 text-green-400" :
                                                    "bg-red-900/50 text-red-400"
                                                }`}>
                                                    {request.status === "PENDING" ? "Offen" :
                                                     request.status === "APPROVED" ? "Genehmigt" : "Abgelehnt"}
                                                </span>
                                                {request.source === "dienstplan" && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-900/50 text-cyan-400">
                                                        Dienstplan
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-neutral-400 text-sm max-w-xs truncate">
                                            {request.reason || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {request.status === "PENDING" && request.source !== "dienstplan" && (
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleApprove(request.id)}
                                                        className="p-2 text-green-400 hover:bg-green-900/30 rounded transition"
                                                        title="Genehmigen"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(request.id)}
                                                        className="p-2 text-red-400 hover:bg-red-900/30 rounded transition"
                                                        title="Ablehnen"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Create Request Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                        <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full border border-neutral-800">
                            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">Neuer Urlaubsantrag</h2>
                                <button onClick={() => setShowCreateModal(false)} className="text-neutral-500 hover:text-white transition">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                        Mitarbeiter *
                                    </label>
                                    <select
                                        value={createForm.employeeId}
                                        onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                    >
                                        <option value="">Auswählen...</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.name || emp.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                                            Von *
                                        </label>
                                        <input
                                            type="date"
                                            value={createForm.startDate}
                                            onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                                            Bis *
                                        </label>
                                        <input
                                            type="date"
                                            value={createForm.endDate}
                                            onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                                            min={createForm.startDate}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">
                                        Grund (optional)
                                    </label>
                                    <textarea
                                        value={createForm.reason}
                                        onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors resize-none"
                                        rows={3}
                                        placeholder="Optional: Grund für den Urlaub..."
                                    />
                                </div>
                            </div>

                            <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 px-6 py-4 flex gap-3">
                                <button
                                    onClick={handleCreateRequest}
                                    className="flex-1 bg-violet-600 text-white py-2.5 rounded-xl font-bold hover:bg-violet-700 transition-colors"
                                >
                                    Erstellen
                                </button>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 border border-neutral-700 py-2.5 rounded-xl font-bold text-neutral-400 hover:bg-neutral-800 transition-colors"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quota Management Modal */}
                {showQuotaModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                        <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-neutral-800">
                            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">Urlaubskontingente {year}</h2>
                                <button onClick={() => {
                                    setShowQuotaModal(false)
                                    setEditingQuota(null)
                                    resetQuotaForm()
                                }} className="text-neutral-500 hover:text-white transition">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Edit Form */}
                                <div className="bg-neutral-800 rounded-lg p-4">
                                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                                        {editingQuota ? "Kontingent bearbeiten" : "Neues Kontingent"}
                                    </h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Mitarbeiter</label>
                                            <select
                                                value={quotaForm.employeeId}
                                                onChange={(e) => setQuotaForm({ ...quotaForm, employeeId: e.target.value })}
                                                disabled={!!editingQuota}
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white disabled:opacity-50 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            >
                                                <option value="">Auswählen...</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.name || emp.email}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Jahr</label>
                                            <input
                                                type="number"
                                                value={quotaForm.year}
                                                onChange={(e) => setQuotaForm({ ...quotaForm, year: parseInt(e.target.value) })}
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">Tage gesamt</label>
                                            <input
                                                type="number"
                                                value={quotaForm.totalDays}
                                                onChange={(e) => setQuotaForm({ ...quotaForm, totalDays: parseInt(e.target.value) })}
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-4">
                                        <button
                                            onClick={handleUpdateQuota}
                                            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
                                        >
                                            Speichern
                                        </button>
                                        {editingQuota && (
                                            <button
                                                onClick={() => {
                                                    setEditingQuota(null)
                                                    resetQuotaForm()
                                                }}
                                                className="px-4 py-2 border border-neutral-700 text-neutral-400 rounded-lg hover:bg-neutral-800 transition"
                                            >
                                                Abbrechen
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Quotas Table */}
                                <div className="bg-neutral-800 rounded-lg overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-neutral-900">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-400 uppercase">Mitarbeiter</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-neutral-400 uppercase">Jahr</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-neutral-400 uppercase">Gesamt</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-neutral-400 uppercase">Genutzt</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-neutral-400 uppercase">Rest</th>
                                                <th className="px-4 py-2 text-right text-xs font-semibold text-neutral-400 uppercase">Aktion</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-700">
                                            {quotas.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                                                        Keine Kontingente vorhanden
                                                    </td>
                                                </tr>
                                            ) : (
                                                quotas.map((quota) => (
                                                    <tr key={quota.id} className="hover:bg-neutral-700/50 transition">
                                                        <td className="px-4 py-2 text-white text-sm">
                                                            {quota.employee.name || quota.employee.email}
                                                        </td>
                                                        <td className="px-4 py-2 text-center text-neutral-300 text-sm">
                                                            {quota.year}
                                                        </td>
                                                        <td className="px-4 py-2 text-center text-white font-medium text-sm">
                                                            {quota.totalDays}
                                                        </td>
                                                        <td className="px-4 py-2 text-center text-amber-400 font-medium text-sm">
                                                            {quota.usedDays}
                                                        </td>
                                                        <td className="px-4 py-2 text-center">
                                                            <span className={`font-bold text-sm ${
                                                                quota.remainingDays > 10 ? "text-green-400" :
                                                                quota.remainingDays > 5 ? "text-amber-400" :
                                                                "text-red-400"
                                                            }`}>
                                                                {quota.remainingDays}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <button
                                                                onClick={() => openEditQuota(quota)}
                                                                className="p-2 text-neutral-400 hover:text-violet-400 hover:bg-neutral-700 rounded transition"
                                                                title="Bearbeiten"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
