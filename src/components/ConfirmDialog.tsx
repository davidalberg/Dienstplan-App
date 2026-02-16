"use client"

import { useEffect, useRef } from "react"
import { AlertTriangle, Info, Trash2, X } from "lucide-react"

interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    message: string
    variant?: "danger" | "warning" | "info"
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    variant = "danger",
    confirmLabel,
    cancelLabel = "Abbrechen",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const confirmRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (isOpen) {
            confirmRef.current?.focus()
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel()
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [isOpen, onCancel])

    if (!isOpen) return null

    const icons = {
        danger: <Trash2 size={24} className="text-red-400" />,
        warning: <AlertTriangle size={24} className="text-amber-400" />,
        info: <Info size={24} className="text-violet-400" />,
    }

    const buttonStyles = {
        danger: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
        warning: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500",
        info: "bg-violet-600 hover:bg-violet-700 focus:ring-violet-500",
    }

    const defaultLabels = {
        danger: "Löschen",
        warning: "Fortfahren",
        info: "OK",
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
            <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <button
                    type="button"
                    onClick={onCancel}
                    className="absolute top-3 right-3 p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                    aria-label="Dialog schließen"
                >
                    <X size={18} />
                </button>

                <div className="flex items-start gap-4">
                    <div className="shrink-0 mt-0.5" aria-hidden="true">
                        {icons[variant]}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">{title}</h3>
                        <p className="mt-2 text-sm text-neutral-300">{message}</p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 ${buttonStyles[variant]}`}
                    >
                        {confirmLabel || defaultLabels[variant]}
                    </button>
                </div>
            </div>
        </div>
    )
}
