import prisma from "@/lib/prisma"

/**
 * Extrahiert teamId aus generiertem sheetFileName (falls vorhanden)
 * Format: "Team_TeamName_Jahr"
 */
function extractTeamNameFromSheetFileName(sheetFileName: string): string | null {
    const match = sheetFileName.match(/^Team_(.+)_\d{4}$/)
    return match ? match[1].replace(/_/g, ' ') : null
}

/**
 * Holt alle Mitarbeiter-IDs für einen bestimmten Dienstplan (sheetFileName) in einem Monat/Jahr
 * FALLBACK: Wenn sheetFileName generiert wurde (Team_*_Jahr), sucht auch nach teamId
 * @param sheetFileName z.B. "Dienstplan Finn Jonschker 2026" oder "Team_TeamName_2026"
 * @param month Monat (1-12)
 * @param year Jahr (z.B. 2026)
 * @returns Array von employeeIds
 */
export async function getEmployeesInDienstplan(
    sheetFileName: string,
    month: number,
    year: number
): Promise<string[]> {
    // Primaer: Suche nach sheetFileName
    // Match status filter used in combined/route.ts for consistency
    let timesheets = await prisma.timesheet.findMany({
        where: {
            sheetFileName,
            month,
            year,
            status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
        },
        select: {
            employeeId: true
        },
        distinct: ['employeeId']
    })

    // FALLBACK: Wenn sheetFileName generiert wurde, suche auch nach passendem Team
    if (timesheets.length === 0) {
        const teamName = extractTeamNameFromSheetFileName(sheetFileName)
        if (teamName) {
            // Suche Team nach Name
            const team = await prisma.team.findFirst({
                where: {
                    name: { contains: teamName, mode: 'insensitive' }
                }
            })

            if (team) {
                // Suche Timesheets mit diesem teamId (Legacy-Daten)
                timesheets = await prisma.timesheet.findMany({
                    where: {
                        teamId: team.id,
                        month,
                        year,
                        sheetFileName: null, // Nur Legacy-Daten
                        status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
                    },
                    select: {
                        employeeId: true
                    },
                    distinct: ['employeeId']
                })
            }
        }
    }

    return timesheets.map(ts => ts.employeeId)
}

/**
 * Prüft ob alle Mitarbeiter eines Dienstplans unterschrieben haben
 * @param teamSubmissionId ID der TeamSubmission
 * @returns Objekt mit allSigned, total und signed count
 */
export async function areAllEmployeesSigned(
    teamSubmissionId: string
): Promise<{ allSigned: boolean; total: number; signed: number }> {
    const submission = await prisma.teamSubmission.findUnique({
        where: { id: teamSubmissionId },
        include: {
            employeeSignatures: true
        }
    })

    if (!submission) {
        throw new Error("TeamSubmission not found")
    }

    // Hole alle Mitarbeiter im Dienstplan
    const employeeIds = await getEmployeesInDienstplan(
        submission.sheetFileName,
        submission.month,
        submission.year
    )

    return {
        allSigned: employeeIds.length === submission.employeeSignatures.length,
        total: employeeIds.length,
        signed: submission.employeeSignatures.length
    }
}

/**
 * Holt alle Mitarbeiter die noch nicht unterschrieben haben
 * @param teamSubmissionId ID der TeamSubmission
 * @returns Array von User-Objekten (id, name, email)
 */
export async function getPendingEmployees(
    teamSubmissionId: string
): Promise<Array<{ id: string; name: string | null; email: string }>> {
    const submission = await prisma.teamSubmission.findUnique({
        where: { id: teamSubmissionId },
        include: {
            employeeSignatures: {
                select: { employeeId: true }
            }
        }
    })

    if (!submission) {
        throw new Error("TeamSubmission not found")
    }

    // Hole alle Mitarbeiter im Dienstplan
    const allEmployeeIds = await getEmployeesInDienstplan(
        submission.sheetFileName,
        submission.month,
        submission.year
    )

    // IDs der Mitarbeiter die bereits unterschrieben haben
    const signedEmployeeIds = new Set(
        submission.employeeSignatures.map(sig => sig.employeeId)
    )

    // Filtere die Mitarbeiter die noch nicht unterschrieben haben
    const pendingEmployeeIds = allEmployeeIds.filter(
        id => !signedEmployeeIds.has(id)
    )

    // Hole User-Daten für pending employees
    if (pendingEmployeeIds.length === 0) {
        return []
    }

    const pendingUsers = await prisma.user.findMany({
        where: {
            id: { in: pendingEmployeeIds }
        },
        select: {
            id: true,
            name: true,
            email: true
        }
    })

    return pendingUsers
}

/**
 * Holt alle Mitarbeiter (mit Namen) für einen Dienstplan
 * @param sheetFileName z.B. "Dienstplan Finn Jonschker 2026"
 * @param month Monat (1-12)
 * @param year Jahr (z.B. 2026)
 * @returns Array von User-Objekten (id, name, email)
 */
export async function getAllEmployeesInDienstplan(
    sheetFileName: string,
    month: number,
    year: number
): Promise<Array<{ id: string; name: string | null; email: string }>> {
    const employeeIds = await getEmployeesInDienstplan(sheetFileName, month, year)

    if (employeeIds.length === 0) {
        return []
    }

    const users = await prisma.user.findMany({
        where: {
            id: { in: employeeIds }
        },
        select: {
            id: true,
            name: true,
            email: true
        },
        orderBy: {
            name: 'asc'
        }
    })

    return users
}

/**
 * Holt Mitarbeiter die bereits unterschrieben haben (mit Signatur-Details)
 * @param teamSubmissionId ID der TeamSubmission
 * @returns Array mit Mitarbeiter-Daten und Signatur-Zeitstempel
 */
export async function getSignedEmployees(
    teamSubmissionId: string
): Promise<Array<{
    id: string
    name: string | null
    email: string
    signedAt: Date
    signature: string
}>> {
    const submission = await prisma.teamSubmission.findUnique({
        where: { id: teamSubmissionId },
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
                },
                orderBy: {
                    signedAt: 'asc'
                }
            }
        }
    })

    if (!submission) {
        throw new Error("TeamSubmission not found")
    }

    // Filter only signed employees (with non-null signature and signedAt)
    return submission.employeeSignatures
        .filter(sig => sig.signature && sig.signedAt)
        .map(sig => ({
            id: sig.employee.id,
            name: sig.employee.name,
            email: sig.employee.email,
            signedAt: sig.signedAt!,
            signature: sig.signature!
        }))
}
