import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET - Load all vacation requests (admin only)
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status") // "all", "PENDING", "APPROVED", "REJECTED"

    const whereClause: any = {}

    if (statusFilter && statusFilter !== "all") {
      whereClause.status = statusFilter
    }

    const requests = await prisma.vacationRequest.findMany({
      where: whereClause,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        approver: {
          select: {
            name: true
          }
        }
      },
      orderBy: [
        { status: "asc" }, // PENDING first
        { startDate: "asc" }
      ]
    })

    return NextResponse.json(requests)
  } catch (error) {
    console.error("GET /api/admin/vacation-requests error:", error)
    return NextResponse.json(
      { error: "Fehler beim Laden der Urlaubsanträge" },
      { status: 500 }
    )
  }
}
