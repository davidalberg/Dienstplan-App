const fs = require('fs');

// Read the current file
let content = fs.readFileSync("src/app/admin/schedule/page.tsx", "utf-8");

// 1. Add new imports to lucide-react
content = content.replace(
    `import {
    Calendar,
    List,
    Plus,
    Edit2,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    X,
    Save,
    ExternalLink,
    Eye,
    RotateCcw
} from "lucide-react"`,
    `import {
    Calendar,
    List,
    Plus,
    Edit2,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    X,
    Save,
    ExternalLink,
    Eye,
    RotateCcw,
    Copy,
    HelpCircle
} from "lucide-react"`
);

// 2. Add new component imports
content = content.replace(
    `import { useAdminSchedule } from "@/hooks/use-admin-data"
import TimesheetDetail from "@/components/TimesheetDetail"`,
    `import { useAdminSchedule } from "@/hooks/use-admin-data"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import TimesheetDetail from "@/components/TimesheetDetail"
import DuplicateShiftModal from "@/components/DuplicateShiftModal"
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp"`
);

// 3. Add new state variables
content = content.replace(
    `    // TimesheetDetail Modal State
    const [showTimesheetDetail, setShowTimesheetDetail] = useState(false)
    const [selectedTimesheetData, setSelectedTimesheetData] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)`,
    `    // TimesheetDetail Modal State
    const [showTimesheetDetail, setShowTimesheetDetail] = useState(false)
    const [selectedTimesheetData, setSelectedTimesheetData] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)

    // Duplicate Shift Modal State
    const [showDuplicateModal, setShowDuplicateModal] = useState(false)
    const [shiftToDuplicate, setShiftToDuplicate] = useState<Shift | null>(null)

    // Keyboard Shortcuts Help Modal State
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)`
);

// 4. Add handlers before navigateMonth
const handlersCode = `
    // Duplicate Shift Handler
    const openDuplicateModal = useCallback((shift: Shift) => {
        setShiftToDuplicate(shift)
        setShowDuplicateModal(true)
    }, [])

    const handleDuplicateShift = async (targetDate: string) => {
        if (!shiftToDuplicate) return

        try {
            const res = await fetch("/api/admin/schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: shiftToDuplicate.employee.id,
                    date: targetDate,
                    plannedStart: shiftToDuplicate.plannedStart,
                    plannedEnd: shiftToDuplicate.plannedEnd,
                    backupEmployeeId: shiftToDuplicate.backupEmployee?.id || null,
                    note: shiftToDuplicate.note || null
                })
            })

            if (res.ok) {
                showToast("success", "Schicht erfolgreich dupliziert")
                setShowDuplicateModal(false)
                setShiftToDuplicate(null)
                mutate() // Revalidate data
            } else {
                const data = await res.json()
                showToast("error", data.error || "Fehler beim Duplizieren")
            }
        } catch (error) {
            console.error("Duplication error:", error)
            showToast("error", "Netzwerkfehler beim Duplizieren")
        }
    }

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onNewShift: () => !showModal && !showDuplicateModal && !showShortcutsHelp && openCreateModal(),
        onEscape: () => {
            if (showModal) setShowModal(false)
            else if (showDuplicateModal) setShowDuplicateModal(false)
            else if (showShortcutsHelp) setShowShortcutsHelp(false)
            else if (showTimesheetDetail) closeTimesheetPreview()
        },
        onSave: () => showModal && handleCreateOrUpdate(),
        onPrevMonth: () => !showModal && !showDuplicateModal && !showShortcutsHelp && navigateMonth(-1),
        onNextMonth: () => !showModal && !showDuplicateModal && !showShortcutsHelp && navigateMonth(1),
        onListView: () => !showModal && !showDuplicateModal && !showShortcutsHelp && setViewMode("list"),
        onCalendarView: () => !showModal && !showDuplicateModal && !showShortcutsHelp && setViewMode("calendar"),
        onHelp: () => setShowShortcutsHelp(prev => !prev)
    }, true)

`;

