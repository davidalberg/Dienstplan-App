"use client"

import { useState } from "react"
import { X, Copy } from "lucide-react"
import { addDays, addMonths, format, getDay } from "date-fns"
import { de } from "date-fns/locale"

interface Shift {
  id: string
  date: string
  plannedStart: string
  plannedEnd: string
  note: string | null
  employee: {
    id: string
    name: string
  }
  backupEmployee: { id: string; name: string } | null
}

interface DuplicateShiftModalProps {
  shift: Shift
  onClose: () => void
  onDuplicate: (targetDate: string) => void | Promise<void>
}

export default function DuplicateShiftModal({
  shift,
  onClose,
  onDuplicate
}: DuplicateShiftModalProps) {
  const [mode, setMode] = useState<"quick" | "custom">("quick")
  const [customDate, setCustomDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [loading, setLoading] = useState(false)

  const shiftDate = new Date(shift.date)
  const dayOfWeek = getDay(shiftDate)

  // Calculate quick options
  const nextWeek = addDays(shiftDate, 7)
  const nextMonth = addMonths(shiftDate, 1)

  const handleDuplicate = async (targetDate: Date) => {
    setLoading(true)
    try {
      await onDuplicate(format(targetDate, "yyyy-MM-dd"))
      onClose()
    } catch (error) {
      console.error("Duplication error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCustomDuplicate = async () => {
    if (!customDate) return
    setLoading(true)
    try {
      await onDuplicate(customDate)
      onClose()
    } catch (error) {
      console.error("Duplication error:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full border border-neutral-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Copy size={20} className="text-violet-400" />
            <h2 className="text-xl font-bold text-white">Schicht duplizieren</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white transition"
            aria-label="Schließen"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Original Shift Info */}
          <div className="bg-neutral-800 rounded-lg p-4">
            <p className="text-xs text-neutral-400 mb-1">Original-Schicht</p>
            <p className="text-sm font-semibold text-white">
              {shift.employee.name}
            </p>
            <p className="text-xs text-neutral-400">
              {format(shiftDate, "EEEE, dd.MM.yyyy", { locale: de })} • {shift.plannedStart} - {shift.plannedEnd}
            </p>
          </div>

          {/* Mode Selection */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("quick")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                mode === "quick"
                  ? "bg-violet-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              Schnellauswahl
            </button>
            <button
              onClick={() => setMode("custom")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                mode === "custom"
                  ? "bg-violet-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              Benutzerdefiniert
            </button>
          </div>

          {/* Quick Options */}
          {mode === "quick" && (
            <div className="space-y-2">
              <button
                onClick={() => handleDuplicate(nextWeek)}
                disabled={loading}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-left px-4 py-3 rounded-lg transition disabled:opacity-50"
              >
                <p className="text-sm font-medium text-white">Nächste Woche (gleicher Wochentag)</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {format(nextWeek, "EEEE, dd.MM.yyyy", { locale: de })}
                </p>
              </button>

              <button
                onClick={() => handleDuplicate(nextMonth)}
                disabled={loading}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-left px-4 py-3 rounded-lg transition disabled:opacity-50"
              >
                <p className="text-sm font-medium text-white">Nächsten Monat (gleiches Datum)</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {format(nextMonth, "EEEE, dd.MM.yyyy", { locale: de })}
                </p>
              </button>
            </div>
          )}

          {/* Custom Date Picker */}
          {mode === "custom" && (
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-2">
                Zieldatum auswählen
              </label>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Die Schichtdetails (Zeiten, Notizen, Backup) werden übernommen.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 flex gap-3">
          {mode === "custom" && (
            <button
              onClick={handleCustomDuplicate}
              disabled={loading || !customDate}
              className="flex-1 bg-violet-600 text-white py-2.5 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Copy size={18} />
              {loading ? "Dupliziert..." : "Duplizieren"}
            </button>
          )}
          <button
            onClick={onClose}
            className={`${mode === "custom" ? "flex-1" : "w-full"} border border-neutral-700 py-2.5 rounded-xl font-bold text-neutral-400 hover:bg-neutral-800 transition-colors`}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}
