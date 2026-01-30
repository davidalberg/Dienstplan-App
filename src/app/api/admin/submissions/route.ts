import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getAllEmployeesInDienstplan } from "@/lib/team-submission-utils"

/**
 * GET /api/admin/submissions
 * Get all team submissions with employee signature progress
 *
 * EXTENDED: Returns ALL expected timesheets, not just submitted ones:
 * - submissions: Existing TeamSubmissions (status: PENDING_EMPLOYEES, PENDING_RECIPIENT, COMPLETED)
 * - pendingDienstplaene: Teams/clients with timesheets but NO submission yet (status: NOT_STARTED)
 *
 * Sources for pendingDienstplaene:
 * 1. DienstplanConfig entries without a submission for the target month
 * 2. Teams/clients that have timesheets in the month but no DienstplanConfig or submission
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const filterMonth = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null
        const filterYear = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null

        const currentDate = new Date()
        const targetMonth = filterMonth || currentDate.getMonth() + 1
        const targetYear = filterYear || currentDate.getFullYear()

        // Parallele Abfragen für bessere Performance
        const [teamSubmissions, allConfigs, allTimesheetsForMonth] = await Promise.all([
            // 1. Existing TeamSubmissions
            prisma.teamSubmission.findMany({
                orderBy: [
                    { year: "desc" },
                    { month: "desc" },
                    { createdAt: "desc" }
                ],
                include: {
                    dienstplanConfig: true,
                    client: true,
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
            }),
            // 2. DienstplanConfigs
            prisma.dienstplanConfig.findMany({
                orderBy: { sheetFileName: "asc" }
            }),
            // 3. NEW: All timesheets for target month (to find clients without submissions)
            prisma.timesheet.findMany({
                where: {
                    month: targetMonth,
                    year: targetYear,
                    status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
                },
                select: {
                    id: true,
                    employeeId: true,
                    teamId: true,
                    sheetFileName: true,
                    team: {
                        select: {
                            id: true,
                            name: true,
                            clientId: true,
                            client: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    email: true
                                }
                            }
                        }
                    },
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            clients: {
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
        ])

        // For each submission, get total employee count
        const submissionsWithProgress = await Promise.all(
            teamSubmissions.map(async (submission) => {
                const allEmployees = await getAllEmployeesInDienstplan(
                    submission.sheetFileName,
                    submission.month,
                    submission.year
                )

                // Get recipient info from dienstplanConfig or client
                const recipientEmail = submission.dienstplanConfig?.assistantRecipientEmail || submission.client?.email || null
                const recipientName = submission.dienstplanConfig?.assistantRecipientName ||
                    (submission.client ? `${submission.client.firstName} ${submission.client.lastName}` : null)

                return {
                    id: submission.id,
                    sheetFileName: submission.sheetFileName,
                    employeeNames: allEmployees.map(emp => emp.name).filter(Boolean), // Array of employee names
                    month: submission.month,
                    year: submission.year,
                    status: submission.status,
                    createdAt: submission.createdAt,
                    updatedAt: submission.updatedAt,
                    recipientEmail,
                    recipientName,
                    recipientSignedAt: submission.recipientSignedAt,
                    manuallyReleasedAt: submission.manuallyReleasedAt,
                    manuallyReleasedBy: submission.manuallyReleasedBy,
                    releaseNote: submission.releaseNote,
                    pdfUrl: submission.pdfUrl,
                    totalEmployees: allEmployees.length,
                    signedEmployees: submission.employeeSignatures.length,
                    employeeSignatures: submission.employeeSignatures.map(sig => ({
                        employeeId: sig.employeeId,
                        employeeName: sig.employee.name,
                        employeeEmail: sig.employee.email,
                        signedAt: sig.signedAt
                    })),
                    client: submission.client ? {
                        id: submission.client.id,
                        firstName: submission.client.firstName,
                        lastName: submission.client.lastName,
                        email: submission.client.email
                    } : null,
                    clientId: submission.clientId
                }
            })
        )

        // Find configs that don't have a TeamSubmission for the target month/year
        const submittedSheetFileNames = new Set(
            teamSubmissions
                .filter(s => s.month === targetMonth && s.year === targetYear)
                .map(s => s.sheetFileName)
        )

        const pendingDienstplaene = await Promise.all(
            allConfigs
                .filter(config => !submittedSheetFileNames.has(config.sheetFileName))
                .map(async (config) => {
                    // Get employee count for this Dienstplan
                    const allEmployees = await getAllEmployeesInDienstplan(
                        config.sheetFileName,
                        targetMonth,
                        targetYear
                    )

                    // Get client info from timesheets in this Dienstplan
                    let client = null
                    let clientId = null
                    let timesheetCount = 0

                    if (allEmployees.length > 0) {
                        // Get first employee's team -> client
                        const employee = await prisma.user.findUnique({
                            where: { id: allEmployees[0].id },
                            include: {
                                team: {
                                    include: {
                                        client: true
                                    }
                                }
                            }
                        })

                        if (employee?.team?.client) {
                            client = {
                                id: employee.team.client.id,
                                firstName: employee.team.client.firstName,
                                lastName: employee.team.client.lastName,
                                email: employee.team.client.email
                            }
                            clientId = employee.team.client.id
                        }

                        // Count timesheets for this Dienstplan
                        timesheetCount = await prisma.timesheet.count({
                            where: {
                                sheetFileName: config.sheetFileName,
                                month: targetMonth,
                                year: targetYear
                            }
                        })
                    }

                    return {
                        id: null, // No submission yet
                        sheetFileName: config.sheetFileName,
                        employeeNames: allEmployees.map(emp => emp.name).filter(Boolean), // Array of employee names
                        month: targetMonth,
                        year: targetYear,
                        status: "NOT_STARTED",
                        recipientEmail: config.assistantRecipientEmail,
                        recipientName: config.assistantRecipientName,
                        totalEmployees: allEmployees.length,
                        signedEmployees: 0,
                        employeeSignatures: [],
                        client,
                        clientId,
                        timesheetCount
                    }
                })
        )

        // Filter out Dienstpläne with 0 employees (no timesheets for this month)
        const pendingFromConfigs = pendingDienstplaene.filter(d => d.totalEmployees > 0)

        // ========== PART 2B: Find clients with timesheets but NO DienstplanConfig and NO submission ==========
        // Get all sheetFileNames and clientIds that already have submissions for target month/year
        const submittedClientIds = new Set(
            teamSubmissions
                .filter(s => s.month === targetMonth && s.year === targetYear && s.clientId)
                .map(s => s.clientId!)
        )

        // Set of sheetFileNames covered by DienstplanConfig
        const configSheetFileNames = new Set(allConfigs.map(c => c.sheetFileName))

        // Group timesheets by clientId (derived from team or employee-client relation)
        const timesheetsByClient = new Map<string, {
            client: { id: string; firstName: string; lastName: string; email: string | null };
            employees: Map<string, { id: string; name: string | null; email: string }>;
            timesheetCount: number;
            sheetFileNames: Set<string>;
        }>()

        for (const ts of allTimesheetsForMonth) {
            // Determine client for this timesheet
            let clientInfo: { id: string; firstName: string; lastName: string; email: string | null } | null = null

            // Priority 1: Team -> Client relation
            if (ts.team?.client) {
                clientInfo = ts.team.client
            }
            // Priority 2: Employee -> Clients (many-to-many)
            else if (ts.employee?.clients && ts.employee.clients.length > 0) {
                clientInfo = ts.employee.clients[0] // Use first client if multiple
            }

            if (!clientInfo) continue // Skip timesheets without client association

            // Skip if this client already has a submission
            if (submittedClientIds.has(clientInfo.id)) continue

            // Skip if the sheetFileName already has a submission
            if (ts.sheetFileName && submittedSheetFileNames.has(ts.sheetFileName)) continue

            // Skip if the sheetFileName is already covered by a DienstplanConfig
            if (ts.sheetFileName && configSheetFileNames.has(ts.sheetFileName)) continue

            // Get or create client entry
            let clientEntry = timesheetsByClient.get(clientInfo.id)
            if (!clientEntry) {
                clientEntry = {
                    client: clientInfo,
                    employees: new Map(),
                    timesheetCount: 0,
                    sheetFileNames: new Set()
                }
                timesheetsByClient.set(clientInfo.id, clientEntry)
            }

            // Add employee
            if (ts.employee) {
                clientEntry.employees.set(ts.employee.id, {
                    id: ts.employee.id,
                    name: ts.employee.name,
                    email: ts.employee.email
                })
            }

            // Track timesheet count and sheetFileNames
            clientEntry.timesheetCount++
            if (ts.sheetFileName) {
                clientEntry.sheetFileNames.add(ts.sheetFileName)
            }
        }

        // Convert to pending entries
        const pendingFromTimesheets: Array<{
            id: null
            sheetFileName: string
            employeeNames: string[]
            month: number
            year: number
            status: "NOT_STARTED"
            recipientEmail: string | null
            recipientName: string | null
            totalEmployees: number
            signedEmployees: number
            employeeSignatures: Array<{
                employeeId: string
                employeeName: string | null
                employeeEmail: string
                signedAt: Date | null
            }>
            client: {
                id: string
                firstName: string
                lastName: string
                email: string | null
            } | null
            clientId: string | null
            timesheetCount: number
        }> = []

        for (const [, data] of timesheetsByClient) {
            if (data.employees.size > 0) {
                const employeeArray = Array.from(data.employees.values())
                const sheetFileName = data.sheetFileNames.size > 0
                    ? Array.from(data.sheetFileNames)[0]
                    : `Team_${data.client.lastName}_${data.client.firstName}_${targetYear}`

                pendingFromTimesheets.push({
                    id: null,
                    sheetFileName: sheetFileName || `Team_${data.client.lastName}_${targetYear}`,
                    employeeNames: employeeArray.map(emp => emp.name).filter(Boolean) as string[],
                    month: targetMonth,
                    year: targetYear,
                    status: "NOT_STARTED" as const,
                    recipientEmail: data.client.email || null,
                    recipientName: `${data.client.firstName} ${data.client.lastName}`,
                    totalEmployees: employeeArray.length,
                    signedEmployees: 0,
                    employeeSignatures: [] as { employeeId: string; employeeName: string | null; employeeEmail: string; signedAt: Date | null }[],
                    client: {
                        id: data.client.id,
                        firstName: data.client.firstName,
                        lastName: data.client.lastName,
                        email: data.client.email
                    },
                    clientId: data.client.id,
                    timesheetCount: data.timesheetCount
                })
            }
        }

        // ========== PART 3: Combine and sort pending Dienstplaene ==========
        const allPendingDienstplaene = [...pendingFromConfigs, ...pendingFromTimesheets]

        // Sort by client name (lastName, firstName) or sheetFileName
        allPendingDienstplaene.sort((a, b) => {
            const nameA = a.client
                ? `${a.client.lastName} ${a.client.firstName}`
                : a.recipientName || a.sheetFileName
            const nameB = b.client
                ? `${b.client.lastName} ${b.client.firstName}`
                : b.recipientName || b.sheetFileName
            return nameA.localeCompare(nameB, 'de')
        })

        return NextResponse.json({
            submissions: submissionsWithProgress,
            pendingDienstplaene: allPendingDienstplaene,
            targetMonth,
            targetYear
        })
    } catch (error: any) {
        console.error("[GET /api/admin/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
