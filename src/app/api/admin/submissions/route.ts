import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { ALL_TIMESHEET_STATUSES } from "@/lib/constants"

/**
 * Helper: Extract teamName from generated sheetFileName (if applicable)
 * Handles various formats:
 * - "Team_Jana_Scheuer_2026" → "Team Jana Scheuer"
 * - "Team_Team_Jana_Scheuer_2026" → "Team Jana Scheuer"
 * - "Team_Team_Jana_Scheuer_2026_2026" → "Team Jana Scheuer"
 */
function extractTeamNameFromSheetFileName(sheetFileName: string): string | null {
    let cleaned = sheetFileName

    // Remove duplicate "Team_Team" prefix
    if (cleaned.startsWith("Team_Team_")) {
        cleaned = cleaned.replace("Team_Team_", "Team_")
    }

    // Replace underscores with spaces
    cleaned = cleaned.replace(/_/g, " ")

    // Remove year suffix (e.g., " 2026" or " 2026 2026")
    cleaned = cleaned.replace(/\s+\d{4}(\s+\d{4})?$/g, "")

    // Check if starts with "Team "
    if (cleaned.toLowerCase().startsWith("team ")) {
        return cleaned
    }

    return null
}

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
 *
 * OPTIMIZED: Uses batch-loading pattern to avoid N+1 queries
 * - Single batch query for all timesheets across all submissions
 * - In-memory grouping by sheetFileName
 * - Reduces 100+ queries to 4-5 queries total
 */
