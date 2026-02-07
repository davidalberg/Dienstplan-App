import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { ALL_TIMESHEET_STATUSES } from "@/lib/constants"
import { z } from "zod"

const ParamsSchema = z.object({
  id: z.string().min(1)
})

interface TimeFrequency {
  start: string
  end: string
  count: number
}

/**
 * GET /api/admin/employees/[id]/recent-shifts
 *
 * Analysiert die letzten Schichten eines Mitarbeiters und liefert häufigste Zeiten zurück.
 * Nutzt geplante Zeiten (plannedStart/plannedEnd) für Vorschläge.
 *
 * Response:
 * {
 *   suggestedStart: "08:00",
 *   suggestedEnd: "16:00",
 *   confidence: 0.8
 * }
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Auth Check
    const adminResult = await requireAdmin()
    if (adminResult instanceof NextResponse) return adminResult
    const session = adminResult

    // Await params before validation
    const params = await context.params
    const validation = ParamsSchema.safeParse(params)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid employee ID", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { id: employeeId } = validation.data

    // Validiere dass Mitarbeiter existiert
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, role: true }
    })

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      )
    }

    if (employee.role !== "EMPLOYEE") {
      return NextResponse.json(
        { error: "User is not an employee" },
        { status: 400 }
      )
    }

    // Hole letzte 10 Schichten mit geplanten Zeiten
    const recentShifts = await prisma.timesheet.findMany({
      where: {
        employeeId,
        plannedStart: { not: null },
        plannedEnd: { not: null },
        status: { in: [...ALL_TIMESHEET_STATUSES] },
        absenceType: null // Keine Abwesenheiten
      },
      orderBy: { date: "desc" },
      take: 10,
      select: {
        plannedStart: true,
        plannedEnd: true
      }
    })

    // Default Fallback wenn keine Historie
    if (recentShifts.length === 0) {
      return NextResponse.json({
        suggestedStart: "08:00",
        suggestedEnd: "16:00",
        confidence: 0,
        basedOnShifts: 0,
        hint: null
      })
    }

    // Gruppiere nach Start+End Kombination
    const frequencies = new Map<string, TimeFrequency>()

    recentShifts.forEach((shift: {
      plannedStart: string | null
      plannedEnd: string | null
    }) => {
      if (!shift.plannedStart || !shift.plannedEnd) return

      const key = `${shift.plannedStart}|${shift.plannedEnd}`

      if (frequencies.has(key)) {
        const freq = frequencies.get(key)!
        freq.count++
      } else {
        frequencies.set(key, {
          start: shift.plannedStart,
          end: shift.plannedEnd,
          count: 1
        })
      }
    })

    // Finde haeufigste Kombination
    let mostCommon: TimeFrequency | null = null
    let maxCount = 0

    frequencies.forEach(freq => {
      if (freq.count > maxCount) {
        maxCount = freq.count
        mostCommon = freq
      }
    })

    // Fallback wenn keine haeufigste gefunden (sollte nicht passieren wenn recentShifts > 0)
    if (mostCommon === null) {
      return NextResponse.json({
        suggestedStart: "08:00",
        suggestedEnd: "16:00",
        confidence: 0,
        basedOnShifts: 0,
        hint: null
      })
    }

    // Extrahiere Werte aus mostCommon fuer TypeScript
    const result: TimeFrequency = mostCommon

    // Berechne Confidence (0-1)
    const confidence = recentShifts.length > 0
      ? maxCount / recentShifts.length
      : 0

    // Generiere informativen Hint
    const shiftCount = recentShifts.length
    const hint = shiftCount >= 5
      ? `Basierend auf ${shiftCount} vorherigen Schichten`
      : shiftCount > 0
        ? `Basierend auf ${shiftCount} Schicht${shiftCount > 1 ? 'en' : ''} (wenig Daten)`
        : null

    return NextResponse.json({
      suggestedStart: result.start,
      suggestedEnd: result.end,
      confidence: Math.round(confidence * 100) / 100, // 2 Dezimalstellen
      basedOnShifts: shiftCount,
      hint
    })

  } catch (error) {
    console.error("[GET /api/admin/employees/[id]/recent-shifts] Error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
