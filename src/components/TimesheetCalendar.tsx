"use client"

import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday } from "date-fns"
import { de } from "date-fns/locale"
import { formatTimeRange } from "@/lib/time-utils"

interface CalendarTimesheet {
    id: string
    date: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    status: string
    absenceType: string | null
    note: string | null
}

interface TimesheetCalendarProps {
    timesheets: CalendarTimesheet[]
    currentDate: Date
    onDayClick: (timesheet: CalendarTimesheet) => void
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

function getStatusDotColor(timesheet: CalendarTimesheet): string {
    if (timesheet.absenceType === "SICK") return "bg-red-500"
    if (timesheet.absenceType === "VACATION") return "bg-cyan-500"

    const isBackup = timesheet.note?.includes("Backup-Schicht anfallend")
    if (isBackup) return "bg-orange-500"

    switch (timesheet.status) {
        case "SUBMITTED": return "bg-blue-500"
        case "COMPLETED": return "bg-emerald-500"
        case "CONFIRMED":
        case "CHANGED":
            return "bg-green-500"
        default:
            return "bg-gray-400"
    }
}

function getStatusBgColor(timesheet: CalendarTimesheet): string {
    if (timesheet.absenceType === "SICK") return "bg-red-50"
    if (timesheet.absenceType === "VACATION") return "bg-cyan-50"

    const isBackup = timesheet.note?.includes("Backup-Schicht anfallend")
    if (isBackup) return "bg-orange-50"

    switch (timesheet.status) {
        case "SUBMITTED": return "bg-blue-50"
        case "COMPLETED": return "bg-emerald-50"
        case "CONFIRMED":
        case "CHANGED":
            return "bg-green-50"
        default:
            return "bg-gray-50"
    }
}

function getShortTimeRange(start: string | null, end: string | null): string {
    if (!start || !end) return ""
    const s = start.slice(0, 2).replace(/^0/, "")
    const e = end.slice(0, 2).replace(/^0/, "")
    return `${s}-${e}`
}

export default function TimesheetCalendar({ timesheets, currentDate, onDayClick }: TimesheetCalendarProps) {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // getDay returns 0=Sunday, we need Monday=0
    const startDayOfWeek = (getDay(monthStart) + 6) % 7

    // Map timesheets by date string for fast lookup
    const timesheetMap = new Map<string, CalendarTimesheet>()
    for (const ts of timesheets) {
        const dateKey = typeof ts.date === "string" ? ts.date.slice(0, 10) : format(new Date(ts.date), "yyyy-MM-dd")
        timesheetMap.set(dateKey, ts)
    }

    return (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
                {WEEKDAYS.map((day) => (
                    <div key={day} className="py-2 text-center text-xs font-bold text-gray-500 uppercase">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
                {/* Empty padding cells before first day */}
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <div key={`pad-${i}`} className="min-h-[60px] sm:min-h-[72px] border-b border-r border-gray-100" />
                ))}

                {days.map((day) => {
                    const dateKey = format(day, "yyyy-MM-dd")
                    const ts = timesheetMap.get(dateKey)
                    const today = isToday(day)
                    const dayOfWeek = (getDay(day) + 6) % 7
                    const isWeekend = dayOfWeek >= 5

                    return (
                        <div
                            key={dateKey}
                            onClick={() => ts && onDayClick(ts)}
                            onKeyDown={(e) => {
                                if (ts && (e.key === "Enter" || e.key === " ")) {
                                    e.preventDefault()
                                    onDayClick(ts)
                                }
                            }}
                            role={ts ? "button" : undefined}
                            tabIndex={ts ? 0 : undefined}
                            aria-label={ts ? `Schicht am ${format(day, "d. MMMM", { locale: de })}` : undefined}
                            className={`
                                min-h-[60px] sm:min-h-[72px] border-b border-r border-gray-100 p-1 sm:p-1.5
                                transition-colors relative
                                ${ts ? "cursor-pointer hover:bg-gray-50" : ""}
                                ${today ? "ring-2 ring-inset ring-blue-400 bg-blue-50/30" : ""}
                                ${!ts && isWeekend ? "bg-gray-50/50" : ""}
                            `}
                        >
                            {/* Day number */}
                            <span className={`
                                text-xs font-bold leading-none
                                ${today ? "text-blue-600" : ts ? "text-gray-900" : "text-gray-400"}
                            `}>
                                {format(day, "d")}
                            </span>

                            {/* Shift info */}
                            {ts && (
                                <div className="mt-0.5">
                                    {/* Status dot + short label */}
                                    <div className="flex items-center gap-1">
                                        <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${getStatusDotColor(ts)}`} />
                                        <span className={`text-[9px] sm:text-[10px] font-semibold truncate leading-tight ${
                                            ts.absenceType === "SICK" ? "text-red-600" :
                                            ts.absenceType === "VACATION" ? "text-cyan-600" :
                                            "text-gray-600"
                                        }`}>
                                            {ts.absenceType === "SICK" ? "Krank" :
                                             ts.absenceType === "VACATION" ? "Urlaub" :
                                             getShortTimeRange(ts.plannedStart, ts.plannedEnd)}
                                        </span>
                                    </div>

                                    {/* Full time range - hidden on very small screens */}
                                    {!ts.absenceType && (
                                        <p className="hidden sm:block text-[9px] text-gray-400 mt-0.5 leading-tight">
                                            {formatTimeRange(ts.plannedStart, ts.plannedEnd)}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    <span className="text-[10px] text-gray-500">Geplant</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-[10px] text-gray-500">Best.</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] text-gray-500">Eingereicht</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-gray-500">Abgeschl.</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-[10px] text-gray-500">Krank</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-cyan-500" />
                    <span className="text-[10px] text-gray-500">Urlaub</span>
                </div>
            </div>
        </div>
    )
}
