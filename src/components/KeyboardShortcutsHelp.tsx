"use client"

import { X, Command } from "lucide-react"

interface KeyboardShortcutsHelpProps {
  onClose: () => void
}

const shortcuts = [
  { key: "N", description: "Neue Schicht erstellen" },
  { key: "ESC", description: "Modal schließen" },
  { key: "Ctrl+S", description: "Schicht speichern (im Modal)" },
  { key: "←", description: "Vorheriger Monat" },
  { key: "→", description: "Nächster Monat" },
  { key: "T", description: "Aktueller Monat (Heute)" },
  { key: "L", description: "Listen-Ansicht" },
  { key: "C", description: "Kalender-Ansicht" },
  { key: "?", description: "Tastenkombinationen anzeigen" }
]

export default function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full border border-neutral-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Command size={20} className="text-violet-400" />
            <h2 className="text-xl font-bold text-white">Tastenkombinationen</h2>
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
        <div className="p-6">
          <p className="text-sm text-neutral-400 mb-4">
            Nutzen Sie diese Tastenkombinationen für schnellere Navigation.
          </p>

          <div className="space-y-2">
            {shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-800/50 transition"
              >
                <span className="text-sm text-neutral-300">{shortcut.description}</span>
                <kbd className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono text-neutral-300">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-800">
            <p className="text-xs text-neutral-500">
              Tastenkombinationen funktionieren nicht während der Texteingabe.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="w-full bg-violet-600 text-white py-2.5 rounded-xl font-bold hover:bg-violet-700 transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
