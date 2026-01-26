"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface DienstplanConfig {
    sheetFileName: string
    configured: boolean
    assistantRecipientEmail: string | null
    assistantRecipientName: string | null
    id: string | null
}

export default function DienstplanConfigPage() {
    const router = useRouter()
    const [dienstplaene, setDienstplaene] = useState<DienstplanConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [editingDienstplan, setEditingDienstplan] = useState<DienstplanConfig | null>(null)
    const [formData, setFormData] = useState({
        assistantRecipientEmail: "",
        assistantRecipientName: ""
    })
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchDienstplaene()
    }, [])

    const fetchDienstplaene = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/dienstplan-config")
            if (res.ok) {
                const data = await res.json()
                setDienstplaene(data.dienstplaene || [])
            } else {
                toast.error("Fehler beim Laden der Dienstpläne")
            }
        } catch (error) {
            console.error("Error fetching dienstplaene:", error)
            toast.error("Fehler beim Laden")
        } finally {
            setLoading(false)
        }
    }

    const openEditModal = (dienstplan: DienstplanConfig) => {
        setEditingDienstplan(dienstplan)
        setFormData({
            assistantRecipientEmail: dienstplan.assistantRecipientEmail || "",
            assistantRecipientName: dienstplan.assistantRecipientName || ""
        })
    }

    const closeModal = () => {
        setEditingDienstplan(null)
        setFormData({
            assistantRecipientEmail: "",
            assistantRecipientName: ""
        })
    }

    const handleSave = async () => {
        if (!editingDienstplan) return

        // Validierung
        if (!formData.assistantRecipientEmail || !formData.assistantRecipientName) {
            toast.error("Bitte alle Felder ausfüllen")
            return
        }

        setSaving(true)
        try {
            const res = await fetch("/api/admin/dienstplan-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sheetFileName: editingDienstplan.sheetFileName,
                    assistantRecipientEmail: formData.assistantRecipientEmail,
                    assistantRecipientName: formData.assistantRecipientName
                })
            })

            if (res.ok) {
                toast.success("Konfiguration gespeichert")
                closeModal()
                await fetchDienstplaene() // Reload data
            } else {
                const error = await res.json()
                toast.error(error.error || "Fehler beim Speichern")
            }
        } catch (error) {
            console.error("Error saving config:", error)
            toast.error("Fehler beim Speichern")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            Dienstplan-Konfiguration
                        </h1>
                        <p className="text-gray-600 mt-2">
                            Assistenznehmer-Emails für Unterschriften konfigurieren
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/admin")}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                    >
                        ← Zurück zum Dashboard
                    </button>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <p className="mt-2 text-gray-600">Lade Dienstpläne...</p>
                    </div>
                ) : dienstplaene.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-8 text-center">
                        <p className="text-gray-600">Keine Dienstpläne gefunden</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Dienstplan
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Assistenznehmer Email
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Aktion
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {dienstplaene.map((dienstplan) => (
                                    <tr key={dienstplan.sheetFileName} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {dienstplan.sheetFileName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {dienstplan.configured ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    ✓ Konfiguriert
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                    ✗ Nicht konfiguriert
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {dienstplan.assistantRecipientEmail || "-"}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {dienstplan.assistantRecipientName || "-"}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            <button
                                                onClick={() => openEditModal(dienstplan)}
                                                className="text-blue-600 hover:text-blue-900 font-medium"
                                            >
                                                {dienstplan.configured ? "Bearbeiten" : "Konfigurieren"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Edit Modal */}
                {editingDienstplan && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">
                                Assistenznehmer konfigurieren
                            </h2>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Dienstplan
                                </label>
                                <input
                                    type="text"
                                    value={editingDienstplan.sheetFileName}
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    E-Mail des Assistenznehmers *
                                </label>
                                <input
                                    type="email"
                                    value={formData.assistantRecipientEmail}
                                    onChange={(e) => setFormData({ ...formData, assistantRecipientEmail: e.target.value })}
                                    placeholder="beispiel@email.de"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Name des Assistenznehmers *
                                </label>
                                <input
                                    type="text"
                                    value={formData.assistantRecipientName}
                                    onChange={(e) => setFormData({ ...formData, assistantRecipientName: e.target.value })}
                                    placeholder="Max Mustermann"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={closeModal}
                                    disabled={saving}
                                    className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? "Speichere..." : "Speichern"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
