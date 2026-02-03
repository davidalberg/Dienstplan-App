export default function Loading() {
    return (
        <div className="flex items-center justify-center min-h-[400px] bg-neutral-950">
            <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
                <p className="text-sm text-neutral-400">Einstellungen werden geladen...</p>
            </div>
        </div>
    )
}
