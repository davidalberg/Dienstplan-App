"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
    Wallet,
    ChevronLeft,
    ChevronRight,
    Download,
    Moon,
    Sun,
    Calendar,
    Briefcase,
    Car
} from "lucide-react"
import { useAdminPayroll } from "@/hooks/use-admin-data"
import { showToast } from "@/lib/toast-utils"

// Loading fallback component
function PayrollLoadingFallback() {
    return (
        <div className="min-h-screen bg-neutral-950 p-6 flex items-center justify-center">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                <p className="text-neutral-400 font-medium">Lohnliste wird geladen...</p>
            </div>
        </div>
    )
}

// Main export wrapped in Suspense
export default function PayrollPage() {
    return (
        <Suspense fallback={<PayrollLoadingFallback />}>
            <PayrollPageContent />
        </Suspense>
    )
}

// German month names
const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

// Payroll item type
interface PayrollItem {
    id: string
    clientName: string | null
    employeeName: string
    entryDate: string | null
    exitDate: string | null
    hourlyWage: number
    totalHours: number
    nightHours: number
    sundayHours: number
    holidayHours: number
    backupDays: number
    backupHours: number  // NEU: Eingesprungene Stunden
    sickPeriods: string
    sickHours: number
    vacationDays: number
    vacationHours: number
    travelCostType: string
}

/**
 * Stat Card Component
 */
function StatCard({
    icon: Icon,
    label,
    value,
    suffix = "",
    color = "text-white"
}: {
    icon: React.ElementType
    label: string
    value: number | string
    suffix?: string
    color?: string
}) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
                <Icon size={14} />
                <span>{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>
                {typeof value === "number" ? value.toFixed(2) : value}{suffix}
            </p>
        </div>
    )
}

/**
 * Main Payroll Admin Page Content
 */
function PayrollPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()

    // Initialize from URL params, then localStorage, then current date
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
    const [isExporting, setIsExporting] = useState(false)

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

    // Fetch payroll data
    const { payroll, totals, employeeCount, isLoading } = useAdminPayroll(month, year)

    // Month navigation
    const navigateMonth = (delta: number) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
        setCurrentDate(newDate)
    }

    // Handle Excel export
    const handleExport = async () => {
        setIsExporting(true)
        try {
            const url = `/api/admin/payroll/export?month=${month}&year=${year}`
            const response = await fetch(url)

            if (!response.ok) {
                throw new Error("Export fehlgeschlagen")
            }

            // Create download link
            const blob = await response.blob()
            const downloadUrl = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = downloadUrl
            a.download = `Lohnliste_${MONTH_NAMES[month - 1]}_${year}.xlsx`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(downloadUrl)

            showToast("success", "Excel-Export erfolgreich")
        } catch (error) {
            showToast("error", "Fehler beim Export")
        } finally {
            setIsExporting(false)
        }
    }

    // Format date for display
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-"
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
        } catch {
            return "-"
        }
    }

    return (
        <div className="min-h-screen bg-neutral-950 p-6">
            <div className="mx-auto max-w-[1600px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Wallet className="text-violet-400" size={28} />
                            Lohnliste
                        </h1>
                        <p className="text-sm text-neutral-400 mt-1">
                            Stunden- und Zuschlagsübersicht für die Lohnabrechnung
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Excel Export Button */}
                        <button
                            onClick={handleExport}
                            disabled={isExporting || isLoading || payroll.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg font-medium transition-colors duration-150"
                        >
                            <Download size={18} />
                            {isExporting ? "Exportiere..." : "Excel Export"}
                        </button>

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
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                    <StatCard
                        icon={Briefcase}
                        label="Mitarbeiter"
                        value={employeeCount}
                        color="text-white"
                    />
                    <StatCard
                        icon={Calendar}
                        label="Gesamtstunden"
                        value={totals.totalHours || 0}
                        suffix="h"
                        color="text-violet-400"
                    />
                    <StatCard
                        icon={Moon}
                        label="Nachtstunden"
                        value={totals.nightHours || 0}
                        suffix="h"
                        color="text-blue-400"
                    />
                    <StatCard
                        icon={Sun}
                        label="Sonntagsstunden"
                        value={totals.sundayHours || 0}
                        suffix="h"
                        color="text-amber-400"
                    />
                    <StatCard
                        icon={Calendar}
                        label="Feiertagsstunden"
                        value={totals.holidayHours || 0}
                        suffix="h"
                        color="text-red-400"
                    />
                    <StatCard
                        icon={Car}
                        label="Krankstunden"
                        value={totals.sickHours || 0}
                        suffix="h"
                        color="text-orange-400"
                    />
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8">
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400"></div>
                            <span className="ml-3 text-neutral-400">Lade Lohndaten...</span>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && payroll.length === 0 && (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-12 text-center">
                        <Wallet size={48} className="mx-auto mb-4 text-neutral-600" />
                        <p className="text-lg font-medium text-neutral-400">
                            Keine Lohndaten für {MONTH_NAMES[month - 1]} {year}
                        </p>
                        <p className="text-sm text-neutral-500 mt-2">
                            Es wurden keine Schichten für diesen Monat gefunden.
                        </p>
                    </div>
                )}

                {/* Data Table */}
                {!isLoading && payroll.length > 0 && (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-800 bg-neutral-800/50">
                                        <th className="text-left px-4 py-3 text-neutral-400 font-medium">Assistenzkraft</th>
                                        <th className="text-left px-4 py-3 text-neutral-400 font-medium">Klient</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Stundenlohn</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Gesamt</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Nacht</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Sonntag</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Feiertag</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Backup</th>
                                        <th className="text-left px-4 py-3 text-neutral-400 font-medium">Krank</th>
                                        <th className="text-right px-4 py-3 text-neutral-400 font-medium">Urlaub</th>
                                        <th className="text-center px-4 py-3 text-neutral-400 font-medium">Fahrt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800">
                                    {(payroll as PayrollItem[]).map((item) => (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-neutral-800/30 transition-colors duration-150"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-white">{item.employeeName}</div>
                                                <div className="text-xs text-neutral-500">
                                                    {item.entryDate ? `Eintritt: ${formatDate(item.entryDate)}` : ""}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-neutral-300">
                                                {item.clientName || "-"}
                                            </td>
                                            <td className="px-4 py-3 text-right text-neutral-300">
                                                {item.hourlyWage.toFixed(2)} €
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium text-violet-400">
                                                {item.totalHours.toFixed(2)}h
                                            </td>
                                            <td className="px-4 py-3 text-right text-blue-400">
                                                {item.nightHours > 0 ? `${item.nightHours.toFixed(2)}h` : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-right text-amber-400">
                                                {item.sundayHours > 0 ? `${item.sundayHours.toFixed(2)}h` : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-right text-red-400">
                                                {item.holidayHours > 0 ? `${item.holidayHours.toFixed(2)}h` : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-right text-emerald-400">
                                                {item.backupDays > 0 || (item.backupHours && item.backupHours > 0) ? (
                                                    <div>
                                                        {item.backupDays > 0 && (
                                                            <span>{item.backupDays} {item.backupDays === 1 ? "Tag" : "Tage"}</span>
                                                        )}
                                                        {item.backupHours !== undefined && item.backupHours > 0 && (
                                                            <span className={item.backupDays > 0 ? "text-xs text-neutral-400 ml-1" : ""}>
                                                                {item.backupDays > 0 ? `(${item.backupHours.toFixed(1)}h)` : `${item.backupHours.toFixed(1)}h`}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : "-"}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.sickPeriods ? (
                                                    <div>
                                                        <span className="text-orange-400 text-xs">
                                                            {item.sickPeriods}
                                                        </span>
                                                        <span className="text-neutral-500 text-xs ml-1">
                                                            ({item.sickHours.toFixed(1)}h)
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-neutral-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {item.vacationDays > 0 ? (
                                                    <span className="text-cyan-400">
                                                        {item.vacationDays}d / {item.vacationHours.toFixed(1)}h
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    item.travelCostType === "Auto"
                                                        ? "bg-blue-500/20 text-blue-300"
                                                        : item.travelCostType === "DB"
                                                        ? "bg-red-500/20 text-red-300"
                                                        : "bg-neutral-700 text-neutral-400"
                                                }`}>
                                                    {item.travelCostType}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Totals Row */}
                                <tfoot>
                                    <tr className="border-t-2 border-neutral-700 bg-neutral-800/50 font-semibold">
                                        <td className="px-4 py-3 text-white">Gesamt ({employeeCount} MA)</td>
                                        <td className="px-4 py-3"></td>
                                        <td className="px-4 py-3"></td>
                                        <td className="px-4 py-3 text-right text-violet-400">
                                            {(totals.totalHours || 0).toFixed(2)}h
                                        </td>
                                        <td className="px-4 py-3 text-right text-blue-400">
                                            {(totals.nightHours || 0).toFixed(2)}h
                                        </td>
                                        <td className="px-4 py-3 text-right text-amber-400">
                                            {(totals.sundayHours || 0).toFixed(2)}h
                                        </td>
                                        <td className="px-4 py-3 text-right text-red-400">
                                            {(totals.holidayHours || 0).toFixed(2)}h
                                        </td>
                                        <td className="px-4 py-3"></td>
                                        <td className="px-4 py-3 text-orange-400">
                                            {(totals.sickHours || 0).toFixed(2)}h
                                        </td>
                                        <td className="px-4 py-3 text-right text-cyan-400">
                                            {(totals.vacationHours || 0).toFixed(2)}h
                                        </td>
                                        <td className="px-4 py-3"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
