import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { randomBytes } from "crypto"
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
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") || "", 10)
        const year = parseInt(searchParams.get("year") || "", 10)

        if (isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2020 || year > 2100) {
            return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
        }

        // 1. Check for TeamSubmission (new multi-employee system)
        // FALLBACK: Suche zuerst nach sheetFileName, dann nach teamId (alte Struktur)
        let userTimesheet = await prisma.timesheet.findFirst({
            where: {
                employeeId: user.id,
                month,
                year,
                sheetFileName: { not: null }
            },
            select: {
                sheetFileName: true,
                teamId: true,
                team: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        })

        // FALLBACK: Wenn kein sheetFileName, suche nach teamId (alte Timesheets)
        if (!userTimesheet) {
            userTimesheet = await prisma.timesheet.findFirst({
                where: {
                    employeeId: user.id,
                    month,
                    year,
                    teamId: { not: null }
                },
                select: {
                    sheetFileName: true,
                    teamId: true,
                    team: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            })
        }

        // Generiere sheetFileName on-the-fly fuer alte Daten (nur in GET fuer Lookup)
        let sheetFileName = userTimesheet?.sheetFileName
        if (!sheetFileName && userTimesheet?.team) {
            sheetFileName = `Team_${userTimesheet.team.name.replace(/\s+/g, '_')}_${year}`
        }

        if (sheetFileName) {
            // Look for TeamSubmission
            const teamSubmission = await prisma.teamSubmission.findUnique({
                where: {
                    sheetFileName_month_year: {
                        sheetFileName,
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
                    sheetFileName,
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
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult
        if (user.role !== "EMPLOYEE") {
            return NextResponse.json({ error: "Only employees can submit timesheets" }, { status: 403 })
        }

        const body = await req.json()
        const { month, year } = body
        if (!month || !year || month < 1 || month > 12 || year < 2020 || year > 2100) {
            return NextResponse.json({ error: "Month and year required" }, { status: 400 })
        }

        // 1. Get user's sheetFileName from their timesheets
        // FALLBACK: Suche zuerst nach sheetFileName, dann nach teamId (alte Struktur)
        let userTimesheet = await prisma.timesheet.findFirst({
            where: {
                employeeId: user.id,
                month,
                year,
                sheetFileName: { not: null }
            },
            select: {
                sheetFileName: true,
                teamId: true,
                team: {
                    select: {
                        id: true,
                        name: true,
                        client: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                }
            }
        })

        // FALLBACK: Wenn kein sheetFileName, suche nach teamId (alte Timesheets)
        if (!userTimesheet) {
            userTimesheet = await prisma.timesheet.findFirst({
                where: {
                    employeeId: user.id,
                    month,
                    year,
                    teamId: { not: null }
                },
                select: {
                    sheetFileName: true,
                    teamId: true,
                    team: {
                        select: {
                            id: true,
                            name: true,
                            client: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            })
        }

        // Variable fuer sheetFileName - wird entweder aus Timesheet oder generiert
        let sheetFileName: string
        let dienstplanConfig: any

        if (!userTimesheet) {

            // Versuche Team/Client des Users zu finden
            const employee = await prisma.user.findUnique({
                where: { id: user.id },
                include: {
                    team: {
                        include: { client: true }
                    },
                    clients: { take: 1, where: { isActive: true } }
                }
            })

            if (!employee?.team && (!employee?.clients || employee.clients.length === 0)) {
                // Wirklich KEINE Zuordnung vorhanden
                return NextResponse.json({
                    error: "Sie sind keinem Team oder Klienten zugeordnet. Bitte kontaktieren Sie den Administrator."
                }, { status: 400 })
            }

            // Generiere sheetFileName aus Team oder Client
            const client = employee.team?.client || employee.clients?.[0]
            // Client hat firstName/lastName, Team hat name
            const teamName = employee.team?.name || (client ? `${client.firstName} ${client.lastName}`.trim() : "Unbekannt")
            sheetFileName = `Team_${teamName.replace(/\s+/g, '_')}_${year}`

            // Erstelle DienstplanConfig falls nicht existiert
            dienstplanConfig = await prisma.dienstplanConfig.findUnique({
                where: { sheetFileName }
            })

            if (!dienstplanConfig) {
                const clientEmail = client?.email || "noreply@example.com"
                const clientName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : teamName

                dienstplanConfig = await prisma.dienstplanConfig.create({
                    data: {
                        sheetFileName,
                        assistantRecipientEmail: clientEmail,
                        assistantRecipientName: clientName
                    }
                })
            }
        } else {
            // Normaler Flow: Timesheet existiert
            // Generiere sheetFileName on-the-fly wenn es fehlt (alte Timesheets)
            sheetFileName = userTimesheet.sheetFileName || ""
            const isLegacyTimesheet = !sheetFileName && userTimesheet.team

            if (isLegacyTimesheet && userTimesheet.team) {
                // Generiere einen eindeutigen sheetFileName aus Team-Name + Jahr
                sheetFileName = `Team_${userTimesheet.team.name.replace(/\s+/g, '_')}_${year}`
                // WICHTIG: Aktualisiere ALLE Timesheets dieses Teams/Monats mit dem generierten sheetFileName
                // damit getAllEmployeesInDienstplan korrekt funktioniert
                const updateResult = await prisma.timesheet.updateMany({
                    where: {
                        teamId: userTimesheet.team.id,
                        month,
                        year,
                        sheetFileName: null
                    },
                    data: {
                        sheetFileName
                    }
                })
            }

            if (!sheetFileName) {
                return NextResponse.json({
                    error: "Kein Dienstplan zugewiesen. Bitte kontaktieren Sie den Administrator."
                }, { status: 400 })
            }

            // 2. Check if DienstplanConfig exists, create if missing (for legacy data)
            dienstplanConfig = await prisma.dienstplanConfig.findUnique({
                where: { sheetFileName }
            })

            // FALLBACK: Erstelle DienstplanConfig automatisch fuer alte Daten
            if (!dienstplanConfig) {
                // Versuche Config-Daten aus Team oder Client zu ermitteln
                const team = userTimesheet.team
                const client = team?.client

                if (client) {
                    // Erstelle neue DienstplanConfig mit Client-Daten
                    dienstplanConfig = await prisma.dienstplanConfig.create({
                        data: {
                            sheetFileName,
                            assistantRecipientEmail: client.email || "konfiguration-erforderlich@example.com",
                            assistantRecipientName: `${client.firstName} ${client.lastName}`
                        }
                    })
                } else if (team) {
                    // Fallback: Nutze Team-Daten wenn kein Client
                    dienstplanConfig = await prisma.dienstplanConfig.create({
                        data: {
                            sheetFileName,
                            assistantRecipientEmail: "konfiguration-erforderlich@example.com",
                            assistantRecipientName: team.name
                        }
                    })
                } else {
                    return NextResponse.json({
                        error: `Der Dienstplan "${sheetFileName}" ist noch nicht konfiguriert. Bitte kontaktieren Sie den Administrator.`
                    }, { status: 400 })
                }
            }
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

        // 3. Check if user already signed BEFORE transaction (fast-fail)
        const existingSubmission = await prisma.teamSubmission.findUnique({
            where: {
                sheetFileName_month_year: {
                    sheetFileName,
                    month,
                    year
                }
            },
            include: {
                employeeSignatures: {
                    select: { employeeId: true }
                }
            }
        })

        if (existingSubmission) {
            const alreadySigned = existingSubmission.employeeSignatures.some(
                sig => sig.employeeId === user.id
            )

            if (alreadySigned) {
                // DEFENSIVE CHECK: Verify timesheets still exist before blocking resubmission
                const timesheetCount = await prisma.timesheet.count({
                    where: {
                        sheetFileName: existingSubmission.sheetFileName,
                        month: existingSubmission.month,
                        year: existingSubmission.year
                    }
                })

                if (timesheetCount === 0) {
                    // Timesheets were deleted - clean up orphaned submission
                    await prisma.teamSubmission.delete({
                        where: { id: existingSubmission.id }
                    })
                    // Continue with new submission creation below
                } else {
                    // Legitimate block: timesheets exist and user already signed
                    return NextResponse.json({
                        error: "Sie haben bereits für diesen Monat unterschrieben. Die Einreichung ist bereits aktiv."
                    }, { status: 400 })
                }
            }
        }

        // 4. Use transaction to prevent race condition between check and create
        const result = await prisma.$transaction(async (tx) => {
            // Re-check if TeamSubmission exists (inside transaction for consistency)
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

            // 5. If submission exists, return it (user hasn't signed yet - checked above)
            if (teamSubmission) {
                // Double-check inside transaction (race condition safety)
                const alreadySigned = teamSubmission.employeeSignatures.some(
                    sig => sig.employeeId === user.id
                )

                if (alreadySigned) {
                    // This should rarely happen (race condition between outer check and transaction)
                    return { alreadySigned: true, teamSubmission }
                }

                // User hasn't signed yet, return existing submission
                return { teamSubmission, isNew: false, alreadySigned: false }
            }

            // 6. Create new TeamSubmission (no duplicate possible due to unique constraint)
            const signatureToken = randomBytes(32).toString("hex")
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

            return { teamSubmission, isNew: true, alreadySigned: false }
        }, {
            isolationLevel: 'Serializable', // Highest isolation level for race condition safety
            maxWait: 5000,
            timeout: 10000
        }).catch((error) => {
            console.error("[POST /api/submissions] Transaction CATCH - error code:", error.code)
            console.error("[POST /api/submissions] Transaction CATCH - error message:", error.message)
            console.error("[POST /api/submissions] Transaction CATCH - full error:", error)

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
                }).then(teamSubmission => {
                    return { teamSubmission, isNew: false, alreadySigned: false }
                })
            }
            console.error("[POST /api/submissions] RE-THROWING error (not P2002)")
            throw error
        })

        // Handle race condition case where user signed between outer check and transaction
        if (result.alreadySigned) {
            return NextResponse.json({
                error: "Sie haben bereits für diesen Monat unterschrieben. Die Einreichung ist bereits aktiv."
            }, { status: 400 })
        }

        if (!result.teamSubmission) {
            return NextResponse.json({ error: "Failed to create or find submission" }, { status: 500 })
        }

        // 7. Get all employees in this Dienstplan
        const allEmployees = await getAllEmployeesInDienstplan(sheetFileName, month, year)
        const response = {
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
        }
        return NextResponse.json(response)
    } catch (error: any) {
        console.error("[POST /api/submissions] === OUTER CATCH BLOCK ===")
        console.error("[POST /api/submissions] Error name:", error?.name)
        console.error("[POST /api/submissions] Error message:", error?.message)
        console.error("[POST /api/submissions] Error code:", error?.code)
        console.error("[POST /api/submissions] Error stack:", error?.stack)
        console.error("[POST /api/submissions] Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2))

        // Return more specific error message for debugging
        const errorMessage = error?.message || "Internal server error"
        return NextResponse.json({
            error: "Interner Server-Fehler. Bitte versuchen Sie es erneut oder kontaktieren Sie den Administrator.",
            debug: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        }, { status: 500 })
    }
}