export async function GET(req: NextRequest) {
    const startTime = performance.now()

    try {
        const result = await requireAdmin()
        if (result instanceof NextResponse) return result
        const session = result

        const { searchParams } = new URL(req.url)
        const filterMonth = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null
        const filterYear = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null

        const currentDate = new Date()
        const targetMonth = filterMonth || currentDate.getMonth() + 1
        const targetYear = filterYear || currentDate.getFullYear()

        // Parallele Abfragen für bessere Performance
        const [teamSubmissions, allConfigs, allTimesheetsForMonth, allTeamsWithClients] = await Promise.all([
            // 1. Existing TeamSubmissions - ONLY for target month/year
            prisma.teamSubmission.findMany({
                where: {
                    month: targetMonth,
                    year: targetYear
                },
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
                    status: { in: [...ALL_TIMESHEET_STATUSES] }
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
            }),
            // 4. All Teams with Clients (for pending dienstplaene without timesheets)
            prisma.team.findMany({
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
            })
        ])

        // ========== BATCH-LOADING: Collect all unique sheetFileName/month/year combinations ==========
        // This replaces the N+1 calls to getAllEmployeesInDienstplan()

        // Collect all sheetFileNames from teamSubmissions (across all months/years)
        const submissionKeys = teamSubmissions.map(s => ({
            sheetFileName: s.sheetFileName,
            month: s.month,
            year: s.year
        }))

        // Also collect from pending configs for target month
        const submittedSheetFileNames = new Set(
            teamSubmissions
                .filter(s => s.month === targetMonth && s.year === targetYear)
                .map(s => s.sheetFileName)
        )

        const pendingConfigKeys = allConfigs
            .filter(config => !submittedSheetFileNames.has(config.sheetFileName))
            .map(config => ({
                sheetFileName: config.sheetFileName,
                month: targetMonth,
                year: targetYear
            }))

        // Combine all keys and deduplicate
        const allKeys = [...submissionKeys, ...pendingConfigKeys]
        const uniqueKeySet = new Map<string, { sheetFileName: string; month: number; year: number }>()
        for (const key of allKeys) {
            const keyString = `${key.sheetFileName}|${key.month}|${key.year}`
            if (!uniqueKeySet.has(keyString)) {
                uniqueKeySet.set(keyString, key)
            }
        }

        // Build OR conditions for batch query
        const uniqueKeys = Array.from(uniqueKeySet.values())

        // Single batch query: Get all timesheets for all submissions at once
        let batchedTimesheets: Array<{
            sheetFileName: string | null
            month: number
            year: number
            employeeId: string
            teamId: string | null
            employee: { id: string; name: string | null; email: string } | null
            team: {
                id: string
                name: string
                client: { id: string; firstName: string; lastName: string; email: string | null } | null
            } | null
        }> = []

        if (uniqueKeys.length > 0) {
            // For performance, we query by month/year ranges and filter in memory
            // This avoids massive OR conditions
            const monthYearCombos = new Map<string, { month: number; year: number }>()
            for (const key of uniqueKeys) {
                const combo = `${key.month}|${key.year}`
                if (!monthYearCombos.has(combo)) {
                    monthYearCombos.set(combo, { month: key.month, year: key.year })
                }
            }

            // Query all timesheets for all month/year combinations
            const orConditions = Array.from(monthYearCombos.values()).map(combo => ({
                month: combo.month,
                year: combo.year
            }))

            batchedTimesheets = await prisma.timesheet.findMany({
                where: {
                    OR: orConditions
                },
                select: {
                    sheetFileName: true,
                    month: true,
                    year: true,
                    employeeId: true,
                    teamId: true,
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    },
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

        // ========== GROUP TIMESHEETS BY sheetFileName/month/year ==========
        // Map key: "sheetFileName|month|year" -> employees Map + client info + count
        const timesheetsByKey = new Map<string, {
            employees: Map<string, { id: string; name: string | null; email: string }>
            client: { id: string; firstName: string; lastName: string; email: string | null } | null
            count: number
        }>()

        // Also track teams by name for legacy sheetFileName fallback
        const teamsByName = new Map<string, string>() // teamName -> teamId

        for (const ts of batchedTimesheets) {
            // Track teams for fallback
            if (ts.team) {
                teamsByName.set(ts.team.name.toLowerCase(), ts.team.id)
            }

            // Skip if no sheetFileName (will handle in fallback)
            if (!ts.sheetFileName) continue

            const key = `${ts.sheetFileName}|${ts.month}|${ts.year}`

            let entry = timesheetsByKey.get(key)
            if (!entry) {
                entry = {
                    employees: new Map(),
                    client: null,
                    count: 0
                }
                timesheetsByKey.set(key, entry)
            }

            // Add employee (deduplicated by Map key)
            if (ts.employee) {
                entry.employees.set(ts.employee.id, {
                    id: ts.employee.id,
                    name: ts.employee.name,
                    email: ts.employee.email
                })
            }

            // Track first client found
            if (!entry.client && ts.team?.client) {
                entry.client = ts.team.client
            }

            entry.count++
        }

        // ========== FALLBACK: Handle legacy "Team_*_Year" sheetFileNames ==========
        // For sheetFileNames that have no timesheets, check if they're generated team names
        for (const key of uniqueKeys) {
            const mapKey = `${key.sheetFileName}|${key.month}|${key.year}`
            if (!timesheetsByKey.has(mapKey) || timesheetsByKey.get(mapKey)!.employees.size === 0) {
                const teamName = extractTeamNameFromSheetFileName(key.sheetFileName)
                if (teamName) {
                    // Find matching team
                    const teamId = teamsByName.get(teamName.toLowerCase())
                    if (teamId) {
                        // Look for legacy timesheets with this teamId and null sheetFileName
                        const legacyTimesheets = batchedTimesheets.filter(
                            ts => ts.teamId === teamId &&
                                  ts.month === key.month &&
                                  ts.year === key.year &&
                                  !ts.sheetFileName
                        )

                        if (legacyTimesheets.length > 0) {
                            const entry = {
                                employees: new Map<string, { id: string; name: string | null; email: string }>(),
                                client: null as { id: string; firstName: string; lastName: string; email: string | null } | null,
                                count: 0
                            }

                            for (const ts of legacyTimesheets) {
                                if (ts.employee) {
                                    entry.employees.set(ts.employee.id, {
                                        id: ts.employee.id,
                                        name: ts.employee.name,
                                        email: ts.employee.email
                                    })
                                }
                                if (!entry.client && ts.team?.client) {
                                    entry.client = ts.team.client
                                }
                                entry.count++
                            }

                            timesheetsByKey.set(mapKey, entry)
                        }
                    }
                }
            }
        }

        // ========== BUILD TEAM-CLIENT MAP (for pending dienstplaene without timesheets) ==========
        const teamClientMap = new Map<string, { id: string; firstName: string; lastName: string; email: string | null }>()
        for (const team of allTeamsWithClients) {
            if (team.client) {
                // Map team name (normalized) to client
                const normalizedTeamName = team.name.toLowerCase().trim()
                teamClientMap.set(normalizedTeamName, team.client)
            }
        }

        // ========== HELPER: Get employees for a sheetFileName/month/year ==========
        const getEmployeesForKey = (sheetFileName: string, month: number, year: number): Array<{ id: string; name: string | null; email: string }> => {
            const key = `${sheetFileName}|${month}|${year}`
            const entry = timesheetsByKey.get(key)
            if (!entry) return []
            return Array.from(entry.employees.values()).sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', 'de')
            )
        }

        const getClientForKey = (sheetFileName: string, month: number, year: number): { id: string; firstName: string; lastName: string; email: string | null } | null => {
            const key = `${sheetFileName}|${month}|${year}`
            const entry = timesheetsByKey.get(key)
            if (entry?.client) {
                return entry.client
            }

            // FALLBACK: Try to extract team name from sheetFileName and find client in teamClientMap
            // Format: "Team_Jana_Scheuer_2026" or "Team_Team_Jana_Scheuer_2026_2026"
            const teamName = extractTeamNameFromSheetFileName(sheetFileName)
            if (teamName) {
                const normalizedTeamName = teamName.toLowerCase().trim()
                const client = teamClientMap.get(normalizedTeamName)
                if (client) {
                    return client
                }
            }

            return null
        }

        const getTimesheetCountForKey = (sheetFileName: string, month: number, year: number): number => {
            const key = `${sheetFileName}|${month}|${year}`
            const entry = timesheetsByKey.get(key)
            return entry?.count || 0
        }

        // ========== BUILD SUBMISSIONS RESPONSE (no more N+1!) ==========
        const submissionsWithProgress = teamSubmissions.map((submission) => {
            const allEmployees = getEmployeesForKey(
                submission.sheetFileName,
                submission.month,
                submission.year
            )

            // Resolve client: prefer submission.client, fallback to timesheet-based lookup
            const resolvedClient = submission.client
                ? {
                    id: submission.client.id,
                    firstName: submission.client.firstName,
                    lastName: submission.client.lastName,
                    email: submission.client.email
                }
                : getClientForKey(submission.sheetFileName, submission.month, submission.year)

            // Get recipient info from dienstplanConfig or resolved client
            const recipientEmail = submission.dienstplanConfig?.assistantRecipientEmail || resolvedClient?.email || null
            const recipientName = submission.dienstplanConfig?.assistantRecipientName ||
                (resolvedClient ? `${resolvedClient.firstName} ${resolvedClient.lastName}` : null)

            // Use resolved clientId from client relation or timesheet fallback
            const resolvedClientId = resolvedClient?.id || submission.clientId

            return {
                id: submission.id,
                sheetFileName: submission.sheetFileName,
                employeeNames: allEmployees.map(emp => emp.name).filter(Boolean), // Array of employee names
                month: submission.month,
                year: submission.year,
                status: submission.status,
                createdAt: submission.createdAt,
                updatedAt: submission.updatedAt,
                clientId: resolvedClientId,
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
                client: resolvedClient
            }
        })

        // ========== BUILD PENDING DIENSTPLAENE (no more N+1!) ==========
        const pendingDienstplaene = allConfigs
            .filter(config => !submittedSheetFileNames.has(config.sheetFileName))
            .map((config) => {
                // Get employee count for this Dienstplan (from pre-loaded data)
                const allEmployees = getEmployeesForKey(
                    config.sheetFileName,
                    targetMonth,
                    targetYear
                )

                // Get client info (from pre-loaded data)
                const client = getClientForKey(config.sheetFileName, targetMonth, targetYear)
                const timesheetCount = getTimesheetCountForKey(config.sheetFileName, targetMonth, targetYear)

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
                    client: client ? {
                        id: client.id,
                        firstName: client.firstName,
                        lastName: client.lastName,
                        email: client.email
                    } : null,
                    clientId: client?.id || null,
                    timesheetCount
                }
            })

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

        const duration = Math.round(performance.now() - startTime)
        console.log(`[API] GET /api/admin/submissions - ${duration}ms (${submissionsWithProgress.length} submissions, ${allPendingDienstplaene.length} pending)`)

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

/**
 * DELETE /api/admin/submissions?id=<submissionId>
 * Delete a team submission including all employee signatures
 */
export async function DELETE(req: NextRequest) {
    try {
        const result = await requireAdmin()
        if (result instanceof NextResponse) return result
        const session = result

        const { searchParams } = new URL(req.url)
        const submissionId = searchParams.get("id")

        if (!submissionId) {
            return NextResponse.json({ error: "Submission ID required" }, { status: 400 })
        }

        // Check if submission exists
        const submission = await prisma.teamSubmission.findUnique({
            where: { id: submissionId },
            include: {
                employeeSignatures: true
            }
        })

        if (!submission) {
            return NextResponse.json({ error: "Submission not found" }, { status: 404 })
        }

        // Delete all employee signatures first (cascade delete)
        await prisma.employeeSignature.deleteMany({
            where: { teamSubmissionId: submissionId }
        })

        // Delete the team submission
        await prisma.teamSubmission.delete({
            where: { id: submissionId }
        })

        return NextResponse.json({
            success: true,
            message: `Submission ${submission.sheetFileName} gelöscht`
        })
    } catch (error: any) {
        console.error("[DELETE /api/admin/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
