import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"
import { eachDayOfInterval, parseISO, startOfDay } from "date-fns"

const approvalSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"])
})

// PUT - Approve or reject vacation request
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 })
    }

    const body = await request.json()
    const validation = approvalSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: "Ungültige Aktion", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { action } = validation.data
    const { id } = await params

    // Find request
    const vacationRequest = await prisma.vacationRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    if (!vacationRequest) {
      return NextResponse.json(
        { error: "Urlaubsantrag nicht gefunden" },
        { status: 404 }
      )
    }

    if (vacationRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Dieser Antrag wurde bereits bearbeitet" },
        { status: 400 }
      )
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED"

    // Update request status
    const updatedRequest = await prisma.vacationRequest.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBy: session.user.id,
        approvedAt: new Date()
      },
      include: {
        employee: {
          select: {
            name: true
          }
        },
        approver: {
          select: {
            name: true
          }
        }
      }
    })

    // If APPROVED: Create timesheet entries + update quota
    if (action === "APPROVE") {
      const days = eachDayOfInterval({
        start: parseISO(vacationRequest.startDate.toISOString()),
        end: parseISO(vacationRequest.endDate.toISOString())
      })

      // Create timesheet entries with absenceType VACATION
      const timesheetPromises = days.map((day) => {
        const month = day.getMonth() + 1
        const year = day.getFullYear()

        return prisma.timesheet.upsert({
          where: {
            employeeId_date: {
              employeeId: vacationRequest.employeeId,
              date: startOfDay(day)
            }
          },
          create: {
            employeeId: vacationRequest.employeeId,
            date: startOfDay(day),
            month,
            year,
            absenceType: "VACATION",
            status: "CONFIRMED",
            plannedStart: null,
            plannedEnd: null,
            actualStart: null,
            actualEnd: null,
            breakMinutes: 0
          },
          update: {
            absenceType: "VACATION",
            status: "CONFIRMED"
          }
        })
      })

      await Promise.all(timesheetPromises)

      // Update vacation quota
      const currentYear = new Date().getFullYear()
      const usedDays = days.length

      await prisma.vacationQuota.upsert({
        where: {
          employeeId_year: {
            employeeId: vacationRequest.employeeId,
            year: currentYear
          }
        },
        create: {
          employeeId: vacationRequest.employeeId,
          year: currentYear,
          totalDays: 30,
          usedDays: usedDays
        },
        update: {
          usedDays: {
            increment: usedDays
          }
        }
      })

      // Create activity log
      await prisma.activityLog.create({
        data: {
          type: "SUCCESS",
          category: "VACATION",
          action: "Urlaubsantrag genehmigt",
          details: JSON.stringify({
            employeeId: vacationRequest.employeeId,
            employeeName: vacationRequest.employee.name,
            startDate: vacationRequest.startDate,
            endDate: vacationRequest.endDate,
            days: usedDays
          }),
          userId: session.user.id,
          userName: session.user.name || "Admin",
          entityId: vacationRequest.id,
          entityType: "VacationRequest"
        }
      })
    } else {
      // Create activity log for rejection
      await prisma.activityLog.create({
        data: {
          type: "WARNING",
          category: "VACATION",
          action: "Urlaubsantrag abgelehnt",
          details: JSON.stringify({
            employeeId: vacationRequest.employeeId,
            employeeName: vacationRequest.employee.name,
            startDate: vacationRequest.startDate,
            endDate: vacationRequest.endDate
          }),
          userId: session.user.id,
          userName: session.user.name || "Admin",
          entityId: vacationRequest.id,
          entityType: "VacationRequest"
        }
      })
    }

    return NextResponse.json(updatedRequest)
  } catch (error) {
    console.error("PUT /api/admin/vacation-requests/[id] error:", error)
    return NextResponse.json(
      { error: "Fehler beim Bearbeiten des Urlaubsantrags" },
      { status: 500 }
    )
  }
}
