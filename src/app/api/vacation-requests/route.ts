import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"
import { startOfDay, endOfDay, parseISO, eachDayOfInterval } from "date-fns"

const createRequestSchema = z.object({
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Ungültiges Startdatum"
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Ungültiges Enddatum"
  }),
  reason: z.string().nullable().optional()
})

// GET - Load own vacation requests + quota
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const currentYear = new Date().getFullYear()

    // Load requests with approver info
    const requests = await prisma.vacationRequest.findMany({
      where: {
        employeeId: session.user.id
      },
      include: {
        approver: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        startDate: "desc"
      }
    })

    // Load or create quota for current year
    let quota = await prisma.vacationQuota.findUnique({
      where: {
        employeeId_year: {
          employeeId: session.user.id,
          year: currentYear
        }
      }
    })

    if (!quota) {
      // Create default quota (30 days per year)
      quota = await prisma.vacationQuota.create({
        data: {
          employeeId: session.user.id,
          year: currentYear,
          totalDays: 30,
          usedDays: 0
        }
      })
    }

    return NextResponse.json({
      requests,
      quota
    })
  } catch (error) {
    console.error("GET /api/vacation-requests error:", error)
    return NextResponse.json(
      { error: "Fehler beim Laden der Urlaubsdaten" },
      { status: 500 }
    )
  }
}

// POST - Create new vacation request
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const body = await request.json()
    const validation = createRequestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: "Ungültige Daten", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { startDate, endDate, reason } = validation.data

    const start = parseISO(startDate)
    const end = parseISO(endDate)

    // Validation: end >= start
    if (end < start) {
      return NextResponse.json(
        { error: "Enddatum muss nach dem Startdatum liegen" },
        { status: 400 }
      )
    }

    // Check for overlapping requests
    const overlappingRequests = await prisma.vacationRequest.findMany({
      where: {
        employeeId: session.user.id,
        status: {
          in: ["PENDING", "APPROVED"]
        },
        OR: [
          // New request starts during existing request
          {
            AND: [
              { startDate: { lte: start } },
              { endDate: { gte: start } }
            ]
          },
          // New request ends during existing request
          {
            AND: [
              { startDate: { lte: end } },
              { endDate: { gte: end } }
            ]
          },
          // New request completely contains existing request
          {
            AND: [
              { startDate: { gte: start } },
              { endDate: { lte: end } }
            ]
          }
        ]
      }
    })

    if (overlappingRequests.length > 0) {
      return NextResponse.json(
        { error: "Es existiert bereits ein Urlaubsantrag für diesen Zeitraum" },
        { status: 400 }
      )
    }

    // Create request
    const vacationRequest = await prisma.vacationRequest.create({
      data: {
        employeeId: session.user.id,
        startDate: startOfDay(start),
        endDate: endOfDay(end),
        reason: reason || null,
        status: "PENDING"
      },
      include: {
        approver: {
          select: {
            name: true
          }
        }
      }
    })

    return NextResponse.json(vacationRequest, { status: 201 })
  } catch (error) {
    console.error("POST /api/vacation-requests error:", error)
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Urlaubsantrags" },
      { status: 500 }
    )
  }
}
