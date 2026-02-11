"use client"

import { useState, useEffect } from "react"
import { WifiOff } from "lucide-react"

export default function ConnectionStatus() {
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)
        return () => {
            window.removeEventListener("online", handleOnline)
            window.removeEventListener("offline", handleOffline)
        }
    }, [])

    if (isOnline) return null

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-md">
            <WifiOff size={16} />
            Keine Internetverbindung
        </div>
    )
}
