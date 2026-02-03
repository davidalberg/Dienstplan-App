import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { calculateMinutesBetween } from "@/lib/time-utils"
import { getEmployeesInDienstplan } from "@/lib/team-submission-utils"

/**
 * Zod Schema for query parameter validation
 * Validates all required parameters for combined timesheet data
 * clientId is now optional to support cases where it's missing
 */
const QueryParamsSchema = z.object({
    sheetFileName: z.string().min(1, "sheetFileName ist erforderlich"),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2030),
    clientId: z.string().optional().default("")
})

/**
 * Type definitions for response structure
 */
interface TimesheetResponse {
    id: string
    date: string
    formattedDate: string
    weekday: string
    plannedStart: string | null
    plannedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
    hours: number
    note: string | null
    absenceType: string | null
    status: string
}

interface EmployeeStats {
    totalHours: number
    sickDays: number
    vacationDays: number
    workDays: number
}

interface EmployeeData {
    id: string
    name: string
    email: string
    timesheets: TimesheetResponse[]
    stats: EmployeeStats
}

interface EmployeeSignatureData {
    employeeId: string
    employeeName: string
    signed: boolean
    signedAt: string | null
    signatureUrl: string | null
}

/**
 * GET /api/admin/timesheets/combined
 *
 * Returns combined timesheet data for all employees in a team/dienstplan.
 * Aggregates timesheets, statistics, and signature status.
 *
 * Query Parameters:
 * - sheetFileName: string (required) - e.g., "Team_Jana_Scheuer_2026"
 * - month: number (required) - 1-12
 * - year: number (required) - 2020-2030
 * - clientId: string (required) - CUID of the client
 */