content = content.replace(
    `    const closeTimesheetPreview = () => {
        setShowTimesheetDetail(false)
        setSelectedTimesheetData(null)
    }

    const navigateMonth = (delta: number) => {`,
    `    const closeTimesheetPreview = () => {
        setShowTimesheetDetail(false)
        setSelectedTimesheetData(null)
    }
${handlersCode}
    const navigateMonth = (delta: number) => {`
);

// 5. Add HelpCircle button to header
content = content.replace(
    `                    <div className="flex items-center gap-3">
                        {/* View Toggle */}
                        <div className="flex bg-neutral-800 rounded-lg p-1">`,
    `                    <div className="flex items-center gap-3">
                        {/* Keyboard Shortcuts Help */}
                        <button
                            onClick={() => setShowShortcutsHelp(true)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-400 hover:text-white"
                            title="Tastenkombinationen (Drücke ?)"
                            aria-label="Tastenkombinationen anzeigen"
                        >
                            <HelpCircle size={20} />
                        </button>

                        {/* View Toggle */}
                        <div className="flex bg-neutral-800 rounded-lg p-1">`
);

// 6. Add Copy button to action buttons
content = content.replace(
    `                                                                    <div className="flex gap-1 justify-end">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                openTimesheetPreview(shift)
                                                                            }}
                                                                            className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition"
                                                                            title="Stundennachweis anzeigen"
                                                                        >
                                                                            <Eye size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => openEditModal(shift)}
                                                                            className="p-1.5 text-neutral-500 hover:text-blue-400 hover:bg-blue-900/30 rounded transition"
                                                                        >
                                                                            <Edit2 size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDelete(shift.id)}
                                                                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>`,
    `                                                                    <div className="flex gap-1 justify-end">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                openTimesheetPreview(shift)
                                                                            }}
                                                                            className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition"
                                                                            title="Stundennachweis anzeigen"
                                                                        >
                                                                            <Eye size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                openDuplicateModal(shift)
                                                                            }}
                                                                            className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition"
                                                                            title="Schicht duplizieren"
                                                                        >
                                                                            <Copy size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => openEditModal(shift)}
                                                                            className="p-1.5 text-neutral-500 hover:text-blue-400 hover:bg-blue-900/30 rounded transition"
                                                                        >
                                                                            <Edit2 size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDelete(shift.id)}
                                                                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>`
);

// 7. Add modals at the end
content = content.replace(
    `                {/* Timesheet Detail Modal */}
                {showTimesheetDetail && selectedTimesheetData && (
                    <TimesheetDetail
                        employeeId={selectedTimesheetData.employeeId}
                        clientId={selectedTimesheetData.clientId}
                        month={month}
                        year={year}
                        onClose={closeTimesheetPreview}
                    />
                )}
            </div>
        </div>
    )
}`,
    `                {/* Timesheet Detail Modal */}
                {showTimesheetDetail && selectedTimesheetData && (
                    <TimesheetDetail
                        employeeId={selectedTimesheetData.employeeId}
                        clientId={selectedTimesheetData.clientId}
                        month={month}
                        year={year}
                        onClose={closeTimesheetPreview}
                    />
                )}

                {/* Duplicate Shift Modal */}
                {showDuplicateModal && shiftToDuplicate && (
                    <DuplicateShiftModal
                        shift={shiftToDuplicate}
                        onClose={() => {
                            setShowDuplicateModal(false)
                            setShiftToDuplicate(null)
                        }}
                        onDuplicate={handleDuplicateShift}
                    />
                )}

                {/* Keyboard Shortcuts Help Modal */}
                {showShortcutsHelp && (
                    <KeyboardShortcutsHelp
                        onClose={() => setShowShortcutsHelp(false)}
                    />
                )}
            </div>
        </div>
    )
}`
);

// Write the updated content
fs.writeFileSync("src/app/admin/schedule/page.tsx", content, "utf-8");

console.log("✅ Schedule page updated successfully!");
console.log("Added features:");
console.log("  - Keyboard shortcuts (N, ESC, Ctrl+S, ←, →, L, C, ?)");
console.log("  - Shift duplication with quick options and custom date picker");
console.log("  - Keyboard shortcuts help modal");
