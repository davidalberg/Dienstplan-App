"use client"

import { SessionProvider } from "next-auth/react"
import { Sidebar } from "@/components/Sidebar"
import { AdminDataProvider } from "@/components/AdminDataProvider"
import { useState } from "react"
import { Download, X } from "lucide-react"

function ExportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1)
    const [exportYear, setExportYear] = useState(new Date().getFullYear())
    const [isExporting, setIsExporting] = useState(false)

    const handleExport = async () => {
        setIsExporting(true)
        try {
            const response = await fetch(`/api/timesheets/export?month=${exportMonth}&year=${exportYear}`)
            if (response.ok) {
                const blob = await response.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `Stundennachweis_${exportYear}-${String(exportMonth).padStart(2, '0')}.xlsx`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)
                onClose()
            }
        } catch (error) {
            console.error('Export failed:', error)
        } finally {
            setIsExporting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Excel Export</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Monat
                        </label>
                        <select
                            value={exportMonth}
                            onChange={(e) => setExportMonth(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                                <option key={month} value={month}>
                                    {new Date(2000, month - 1).toLocaleDateString('de-DE', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Jahr
                        </label>
                        <select
                            value={exportYear}
                            onChange={(e) => setExportYear(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                                <option key={year} value={year}>
                                    {year}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={isExporting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                    >
                        <Download size={18} />
                        {isExporting ? 'Exportiere...' : 'Herunterladen'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
    const [showExportModal, setShowExportModal] = useState(false)

    return (
        <div className="flex min-h-screen bg-neutral-950">
            <Sidebar onExportClick={() => setShowExportModal(true)} />
            <main className="flex-1 overflow-auto">
                {children}
            </main>
            <ExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
        </div>
    )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <AdminDataProvider>
                <AdminLayoutContent>{children}</AdminLayoutContent>
            </AdminDataProvider>
        </SessionProvider>
    )
}
