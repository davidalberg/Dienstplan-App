#!/usr/bin/env python3
"""Script to add keyboard shortcuts and duplication features to schedule page"""

import re

# Read the current file
with open("src/app/admin/schedule/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add new imports to lucide-react
old_imports = """import {
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
} from "lucide-react\""""

new_imports = """import {
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
} from "lucide-react\""""

content = content.replace(old_imports, new_imports)

# 2. Add new component imports
old_component_imports = """import { useAdminSchedule } from "@/hooks/use-admin-data"
import TimesheetDetail from "@/components/TimesheetDetail\""""

new_component_imports = """import { useAdminSchedule } from "@/hooks/use-admin-data"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import TimesheetDetail from "@/components/TimesheetDetail"
import DuplicateShiftModal from "@/components/DuplicateShiftModal"
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp\""""

content = content.replace(old_component_imports, new_component_imports)

# 3. Add new state variables after TimesheetDetail state
old_timesheet_state = """    // TimesheetDetail Modal State
    const [showTimesheetDetail, setShowTimesheetDetail] = useState(false)
    const [selectedTimesheetData, setSelectedTimesheetData] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)"""

new_timesheet_state = """    // TimesheetDetail Modal State
    const [showTimesheetDetail, setShowTimesheetDetail] = useState(false)
    const [selectedTimesheetData, setSelectedTimesheetData] = useState<{
        employeeId: string
        clientId: string
    } | null>(null)

    // Duplicate Shift Modal State
    const [showDuplicateModal, setShowDuplicateModal] = useState(false)
    const [shiftToDuplicate, setShiftToDuplicate] = useState<Shift | null>(null)

    // Keyboard Shortcuts Help Modal State
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)"""

content = content.replace(old_timesheet_state, new_timesheet_state)

# 4. Add handlers before navigateMonth function
old_navigate_section = """    const closeTimesheetPreview = () => {
        setShowTimesheetDetail(false)
        setSelectedTimesheetData(null)
    }

    const navigateMonth = (delta: number) => {"""

new_navigate_section = """    const closeTimesheetPreview = () => {
        setShowTimesheetDetail(false)
        setSelectedTimesheetData(null)
    }

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

    const navigateMonth = (delta: number) => {"""

content = content.replace(old_navigate_section, new_navigate_section)

# 5. Add HelpCircle button to header
old_header_buttons = """                    <div className="flex items-center gap-3">
                        {/* View Toggle */}
                        <div className="flex bg-neutral-800 rounded-lg p-1">"""

new_header_buttons = """                    <div className="flex items-center gap-3">
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
                        <div className="flex bg-neutral-800 rounded-lg p-1">"""

content = content.replace(old_header_buttons, new_header_buttons)

# 6. Add Copy button to action buttons in table
old_action_buttons = """                                                                    <div className="flex gap-1 justify-end">
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
                                                                    </div>"""

new_action_buttons = """                                                                    <div className="flex gap-1 justify-end">
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
                                                                    </div>"""

content = content.replace(old_action_buttons, new_action_buttons)

# 7. Add modals at the end before closing </div></div>
old_timesheet_modal = """                {/* Timesheet Detail Modal */}
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
}"""

new_timesheet_modal = """                {/* Timesheet Detail Modal */}
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
}"""

content = content.replace(old_timesheet_modal, new_timesheet_modal)

# Write the updated content
with open("src/app/admin/schedule/page.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("✅ Schedule page updated successfully!")
print("Added features:")
print("  - Keyboard shortcuts (N, ESC, Ctrl+S, ←, →, L, C, ?)")
print("  - Shift duplication with quick options and custom date picker")
print("  - Keyboard shortcuts help modal")
