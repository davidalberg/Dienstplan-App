"use client"

interface SkeletonProps {
    className?: string
}

export function Skeleton({ className = "" }: SkeletonProps) {
    return (
        <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
    )
}

export function SkeletonCard() {
    return (
        <div className="rounded-xl bg-white p-4 shadow-sm space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
        </div>
    )
}

interface SkeletonTableProps {
    rows?: number
    cols?: number
}

export function SkeletonTable({ rows = 5, cols = 4 }: SkeletonTableProps) {
    return (
        <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 p-3 flex gap-4">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <div key={rowIdx} className="border-b border-gray-50 p-3 flex gap-4">
                    {Array.from({ length: cols }).map((_, colIdx) => (
                        <Skeleton key={colIdx} className="h-3 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    )
}
