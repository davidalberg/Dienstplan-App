"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Sparkles, Upload, FileText, ImageIcon, X, Check, AlertTriangle, Loader2, ArrowLeft, ChevronDown, Calendar, RotateCcw } from "lucide-react"
import { showToast } from "@/lib/toast-utils"
import type { RecognizedShift, AIAssistantResponse } from "@/lib/ai-assistant"
import * as XLSX from "xlsx"

type PageState = "input" | "loading" | "preview" | "creating" | "results"

interface EditableShift extends RecognizedShift {
    selected: boolean
    index: number
}

interface CreationResult {
    shift: EditableShift
    success: boolean
    error?: string
}

interface EmployeeOption {
    id: string
    name: string
    clientIds: string[]
}

interface ClientOption {
    id: string
    name: string
}

export default function AIAssistantPage() {
    const [pageState, setPageState] = useState<PageState>("input")
    const [textInput, setTextInput] = useState("")
    const [fileName, setFileName] = useState<string | null>(null)
    const [fileType, setFileType] = useState<"text" | "image" | "pdf" | "xlsx" | null>(null)
    const [shifts, setShifts] = useState<EditableShift[]>([])
    const [summary, setSummary] = useState("")
    const [warnings, setWarnings] = useState<string[]>([])
    const [results, setResults] = useState<CreationResult[]>([])
    const [employees, setEmployees] = useState<EmployeeOption[]>([])
    const [clients, setClients] = useState<ClientOption[]>([])
    const [selectedClientId, setSelectedClientId] = useState<string>("")
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const fileContentRef = useRef<{ type: string; content: string; mimeType?: string } | null>(null)

    // Load employees and clients for dropdowns
    useEffect(() => {
        fetch("/api/admin/employees")
            .then(res => res.json())
            .then(data => {
                const list = Array.isArray(data) ? data : (data.employees || [])
                setEmployees(list.map((e: { id: string; name: string; clients?: { id: string }[] }) => ({
                    id: e.id,
                    name: e.name,
                    clientIds: (e.clients || []).map((c: { id: string }) => c.id),
                })))
            })
            .catch(() => {/* ignore */})

        fetch("/api/clients")
            .then(res => res.json())
            .then(data => {
                const list = Array.isArray(data) ? data : (data.clients || [])
                setClients(list.map((c: { id: string; firstName: string; lastName: string }) => ({
                    id: c.id,
                    name: `${c.firstName} ${c.lastName}`.trim(),
                })))
            })
            .catch(() => {/* ignore */})
    }, [])

    const handleFileSelect = useCallback(async (file: File) => {
        const maxSize = 4 * 1024 * 1024
        if (file.size > maxSize) {
            showToast("error", "Datei zu groß. Maximal 4MB erlaubt.")
            return
        }

        setFileName(file.name)

        if (file.name.match(/\.xlsx?$/i)) {
            // Parse Excel client-side
            setFileType("xlsx")
            const buffer = await file.arrayBuffer()
            const wb = XLSX.read(buffer, { type: "array" })
            const textParts: string[] = []
            for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName]
                const csv = XLSX.utils.sheet_to_csv(ws, { FS: "\t", RS: "\n" })
                textParts.push(`--- Tabellenblatt: ${sheetName} ---\n${csv}`)
            }
            const xlsxText = textParts.join("\n\n")
            fileContentRef.current = { type: "xlsx", content: xlsxText }
            setTextInput(xlsxText)
        } else if (file.type.startsWith("image/")) {
            setFileType("image")
            const base64 = await fileToBase64(file)
            fileContentRef.current = { type: "image", content: base64, mimeType: file.type }
            setTextInput(`[Bild: ${file.name}]`)
        } else if (file.type === "application/pdf") {
            setFileType("pdf")
            const base64 = await fileToBase64(file)
            fileContentRef.current = { type: "pdf", content: base64, mimeType: file.type }
            setTextInput(`[PDF: ${file.name}]`)
        } else {
            showToast("error", "Nicht unterstütztes Dateiformat. Erlaubt: Bilder, PDF, Excel.")
        }
    }, [])

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const result = reader.result as string
                // Remove data:xxx;base64, prefix
                const base64 = result.split(",")[1]
                resolve(base64)
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFileSelect(file)
    }, [handleFileSelect])

    const clearFile = () => {
        setFileName(null)
        setFileType(null)
        fileContentRef.current = null
        setTextInput("")
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleAnalyze = async () => {
        if (!textInput.trim() && !fileContentRef.current) {
            showToast("error", "Bitte Text eingeben oder eine Datei hochladen.")
            return
        }

        setPageState("loading")

        try {
            const selectedClient = clients.find(c => c.id === selectedClientId)
            let requestBody: { type: string; content: string; mimeType?: string; fileName?: string; clientId?: string; clientName?: string }

            if (fileContentRef.current && (fileContentRef.current.type === "image" || fileContentRef.current.type === "pdf")) {
                requestBody = {
                    type: fileContentRef.current.type,
                    content: fileContentRef.current.content,
                    mimeType: fileContentRef.current.mimeType,
                    fileName: fileName || undefined,
                    clientId: selectedClientId || undefined,
                    clientName: selectedClient?.name || undefined,
                }
            } else {
                // Text or XLSX (pre-parsed to text)
                requestBody = {
                    type: fileType === "xlsx" ? "xlsx" : "text",
                    content: textInput,
                    fileName: fileName || undefined,
                    clientId: selectedClientId || undefined,
                    clientName: selectedClient?.name || undefined,
                }
            }

            const res = await fetch("/api/admin/ai-assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || `Fehler ${res.status}`)
            }

            const data: AIAssistantResponse = await res.json()

            setShifts(data.shifts.map((s, i) => ({ ...s, selected: true, index: i })))
            setSummary(data.summary)
            setWarnings(data.warnings)
            setPageState("preview")

            if (data.shifts.length === 0) {
                showToast("warning", "Keine Schichten erkannt. Versuche es mit einem anderen Text oder Format.")
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Unbekannter Fehler"
            showToast("error", msg)
            setPageState("input")
        }
    }

    const updateShift = (index: number, updates: Partial<EditableShift>) => {
        setShifts(prev => prev.map(s => s.index === index ? { ...s, ...updates } : s))
    }

    const toggleAll = () => {
        const allSelected = shifts.every(s => s.selected)
        setShifts(prev => prev.map(s => ({ ...s, selected: !allSelected })))
    }

    const handleCreate = async () => {
        const selected = shifts.filter(s => s.selected)
        if (selected.length === 0) {
            showToast("error", "Keine Schichten ausgewählt.")
            return
        }

        const unmatched = selected.filter(s => !s.employeeId)
        if (unmatched.length > 0) {
            showToast("error", `${unmatched.length} Schicht(en) ohne Mitarbeiter-Zuordnung. Bitte zuerst zuordnen.`)
            return
        }

        setPageState("creating")
        const creationResults: CreationResult[] = []

        for (const shift of selected) {
            try {
                const res = await fetch("/api/admin/schedule", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        employeeId: shift.employeeId,
                        date: shift.date,
                        plannedStart: shift.startTime,
                        plannedEnd: shift.endTime,
                        note: shift.note || undefined,
                    }),
                })

                if (!res.ok) {
                    const err = await res.json()
                    creationResults.push({ shift, success: false, error: err.error || `Fehler ${res.status}` })
                } else {
                    creationResults.push({ shift, success: true })
                }
            } catch {
                creationResults.push({ shift, success: false, error: "Netzwerkfehler" })
            }
        }

        setResults(creationResults)
        setPageState("results")

        const successCount = creationResults.filter(r => r.success).length
        const failCount = creationResults.filter(r => !r.success).length
        if (failCount === 0) {
            showToast("success", `${successCount} Schicht(en) erfolgreich erstellt.`)
        } else {
            showToast("warning", `${successCount} erstellt, ${failCount} fehlgeschlagen.`)
        }
    }

    const handleBack = () => {
        setPageState("input")
        setShifts([])
        setSummary("")
        setWarnings([])
        setResults([])
    }

    const handleReset = () => {
        handleBack()
        setTextInput("")
        setFileName(null)
        setFileType(null)
        setSelectedClientId("")
        fileContentRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-violet-600/20">
                    <Sparkles size={24} className="text-violet-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">KI-Assistent</h1>
                    <p className="text-sm text-neutral-400">
                        Schichten automatisch aus Text, Bildern oder Dokumenten erstellen
                    </p>
                </div>
            </div>

            {/* Input State */}
            {pageState === "input" && (
                <div className="space-y-4">
                    {/* Client Selection */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Klient (optional)
                        </label>
                        <div className="relative">
                            <select
                                value={selectedClientId}
                                onChange={(e) => setSelectedClientId(e.target.value)}
                                className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm appearance-none"
                            >
                                <option value="">Kein Klient ausgewählt — KI erkennt automatisch</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        </div>
                        {selectedClientId && (
                            <p className="mt-1.5 text-xs text-violet-400">
                                Schichten werden für diesen Klienten erstellt. Mitarbeiter-Vorschläge werden priorisiert.
                            </p>
                        )}
                    </div>

                    {/* Text Input */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Text eingeben (WhatsApp, E-Mail, Transkription...)
                        </label>
                        <textarea
                            value={textInput}
                            onChange={(e) => {
                                setTextInput(e.target.value)
                                if (fileContentRef.current) {
                                    // User is typing over file content — clear file
                                    if (fileType === "image" || fileType === "pdf") {
                                        clearFile()
                                    }
                                }
                            }}
                            placeholder={"Beispiel:\nMax kommt Mo-Fr 8-16 Uhr\nLena am Dienstag 10:00 bis 14:00\nMittwoch fällt aus"}
                            rows={8}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-y text-sm font-mono"
                        />
                    </div>

                    {/* File Upload */}
                    <div
                        className={`bg-neutral-900 border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                            dragOver
                                ? "border-violet-500 bg-violet-500/10"
                                : "border-neutral-700 hover:border-neutral-600"
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => { if (!fileName) fileInputRef.current?.click() }}
                    >
                        {fileName ? (
                            <div className="flex items-center justify-center gap-3">
                                {fileType === "image" ? <ImageIcon size={20} className="text-blue-400" /> : <FileText size={20} className="text-green-400" />}
                                <span className="text-white font-medium">{fileName}</span>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); clearFile() }}
                                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Upload size={32} className="mx-auto text-neutral-500 mb-3" />
                                <p className="text-neutral-300 font-medium mb-1">
                                    Datei hierher ziehen oder klicken
                                </p>
                                <p className="text-sm text-neutral-500">
                                    Bilder (PNG, JPG, WebP), PDF oder Excel (XLSX)
                                </p>
                            </>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.xls"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleFileSelect(file)
                            }}
                        />
                    </div>

                    {/* Analyze Button */}
                    <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={!textInput.trim() && !fileContentRef.current}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                    >
                        <Sparkles size={18} />
                        Analysieren
                    </button>
                </div>
            )}

            {/* Loading State */}
            {pageState === "loading" && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
                    <Loader2 size={40} className="mx-auto text-violet-400 animate-spin mb-4" />
                    <p className="text-white font-medium mb-1">KI analysiert...</p>
                    <p className="text-sm text-neutral-400">
                        Schichten werden aus dem Input erkannt. Das kann einige Sekunden dauern.
                    </p>
                </div>
            )}

            {/* Preview State */}
            {pageState === "preview" && (
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                        <p className="text-sm text-neutral-300">{summary}</p>
                        {warnings.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {warnings.map((w, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-amber-400">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                        <span>{w}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Shifts Table */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                            <span className="text-sm font-medium text-neutral-300">
                                {shifts.filter(s => s.selected).length} / {shifts.length} Schichten ausgewählt
                            </span>
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
                            >
                                {shifts.every(s => s.selected) ? "Keine auswählen" : "Alle auswählen"}
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-800 text-neutral-400">
                                        <th className="px-4 py-2 text-left w-10"></th>
                                        <th className="px-4 py-2 text-left">Mitarbeiter</th>
                                        <th className="px-4 py-2 text-left">Datum</th>
                                        <th className="px-4 py-2 text-left">Von</th>
                                        <th className="px-4 py-2 text-left">Bis</th>
                                        <th className="px-4 py-2 text-left">Notiz</th>
                                        <th className="px-4 py-2 text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shifts.map((shift) => (
                                        <ShiftRow
                                            key={shift.index}
                                            shift={shift}
                                            employees={employees}
                                            selectedClientId={selectedClientId}
                                            onUpdate={(updates) => updateShift(shift.index, updates)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={16} />
                            Zurück
                        </button>
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={shifts.filter(s => s.selected).length === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                        >
                            <Check size={18} />
                            {shifts.filter(s => s.selected).length} Schicht(en) erstellen
                        </button>
                    </div>
                </div>
            )}

            {/* Creating State */}
            {pageState === "creating" && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
                    <Loader2 size={40} className="mx-auto text-violet-400 animate-spin mb-4" />
                    <p className="text-white font-medium mb-1">Schichten werden erstellt...</p>
                    <p className="text-sm text-neutral-400">
                        Bitte warten, die Schichten werden im Dienstplan angelegt.
                    </p>
                </div>
            )}

            {/* Results State */}
            {pageState === "results" && (
                <div className="space-y-4">
                    {/* Results Summary */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-lg ${results.every(r => r.success) ? "bg-green-500/20" : "bg-amber-500/20"}`}>
                                {results.every(r => r.success)
                                    ? <Check size={20} className="text-green-400" />
                                    : <AlertTriangle size={20} className="text-amber-400" />
                                }
                            </div>
                            <div>
                                <p className="text-white font-medium">
                                    {results.filter(r => r.success).length} von {results.length} Schichten erstellt
                                </p>
                                {results.some(r => !r.success) && (
                                    <p className="text-sm text-amber-400">
                                        {results.filter(r => !r.success).length} fehlgeschlagen
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Result Details */}
                        <div className="space-y-2 mt-4">
                            {results.map((r, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                                        r.success ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"
                                    }`}
                                >
                                    {r.success ? <Check size={14} /> : <X size={14} />}
                                    <span className="font-medium">{r.shift.employeeName}</span>
                                    <span className="text-neutral-400">{formatDate(r.shift.date)}</span>
                                    <span className="text-neutral-400">{r.shift.startTime}–{r.shift.endTime}</span>
                                    {r.error && <span className="ml-auto text-red-400">{r.error}</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors"
                        >
                            <RotateCcw size={16} />
                            Neu starten
                        </button>
                        <a
                            href="/admin/schedule"
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Calendar size={18} />
                            Zum Kalender
                        </a>
                    </div>
                </div>
            )}
        </div>
    )
}

// --- ShiftRow Component ---

function ShiftRow({
    shift,
    employees,
    selectedClientId,
    onUpdate,
}: {
    shift: EditableShift
    employees: EmployeeOption[]
    selectedClientId: string
    onUpdate: (updates: Partial<EditableShift>) => void
}) {
    const [showAllEmployees, setShowAllEmployees] = useState(false)
    const isMatched = !!shift.employeeId
    const confidenceColor = {
        high: "text-green-400",
        medium: "text-amber-400",
        low: "text-red-400",
    }[shift.confidence]

    // Filter employees by client if one is selected
    const filteredByClient = selectedClientId && !showAllEmployees
        ? employees.filter(e => e.clientIds.includes(selectedClientId))
        : employees
    // Always include the currently matched employee in the list (even if not assigned to this client)
    const currentEmpInList = shift.employeeId && filteredByClient.some(e => e.id === shift.employeeId)
    const clientEmployees = (!currentEmpInList && shift.employeeId)
        ? [...filteredByClient, ...employees.filter(e => e.id === shift.employeeId)]
        : filteredByClient
    const hasClientFilter = selectedClientId && !showAllEmployees && filteredByClient.length < employees.length

    return (
        <tr className={`border-b border-neutral-800/50 ${!shift.selected ? "opacity-40" : ""}`}>
            {/* Checkbox */}
            <td className="px-4 py-2">
                <input
                    type="checkbox"
                    checked={shift.selected}
                    onChange={(e) => onUpdate({ selected: e.target.checked })}
                    className="rounded border-neutral-600 bg-neutral-800 text-violet-500 focus:ring-violet-500"
                />
            </td>

            {/* Employee — always editable */}
            <td className="px-4 py-2">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isMatched ? "bg-green-400" : "bg-red-400"}`} />
                        <span className={`text-xs ${isMatched ? "text-neutral-400" : "text-red-300"}`}>
                            {shift.employeeName}
                        </span>
                    </div>
                    <div className="relative">
                        <select
                            value={shift.employeeId || ""}
                            onChange={(e) => {
                                const emp = employees.find(em => em.id === e.target.value)
                                if (emp) {
                                    onUpdate({ employeeId: emp.id, employeeName: emp.name, matchIssue: null, confidence: "high" })
                                } else if (!e.target.value) {
                                    onUpdate({ employeeId: null, matchIssue: "Kein Mitarbeiter zugeordnet" })
                                }
                            }}
                            className={`w-full pl-2 pr-7 py-1 bg-neutral-800 border rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500 appearance-none ${
                                isMatched ? "border-neutral-700" : "border-red-500/50"
                            }`}
                        >
                            <option value="">Mitarbeiter zuordnen...</option>
                            {clientEmployees.map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                    {hasClientFilter && (
                        <button
                            type="button"
                            onClick={() => setShowAllEmployees(true)}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        >
                            Alle Mitarbeiter anzeigen ({employees.length})
                        </button>
                    )}
                    {shift.matchIssue && (
                        <p className="text-xs text-amber-400">{shift.matchIssue}</p>
                    )}
                </div>
            </td>

            {/* Date */}
            <td className="px-4 py-2">
                <input
                    type="date"
                    value={shift.date}
                    onChange={(e) => onUpdate({ date: e.target.value })}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 [color-scheme:dark]"
                />
            </td>

            {/* Start Time */}
            <td className="px-4 py-2">
                <input
                    type="time"
                    value={shift.startTime}
                    onChange={(e) => onUpdate({ startTime: e.target.value })}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 [color-scheme:dark]"
                />
            </td>

            {/* End Time */}
            <td className="px-4 py-2">
                <input
                    type="time"
                    value={shift.endTime}
                    onChange={(e) => onUpdate({ endTime: e.target.value })}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 [color-scheme:dark]"
                />
            </td>

            {/* Note */}
            <td className="px-4 py-2">
                <input
                    type="text"
                    value={shift.note || ""}
                    onChange={(e) => onUpdate({ note: e.target.value || null })}
                    placeholder="—"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-sm placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
            </td>

            {/* Status */}
            <td className="px-4 py-2">
                <span className={`text-xs font-medium ${confidenceColor}`}>
                    {shift.confidence === "high" ? "Sicher" : shift.confidence === "medium" ? "Unsicher" : "Unklar"}
                </span>
            </td>
        </tr>
    )
}

// --- Helpers ---

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr + "T12:00:00")
        return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
    } catch {
        return dateStr
    }
}
