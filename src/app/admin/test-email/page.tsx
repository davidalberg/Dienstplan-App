"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { showToast } from "@/lib/toast-utils"

export default function TestEmailPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        recipientEmail: "info@assistenzplus.de",
        recipientName: "Test Empfänger"
    })
    const [result, setResult] = useState<any>(null)

    const handleTest = async () => {
        setLoading(true)
        setResult(null)
        try {
            const res = await fetch("/api/test-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            })

            const data = await res.json()

            if (res.ok) {
                showToast("success", "Test-E-Mail erfolgreich versendet!")
                setResult({
                    success: true,
                    message: data.message
                })
            } else {
                showToast("error", "E-Mail-Versand fehlgeschlagen")
                setResult({
                    success: false,
                    error: data.error,
                    details: data.details,
                    stack: data.stack
                })
            }
        } catch (error: any) {
            console.error("Error testing email:", error)
            showToast("error", "Fehler beim Testen")
            setResult({
                success: false,
                error: "Network error",
                details: error.message
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            E-Mail-Versand testen
                        </h1>
                        <p className="text-gray-600 mt-2">
                            Teste ob der SMTP-Server korrekt konfiguriert ist
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/admin")}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                    >
                        ← Zurück
                    </button>
                </div>

                {/* Form */}
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Empfänger E-Mail *
                        </label>
                        <input
                            type="email"
                            value={formData.recipientEmail}
                            onChange={(e) => setFormData({ ...formData, recipientEmail: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Empfänger Name *
                        </label>
                        <input
                            type="text"
                            value={formData.recipientName}
                            onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <button
                        onClick={handleTest}
                        disabled={loading}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Sende Test-E-Mail..." : "Test-E-Mail senden"}
                    </button>
                </div>

                {/* Result */}
                {result && (
                    <div className={`rounded-lg shadow p-6 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                        <h3 className={`font-bold mb-2 ${result.success ? "text-green-900" : "text-red-900"}`}>
                            {result.success ? "✓ Erfolg" : "✗ Fehler"}
                        </h3>
                        <p className={`text-sm mb-4 ${result.success ? "text-green-800" : "text-red-800"}`}>
                            {result.success ? result.message : result.error}
                        </p>

                        {!result.success && result.details && (
                            <div className="bg-white rounded p-4 mb-4">
                                <h4 className="font-medium text-gray-900 mb-2">Details:</h4>
                                <pre className="text-xs text-gray-700 overflow-auto">
                                    {result.details}
                                </pre>
                            </div>
                        )}

                        {!result.success && result.stack && (
                            <details className="bg-white rounded p-4">
                                <summary className="font-medium text-gray-900 cursor-pointer">
                                    Stack Trace
                                </summary>
                                <pre className="text-xs text-gray-700 mt-2 overflow-auto">
                                    {result.stack}
                                </pre>
                            </details>
                        )}

                        {result.success && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-4">
                                <p className="text-sm text-blue-900">
                                    <strong>Hinweis:</strong> Überprüfe den Posteingang von <strong>{formData.recipientEmail}</strong>
                                    und den Spam-Ordner. Die E-Mail wurde von <strong>david.alberg@assistenzplus.de</strong> versendet.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* SMTP Config Info */}
                <div className="bg-gray-100 rounded-lg p-6 mt-6">
                    <h3 className="font-bold text-gray-900 mb-3">SMTP-Konfiguration</h3>
                    <div className="space-y-2 text-sm text-gray-700">
                        <div className="flex">
                            <span className="font-medium w-32">Server:</span>
                            <span>smtp.gmail.com</span>
                        </div>
                        <div className="flex">
                            <span className="font-medium w-32">Port:</span>
                            <span>587</span>
                        </div>
                        <div className="flex">
                            <span className="font-medium w-32">Von:</span>
                            <span>david.alberg@assistenzplus.de</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
