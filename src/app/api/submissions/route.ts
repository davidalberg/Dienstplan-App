import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"

/**
 * GET /api/submissions
 * Get submission status for a month
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const user = session.user as any
        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") || "")
        const year = parseInt(searchParams.get("year") || "")

        if (isNaN(month) || isNaN(year)) {
            return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
        }

        const submission = await prisma.monthlySubmission.findUnique({
            where: {
                employeeId_month_year: {
                    employeeId: user.id,
                    month,
                    year
                }
            },
            include: {
                team: {
                    select: {
                        name: true,
                        assistantRecipientEmail: true,
                        assistantRecipientName: true
                    }
                }
            }
        })

        return NextResponse.json({ submission })
    } catch (error: any) {
        console.error("[GET /api/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/submissions
 * Create a new submission (starts the signature process)
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const user = session.user as any
        if (user.role !== "EMPLOYEE") {
            return NextResponse.json({ error: "Only employees can submit timesheets" }, { status: 403 })
        }

        const body = await req.json()
        const { month, year } = body

        if (!month || !year) {
            return NextResponse.json({ error: "Month and year required" }, { status: 400 })
        }

        // Check if user has a team assigned
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        assistantRecipientEmail: true,
                        assistantRecipientName: true
                    }
                }
            }
        })

        if (!dbUser?.teamId || !dbUser.team) {
            return NextResponse.json({
                error: "Kein Team zugewiesen. Bitte kontaktieren Sie den Administrator."
            }, { status: 400 })
        }

        if (!dbUser.team.assistantRecipientEmail) {
            return NextResponse.json({
                error: "Keine Assistenznehmer-Email für dieses Team hinterlegt. Bitte kontaktieren Sie den Administrator."
            }, { status: 400 })
        }

        // Check if submission already exists
        const existingSubmission = await prisma.monthlySubmission.findUnique({
            where: {
                employeeId_month_year: {
                    employeeId: user.id,
                    month,
                    year
                }
            }
        })

        if (existingSubmission) {
            return NextResponse.json({
                error: "Für diesen Monat existiert bereits eine Einreichung",
                submission: existingSubmission
            }, { status: 409 })
        }

        // Check that all timesheets are confirmed
        const unconfirmedTimesheets = await prisma.timesheet.count({
            where: {
                employeeId: user.id,
                month,
                year,
                status: "PLANNED",
                plannedStart: { not: null }
            }
        })

        if (unconfirmedTimesheets > 0) {
            return NextResponse.json({
                error: `Es gibt noch ${unconfirmedTimesheets} unbestätigte Schichten. Bitte bestätigen Sie alle Schichten bevor Sie einreichen.`
            }, { status: 400 })
        }

        // Generate signature token (7 days validity)
        const signatureToken = uuidv4()
        const tokenExpiresAt = new Date()
        tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7)

        // Create submission
        const submission = await prisma.monthlySubmission.create({
            data: {
                month,
                year,
                employeeId: user.id,
                teamId: dbUser.teamId,
                signatureToken,
                tokenExpiresAt,
                status: "PENDING_EMPLOYEE"
            },
            include: {
                team: {
                    select: {
                        name: true,
                        assistantRecipientEmail: true,
                        assistantRecipientName: true
                    }
                }
            }
        })

        return NextResponse.json({
            submission,
            message: "Einreichung erstellt. Bitte unterschreiben Sie jetzt."
        })
    } catch (error: any) {
        console.error("[POST /api/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