export async function GET(req: NextRequest) {
    const startTime = performance.now()

    // Auth check: Require ADMIN role
    const session = await auth()
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url)
    const rawParams = {
        sheetFileName: searchParams.get("sheetFileName") || "",
        month: searchParams.get("month") || "",
        year: searchParams.get("year") || "",
        clientId: searchParams.get("clientId") || ""
    }

    const validationResult = QueryParamsSchema.safeParse(rawParams)
    if (!validationResult.success) {
        return NextResponse.json({
            error: "Ungueltige Parameter",
            details: validationResult.error.flatten()
        }, { status: 400 })
    }

    const { sheetFileName, month, year, clientId } = validationResult.data

    try {
        // Parallel fetch: Client data (if clientId provided), TeamSubmission, and employee IDs
        const [client, submission, employeeIds] = await Promise.all([
            // Fetch client data (only if clientId provided)
            clientId
                ? prisma.client.findUnique({
                    where: { id: clientId },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                })
                : Promise.resolve(null),
            // Fetch team submission with employee signatures
            prisma.teamSubmission.findUnique({
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
            }),
            // Get all employee IDs for this dienstplan
            getEmployeesInDienstplan(sheetFileName, month, year)
        ])

        // Client is now optional - log warning but don't block
        const clientMissing = !client && clientId
        if (clientMissing) {
            console.warn(`[GET /api/admin/timesheets/combined] Client not found for clientId: ${clientId}`)
        }

        // Check if any employees found
        if (employeeIds.length === 0) {
            return NextResponse.json({
                error: "Keine Mitarbeiter oder Schichten fuer diesen Dienstplan gefunden"
            }, { status: 404 })
        }

        // Fetch employee data and timesheets in parallel
        const [employees, allTimesheets] = await Promise.all([
            // Fetch all employees
            prisma.user.findMany({
                where: {
                    id: { in: employeeIds }
                },
                select: {
                    id: true,
                    name: true,
                    email: true
                },
                orderBy: {
                    name: "asc"
                }
            }),
            // Fetch all timesheets for this month/year/sheetFileName
            prisma.timesheet.findMany({
                where: {
                    sheetFileName,
                    month,
                    year,
                    status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
                },
                orderBy: { date: "asc" },
                select: {
                    id: true,
                    date: true,
                    plannedStart: true,
                    plannedEnd: true,
                    actualStart: true,
                    actualEnd: true,
                    note: true,
                    status: true,
                    absenceType: true,
                    employeeId: true
                }
            })
        ])

        // Group timesheets by employee
        const timesheetsByEmployee = new Map<string, typeof allTimesheets>()
        for (const ts of allTimesheets) {
            const existing = timesheetsByEmployee.get(ts.employeeId) || []
            existing.push(ts)
            timesheetsByEmployee.set(ts.employeeId, existing)
        }

        // Build employee data with calculated stats
        let totalHoursAllEmployees = 0
        const employeesData: EmployeeData[] = employees.map(employee => {
            const employeeTimesheets = timesheetsByEmployee.get(employee.id) || []

            // Calculate stats for this employee
            let totalMinutes = 0
            let sickDays = 0
            let vacationDays = 0
            let workDays = 0

            const processedTimesheets: TimesheetResponse[] = employeeTimesheets.map(ts => {
                const start = ts.actualStart || ts.plannedStart
                const end = ts.actualEnd || ts.plannedEnd
                let hours = 0

                // Calculate hours only for non-absence entries
                if (start && end && !ts.absenceType) {
                    const minutes = calculateMinutesBetween(start, end)
                    if (minutes !== null && minutes > 0) {
                        totalMinutes += minutes
                        hours = Math.round(minutes / 60 * 100) / 100
                        workDays++
                    }
                }

                // Count absence types
                if (ts.absenceType === "SICK") sickDays++
                if (ts.absenceType === "VACATION") vacationDays++

                // Format date for German locale
                const dateObj = new Date(ts.date)
                const weekday = dateObj.toLocaleDateString("de-DE", { weekday: "short" })
                const formattedDate = `${weekday}., ${dateObj.toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                })}`

                return {
                    id: ts.id,
                    date: ts.date.toISOString(),
                    formattedDate,
                    weekday,
                    plannedStart: ts.plannedStart,
                    plannedEnd: ts.plannedEnd,
                    actualStart: ts.actualStart,
                    actualEnd: ts.actualEnd,
                    hours,
                    note: ts.note,
                    absenceType: ts.absenceType,
                    status: ts.status
                }
            })

            const employeeTotalHours = Math.round(totalMinutes / 60 * 100) / 100
            totalHoursAllEmployees += employeeTotalHours

            return {
                id: employee.id,
                name: employee.name || "Unbekannt",
                email: employee.email,
                timesheets: processedTimesheets,
                stats: {
                    totalHours: employeeTotalHours,
                    sickDays,
                    vacationDays,
                    workDays
                }
            }
        })

        // Build flat timesheets array with employee info
        const flatTimesheets = employeesData.flatMap(employee =>
            employee.timesheets.map(ts => ({
                ...ts,
                employeeId: employee.id,
                employeeName: employee.name
            }))
        )

        // Build employee signature data
        const signatureMap = new Map<string, {
            signed: boolean
            signedAt: Date | null
            signature: string | null
        }>()

        // Map existing signatures from submission
        if (submission?.employeeSignatures) {
            for (const sig of submission.employeeSignatures) {
                signatureMap.set(sig.employeeId, {
                    signed: !!sig.signature && !!sig.signedAt,
                    signedAt: sig.signedAt,
                    signature: sig.signature
                })
            }
        }

        // Build employee signatures array (all employees, signed or not)
        const employeeSignatures: EmployeeSignatureData[] = employees.map(employee => {
            const sigData = signatureMap.get(employee.id)
            return {
                employeeId: employee.id,
                employeeName: employee.name || "Unbekannt",
                signed: sigData?.signed || false,
                signedAt: sigData?.signedAt?.toISOString() || null,
                signatureUrl: sigData?.signature || null
            }
        })

        // Check if all employees have signed
        const allEmployeesSigned = employees.length > 0 &&
            employees.every(emp => signatureMap.get(emp.id)?.signed === true)

        // Build client signature data
        const clientSignature = {
            signed: !!submission?.recipientSignature || !!submission?.recipientSignedAt,
            signedAt: submission?.recipientSignedAt?.toISOString() || null,
            signatureUrl: submission?.clientSignatureUrl || submission?.recipientSignature || null
        }

        // Build final response
        const response = {
            client: client ? {
                id: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                fullName: `${client.firstName} ${client.lastName}`,
                email: client.email
            } : {
                id: "",
                firstName: "Unbekannt",
                lastName: "",
                fullName: "Klient nicht zugeordnet",
                email: null
            },
            clientMissing: !client,
            sheetFileName,
            month,
            year,
            // Employees without nested timesheets (just stats)
            employees: employeesData.map(emp => ({
                id: emp.id,
                name: emp.name,
                email: emp.email,
                stats: emp.stats
            })),
            // Flat timesheets array with employeeId and employeeName
            timesheets: flatTimesheets,
            totalHours: Math.round(totalHoursAllEmployees * 100) / 100,
            submission: submission ? {
                id: submission.id,
                status: submission.status,
                signatureToken: submission.signatureToken,
                recipientSignedAt: submission.recipientSignedAt?.toISOString() || null,
                clientSignatureUrl: submission.clientSignatureUrl,
                allEmployeesSigned: submission.allEmployeesSigned || allEmployeesSigned
            } : null,
            signatures: {
                employees: employeeSignatures,
                client: clientSignature
            }
        }

        const duration = Math.round(performance.now() - startTime)
        console.log(`[API] GET /api/admin/timesheets/combined - ${duration}ms (${flatTimesheets.length} timesheets, ${employees.length} employees)`)

        return NextResponse.json(response)

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[GET /api/admin/timesheets/combined] Error:", errorMessage, error)
        return NextResponse.json({
            error: "Interner Serverfehler"
        }, { status: 500 })
    }
}
