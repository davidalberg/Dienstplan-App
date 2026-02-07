"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"

export default function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params)
    const router = useRouter()

    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const [tokenValid, setTokenValid] = useState(false)

    useEffect(() => {
        async function validateToken() {
            try {
                const res = await fetch(`/api/register/${token}`)
                if (!res.ok) {
                    setError("Dieser Einladungslink ist ungültig oder abgelaufen.")
                    setLoading(false)
                    return
                }
                const data = await res.json()
                setName(data.name || "")
                setEmail(data.email || "")
                setTokenValid(true)
            } catch {
                setError("Fehler beim Laden der Einladung.")
            }
            setLoading(false)
        }
        validateToken()
    }, [token])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")

        if (password.length < 8) {
            setError("Passwort muss mindestens 8 Zeichen lang sein.")
            return
        }

        if (password !== confirmPassword) {
            setError("Passwörter stimmen nicht überein.")
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch(`/api/register/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            })

            if (!res.ok) {
                const data = await res.json()
                setError(data.error || "Registrierung fehlgeschlagen.")
                setSubmitting(false)
                return
            }

            setSuccess(true)
            setTimeout(() => router.push("/login"), 3000)
        } catch {
            setError("Netzwerkfehler. Bitte versuche es erneut.")
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-600">Einladung wird überprüft...</p>
                </div>
            </div>
        )
    }

    if (!tokenValid) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                    <div className="text-5xl mb-4">⚠️</div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Einladung ungültig</h1>
                    <p className="text-gray-600 mb-6">{error || "Dieser Einladungslink ist ungültig oder abgelaufen."}</p>
                    <p className="text-sm text-gray-500">
                        Bitte kontaktiere deinen Administrator, um eine neue Einladung zu erhalten.
                    </p>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                    <div className="text-5xl mb-4">✅</div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Registrierung erfolgreich!</h1>
                    <p className="text-gray-600 mb-6">
                        Dein Passwort wurde gesetzt. Du wirst in wenigen Sekunden zur Anmeldeseite weitergeleitet...
                    </p>
                    <a href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                        Jetzt anmelden
                    </a>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Registrierung</h1>
                    <p className="text-gray-600 mt-2">Erstelle dein Passwort für die Dienstplan App</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-800">
                        <span className="font-semibold">Name:</span> {name}
                    </p>
                    <p className="text-sm text-blue-800">
                        <span className="font-semibold">E-Mail:</span> {email}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                            Passwort
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mindestens 8 Zeichen"
                            required
                            minLength={8}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        />
                    </div>

                    <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                            Passwort bestätigen
                        </label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Passwort wiederholen"
                            required
                            minLength={8}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        {submitting ? "Wird registriert..." : "Passwort setzen"}
                    </button>
                </form>
            </div>
        </div>
    )
}
