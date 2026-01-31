"use client"

import { useRef, useEffect, useState } from "react"
import { Eraser, RotateCcw } from "lucide-react"

// Dynamic import type for signature_pad
type SignaturePadType = typeof import("signature_pad").default

interface SignaturePadProps {
    onSignatureChange?: (signature: string | null) => void
    width?: number
    height?: number
    className?: string
    disabled?: boolean
}

export default function SignaturePad({
    onSignatureChange,
    width = 400,
    height = 200,
    className = "",
    disabled = false
}: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const signaturePadRef = useRef<InstanceType<SignaturePadType> | null>(null)
    const [isEmpty, setIsEmpty] = useState(true)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!canvasRef.current) return

        const canvas = canvasRef.current
        let mounted = true

        // Dynamically import signature_pad library
        async function initializeSignaturePad() {
            try {
                const SignaturePadLib = (await import("signature_pad")).default

                if (!mounted || !canvasRef.current) return

                const ratio = Math.max(window.devicePixelRatio || 1, 1)

                canvas.width = canvas.offsetWidth * ratio
                canvas.height = canvas.offsetHeight * ratio
                canvas.getContext("2d")?.scale(ratio, ratio)

                signaturePadRef.current = new SignaturePadLib(canvas, {
                    backgroundColor: "rgb(255, 255, 255)",
                    penColor: "rgb(0, 0, 0)",
                    minWidth: 1,
                    maxWidth: 2.5,
                })

                signaturePadRef.current.addEventListener("endStroke", () => {
                    setIsEmpty(signaturePadRef.current?.isEmpty() ?? true)
                    if (onSignatureChange && signaturePadRef.current) {
                        const dataUrl = signaturePadRef.current.isEmpty()
                            ? null
                            : signaturePadRef.current.toDataURL("image/png")
                        onSignatureChange(dataUrl)
                    }
                })

                if (disabled) {
                    signaturePadRef.current.off()
                }

                setIsLoading(false)
            } catch (error) {
                console.error("Failed to load signature_pad:", error)
                setIsLoading(false)
            }
        }

        initializeSignaturePad()

        return () => {
            mounted = false
            signaturePadRef.current?.off()
        }
    }, [disabled, onSignatureChange])

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (!canvasRef.current || !signaturePadRef.current) return

            const canvas = canvasRef.current
            const data = signaturePadRef.current.toData()

            const ratio = Math.max(window.devicePixelRatio || 1, 1)
            canvas.width = canvas.offsetWidth * ratio
            canvas.height = canvas.offsetHeight * ratio
            canvas.getContext("2d")?.scale(ratio, ratio)

            signaturePadRef.current.clear()
            signaturePadRef.current.fromData(data)
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    const handleClear = () => {
        signaturePadRef.current?.clear()
        setIsEmpty(true)
        onSignatureChange?.(null)
    }

    const handleUndo = () => {
        if (!signaturePadRef.current) return

        const data = signaturePadRef.current.toData()
        if (data.length > 0) {
            data.pop()
            signaturePadRef.current.fromData(data)
            setIsEmpty(data.length === 0)

            if (data.length === 0) {
                onSignatureChange?.(null)
            } else {
                onSignatureChange?.(signaturePadRef.current.toDataURL("image/png"))
            }
        }
    }

    return (
        <div className={`relative ${className}`}>
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden">
                <canvas
                    ref={canvasRef}
                    style={{ width: "100%", height: `${height}px` }}
                    className={`touch-none ${disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair"}`}
                />

                {/* Loading indicator */}
                {isLoading && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80">
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                            Lädt...
                        </div>
                    </div>
                )}

                {/* Hint text when empty */}
                {isEmpty && !disabled && !isLoading && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <p className="text-gray-400 text-sm">
                            Hier unterschreiben
                        </p>
                    </div>
                )}
            </div>

            {/* Controls */}
            {!disabled && (
                <div className="mt-2 flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={handleUndo}
                        disabled={isEmpty}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RotateCcw size={14} />
                        Rückgängig
                    </button>
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={isEmpty}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Eraser size={14} />
                        Löschen
                    </button>
                </div>
            )}
        </div>
    )
}
