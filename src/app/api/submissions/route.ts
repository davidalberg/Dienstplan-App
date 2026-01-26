import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"
import {
    getEmployeesInDienstplan,
    getAllEmployeesInDienstplan,
    getSignedEmployees,
    getPendingEmployees
} from "@/lib/team-submission-utils"

/**
 * GET /api/submissions
 * Get submission status for a month (supports both TeamSubmission and old MonthlySubmission)
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

        // 1. Check for TeamSubmission (new multi-employee system)
        // Get user's sheetFileName for this month
        const userTimesheet = await prisma.timesheet.findFirst({
            where: {
                employeeId: user.id,
                month,
                year,
                sheetFileName: { not: null }
            },
            select: { sheetFileName: true }
        })

        if (userTimesheet?.sheetFileName) {
            // Look for TeamSubmission
            const teamSubmission = await prisma.teamSubmission.findUnique({
                where: {
                    sheetFileName_month_year: {
                        sheetFileName: userTimesheet.sheetFileName,
                        month,
                        year
                    }
                },
                include: {
                    dienstplanConfig: true,
                    employeeSignatures: {
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            })

            if (teamSubmission) {
                // Get all employees in this Dienstplan
                const allEmployees = await getAllEmployeesInDienstplan(
                    userTimesheet.sheetFileName,
                    month,
                    year
                )

                // Check if current user has signed
                const currentUserSigned = teamSubmission.employeeSignatures.some(
                    sig => sig.employeeId === user.id
                )

                return NextResponse.json({
                    submission: teamSubmission,
                    isTeamSubmission: true,
                    allEmployees,
                    signedEmployees: teamSubmission.employeeSignatures.map(sig => ({
                        id: sig.employee.id,
                        name: sig.employee.name,
                        email: sig.employee.email,
                        signedAt: sig.signedAt
                    })),
                    currentUserSigned,
                    totalCount: allEmployees.length,
                    signedCount: teamSubmission.employeeSignatures.length
                })
            }
        }

        // 2. Fallback: Check for old MonthlySubmission (backward compatibility)
        const oldSubmission = await prisma.monthlySubmission.findUnique({
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

        if (oldSubmission) {
            return NextResponse.json({
                submission: oldSubmission,
                isTeamSubmission: false
            })
        }

        // No submission found
        return NextResponse.json({ submission: null })
    } catch (error: any) {
        console.error("[GET /api/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/submissions
 * Create a new team submission (starts the multi-employee signature process)
 * FIXES: Katharina Broll's "kein Team zugewiesen" error by using sheetFileName instead of teamId
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

        // 1. Get user's sheetFileName from their timesheets
        const userTimesheet = await prisma.timesheet.findFirst({
            where: {
                employeeId: user.id,
                month,
                year,
                sheetFileName: { not: null }
            },
            select: { sheetFileName: true }
        })

        if (!userTimesheet?.sheetFileName) {
            return NextResponse.json({
                error: "Kein Dienstplan zugewiesen. Bitte kontaktieren Sie den Administrator."
            }, { status: 400 })
        }

        const sheetFileName = userTimesheet.sheetFileName

        // 2. Check if DienstplanConfig exists (REPLACES old Team check)
        const dienstplanConfig = await prisma.dienstplanConfig.findUnique({
            where: { sheetFileName }
        })

        if (!dienstplanConfig) {
            return NextResponse.json({
                error: `Der Dienstplan "${sheetFileName}" ist noch nicht konfiguriert. Bitte kontaktieren Sie den Administrator.`
            }, { status: 400 })
        }

        // 5. Check that all user's timesheets are confirmed BEFORE any transaction
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

        // 3. Use transaction to prevent race condition between check and create
        const result = await prisma.$transaction(async (tx) => {
            // Check if TeamSubmission exists (inside transaction)
            let teamSubmission = await tx.teamSubmission.findUnique({
                where: {
                    sheetFileName_month_year: {
                        sheetFileName,
                        month,
                        year
                    }
                },
                include: {
                    employeeSignatures: {
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            })

            // 4. If submission exists, check if current user already signed
            if (teamSubmission) {
                const alreadySigned = teamSubmission.employeeSignatures.some(
                    sig => sig.employeeId === user.id
                )

                if (alreadySigned) {
                    throw new Error("ALREADY_SIGNED")
                }

                // User hasn't signed yet, return existing submission
                return { teamSubmission, isNew: false }
            }

            // 6. Create new TeamSubmission (no duplicate possible due to unique constraint)
            const signatureToken = uuidv4()
            const tokenExpiresAt = new Date()
            tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7)

            teamSubmission = await tx.teamSubmission.create({
                data: {
                    month,
                    year,
                    sheetFileName,
                    dienstplanConfigId: dienstplanConfig.id,
                    signatureToken,
                    tokenExpiresAt,
                    status: "PENDING_EMPLOYEES"
                },
                include: {
                    dienstplanConfig: true,
                    employeeSignatures: {
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            })

            return { teamSubmission, isNew: true }
        }, {
            isolationLevel: 'Serializable', // Highest isolation level for race condition safety
            maxWait: 5000,
            timeout: 10000
        }).catch((error) => {
            if (error.message === "ALREADY_SIGNED") {
                throw error // Re-throw to handle below
            }
            // Handle Prisma unique constraint violation
            if (error.code === 'P2002') {
                // Another user just created it, fetch and return
                return prisma.teamSubmission.findUnique({
                    where: {
                        sheetFileName_month_year: { sheetFileName, month, year }
                    },
                    include: {
                        employeeSignatures: {
                            include: {
                                employee: {
                                    select: { id: true, name: true, email: true }
                                }
                            }
                        }
                    }
                }).then(teamSubmission => ({ teamSubmission, isNew: false }))
            }
            throw error
        })

        if (!result.teamSubmission) {
            return NextResponse.json({ error: "Failed to create or find submission" }, { status: 500 })
        }

        // 7. Get all employees in this Dienstplan
        const allEmployees = await getAllEmployeesInDienstplan(sheetFileName, month, year)

        return NextResponse.json({
            submission: result.teamSubmission,
            allEmployees,
            signedEmployees: result.teamSubmission.employeeSignatures.map(sig => ({
                id: sig.employee.id,
                name: sig.employee.name,
                email: sig.employee.email,
                signedAt: sig.signedAt
            })),
            totalCount: allEmployees.length,
            signedCount: result.teamSubmission.employeeSignatures.length,
            message: result.isNew
                ? "Einreichung erstellt. Bitte unterschreiben Sie jetzt."
                : `${result.teamSubmission.employeeSignatures.length} von ${allEmployees.length} Mitarbeitern haben bereits unterschrieben.`
        })
    } catch (error: any) {
        console.error("[POST /api/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
