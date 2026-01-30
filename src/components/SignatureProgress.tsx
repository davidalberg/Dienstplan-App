"use client"

import { CheckCircle2 } from "lucide-react"

interface SignatureProgressProps {
    completed: number
    total: number
    variant?: "circle" | "text"
    size?: "sm" | "md"
}

/**
 * Displays signature progress as a badge or circular indicator.
 * Shows green background with checkmark when all signatures are completed.
 */
export default function SignatureProgress({
    completed,
    total,
    variant = "text",
    size = "sm"
}: SignatureProgressProps) {
    const isComplete = completed === total && total > 0
    const percentage = total > 0 ? (completed / total) * 100 : 0

    // Size classes
    const sizeClasses = {
        sm: {
            badge: "px-2 py-1 text-xs",
            icon: 12,
            circle: "w-10 h-10 text-xs"
        },
        md: {
            badge: "px-2.5 py-1.5 text-sm",
            icon: 14,
            circle: "w-12 h-12 text-sm"
        }
    }

    const currentSize = sizeClasses[size]

    if (variant === "text") {
        return (
            <div
                className={`
                    inline-flex items-center gap-1.5
                    ${currentSize.badge}
                    rounded-md
                    font-medium
                    transition-colors duration-150
                    ${
                        isComplete
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-neutral-700 text-neutral-300 border border-neutral-600"
                    }
                `}
                title={
                    isComplete
                        ? "Alle Unterschriften vorhanden"
                        : `${completed} von ${total} Unterschriften vorhanden`
                }
            >
                {isComplete && <CheckCircle2 size={currentSize.icon} className="shrink-0" />}
                <span className="whitespace-nowrap">
                    {completed}/{total}
                </span>
            </div>
        )
    }

    // Circle variant - simplified circular progress
    return (
        <div
            className={`
                relative inline-flex items-center justify-center
                ${currentSize.circle}
                rounded-full
                ${
                    isComplete
                        ? "bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/30"
                        : "bg-neutral-700 text-neutral-300 border-2 border-neutral-600"
                }
            `}
            title={
                isComplete
                    ? "Alle Unterschriften vorhanden"
                    : `${completed} von ${total} Unterschriften (${Math.round(percentage)}%)`
            }
        >
            {/* SVG Progress Ring (optional enhancement) */}
            {!isComplete && (
                <svg
                    className="absolute inset-0 -rotate-90"
                    viewBox="0 0 36 36"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        className="stroke-neutral-600"
                        strokeWidth="2"
                    />
                    <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        className="stroke-violet-500 transition-all duration-300"
                        strokeWidth="2"
                        strokeDasharray="100"
                        strokeDashoffset={100 - percentage}
                        strokeLinecap="round"
                    />
                </svg>
            )}

            {/* Text Content */}
            <span className="relative z-10 font-semibold flex items-center gap-1">
                {isComplete ? (
                    <CheckCircle2 size={currentSize.icon} />
                ) : (
                    <span>
                        {completed}/{total}
                    </span>
                )}
            </span>
        </div>
    )
}
