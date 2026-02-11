"use client"

import { AlertCircle, RefreshCw, RotateCcw } from "lucide-react"

export default function SignError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
                    <AlertCircle className="text-red-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Etwas ist schiefgelaufen
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                    {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={reset}
                        className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-700 transition-colors"
                    >
                        <RefreshCw size={18} />
                        Erneut versuchen
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                        <RotateCcw size={18} />
                        Seite neu laden
                    </button>
                </div>
            </div>
        </div>
    )
}
