import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

const ValidationSchema = z.object({
  employeeId: z.string().min(1, "Mitarbeiter-ID ist erforderlich"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein"),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/, "Startzeit muss im Format HH:MM sein"),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/, "Endzeit muss im Format HH:MM sein"),
  backupEmployeeId: z.string().optional().nullable(),
  excludeShiftId: z.string().optional() // Fuer Edit-Mode: eigene Schicht ignorieren
}).refine(
  (data) => data.plannedStart < data.plannedEnd || data.plannedEnd <= "06:00",
  { message: "Endzeit muss nach Startzeit liegen (ausser bei Nachtschichten)", path: ["plannedEnd"] }
)

interface Conflict {
  type: "DUPLICATE_SHIFT" | "TIME_OVERLAP" | "ABSENCE" | "SELF_BACKUP" | "BACKUP_CONFLICT" | "INVALID_TIME"
  message: string
  severity: "error" | "warning"
  icon?: string // Optional: Icon fuer UI-Darstellung
}

/**
 * POST /api/admin/schedule/validate
 *
 * Validiert eine geplante Schicht auf Konflikte:
 * - Mitarbeiter hat bereits Schicht am selben Tag
 * - Zeitüberlappung mit anderer Schicht
 * - Mitarbeiter hat Urlaub/Krankheit
 * - Backup-Mitarbeiter ist gleichzeitig Hauptmitarbeiter
 * - Backup-Mitarbeiter hat selbst Schicht zur selben Zeit
 *
 * Response:
 * {
 *   valid: boolean,
 *   conflicts: Conflict[]
 * }
 */
export async function POST(req: Request) {
  try {
    // Auth Check
    const session = await auth()
    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Parse & Validate Body
    const body = await req.json()
    const validation = ValidationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const {
      employeeId,
      date,
      plannedStart,
      plannedEnd,
      backupEmployeeId,
      excludeShiftId
    } = validation.data

    const conflicts: Conflict[] = []

    // Validiere Datum nicht in Vergangenheit (nur Warnung)
    const shiftDate = new Date(date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (shiftDate < today) {
      conflicts.push({
        type: "INVALID_TIME",
        message: `Datum liegt in der Vergangenheit (${shiftDate.toLocaleDateString("de-DE")})`,
        severity: "warning",
        icon: "clock"
      })
    }

    // Validiere Employee existiert
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true }
    })

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      )
    }

    // Build WHERE clause für eigene Schicht ausschließen
    const baseWhere = excludeShiftId
      ? { NOT: { id: excludeShiftId } }
      : {}

    // Check 1: Duplicate Shift (gleicher Tag)
    const existingShift = await prisma.timesheet.findFirst({
      where: {
        ...baseWhere,
        employeeId,
        date: new Date(date),
        status: { notIn: ["DELETED"] },
        absenceType: null // Nur reguläre Schichten
      },
      select: {
        id: true,
        plannedStart: true,
        plannedEnd: true
      }
    })

    if (existingShift) {
      conflicts.push({
        type: "DUPLICATE_SHIFT",
        message: `${employee.name} hat bereits eine Schicht von ${existingShift.plannedStart || "?"}-${existingShift.plannedEnd || "?"} am ${new Date(date).toLocaleDateString("de-DE")}`,
        severity: "warning",
        icon: "calendar"
      })
    }

    // Check 2: Time Overlap (Zeitüberschneidung)
    const overlappingShifts = await prisma.timesheet.findMany({
      where: {
        ...baseWhere,
        employeeId,
        date: new Date(date),
        status: { notIn: ["DELETED"] },
        AND: [
          { plannedStart: { not: null } },
          { plannedEnd: { not: null } }
        ]
      },
      select: {
        id: true,
        plannedStart: true,
        plannedEnd: true
      }
    })

    overlappingShifts.forEach(shift => {
      const shiftStart = shift.plannedStart || "00:00"
      const shiftEnd = shift.plannedEnd || "23:59"

      // Prüfe Überlappung: neue Schicht startet vor Ende der existierenden UND endet nach Start der existierenden
      const hasOverlap = plannedStart < shiftEnd && plannedEnd > shiftStart

      if (hasOverlap && shift.id !== existingShift?.id) {
        conflicts.push({
          type: "TIME_OVERLAP",
          message: `Zeitueberlappung mit existierender Schicht (${shiftStart}-${shiftEnd})`,
          severity: "error",
          icon: "alert-triangle"
        })
      }
    })

    // Check 3: Absence (Urlaub/Krankheit)
    const absence = await prisma.timesheet.findFirst({
      where: {
        employeeId,
        date: new Date(date),
        absenceType: { not: null },
        status: { notIn: ["DELETED"] }
      },
      select: {
        absenceType: true
      }
    })

    if (absence) {
      const absenceLabel = absence.absenceType === "SICK" ? "krank" :
                           absence.absenceType === "VACATION" ? "im Urlaub" :
                           "abwesend"

      conflicts.push({
        type: "ABSENCE",
        message: `${employee.name} ist ${absenceLabel} am ${new Date(date).toLocaleDateString("de-DE")}`,
        severity: "error",
        icon: absence.absenceType === "SICK" ? "thermometer" : "palm-tree"
      })
    }

    // Check 4: Self-Backup
    if (backupEmployeeId && backupEmployeeId === employeeId) {
      conflicts.push({
        type: "SELF_BACKUP",
        message: "Mitarbeiter kann nicht sein eigener Backup sein",
        severity: "error",
        icon: "user-x"
      })
    }

    // Check 5: Backup hat selbst Schicht zur selben Zeit
    if (backupEmployeeId && backupEmployeeId !== employeeId) {
      const backupEmployee = await prisma.user.findUnique({
        where: { id: backupEmployeeId },
        select: { name: true }
      })

      if (backupEmployee) {
        const backupShifts = await prisma.timesheet.findMany({
          where: {
            employeeId: backupEmployeeId,
            date: new Date(date),
            status: { notIn: ["DELETED"] },
            AND: [
              { plannedStart: { not: null } },
              { plannedEnd: { not: null } }
            ]
          },
          select: {
            plannedStart: true,
            plannedEnd: true,
            absenceType: true
          }
        })

        backupShifts.forEach(shift => {
          // Prüfe ob Backup abwesend ist
          if (shift.absenceType) {
            const absenceLabel = shift.absenceType === "SICK" ? "krank" :
                                 shift.absenceType === "VACATION" ? "im Urlaub" :
                                 "abwesend"
            conflicts.push({
              type: "BACKUP_CONFLICT",
              message: `Backup-Mitarbeiter ${backupEmployee.name} ist ${absenceLabel}`,
              severity: "error",
              icon: "user-x"
            })
            return
          }

          // Prüfe Zeitüberlappung
          const shiftStart = shift.plannedStart || "00:00"
          const shiftEnd = shift.plannedEnd || "23:59"
          const hasOverlap = plannedStart < shiftEnd && plannedEnd > shiftStart

          if (hasOverlap) {
            conflicts.push({
              type: "BACKUP_CONFLICT",
              message: `Backup-Mitarbeiter ${backupEmployee.name} hat bereits Schicht (${shiftStart}-${shiftEnd})`,
              severity: "warning",
              icon: "users"
            })
          }
        })
      }
    }

    return NextResponse.json({
      valid: conflicts.filter(c => c.severity === "error").length === 0,
      conflicts
    })

  } catch (error) {
    console.error("[POST /api/admin/schedule/validate] Error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
