import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/submissions/status?month=X&year=Y
 *
 * Returns the signature status for the current employee for a given month.
 * Used by the dashboard to determine which buttons to show.
 *
 * Response:
 * {
 *   hasSubmission: boolean,          // TeamSubmission exists
 *   employeeSigned: boolean,         // Current user has signed
 *   clientSigned: boolean,           // Assistenznehmer has signed
 *   submissionStatus: string,        // PENDING_EMPLOYEES | PENDING_RECIPIENT | COMPLETED
 *   canWithdraw: boolean,            // Employee can withdraw signature
 *   totalEmployees: number,          // Total employees in this Dienstplan
 *   signedEmployees: number          // How many have signed
 * }
 */
export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const session = authResult

        const user = session.user as any
        const { searchParams } = new URL(req.url)

        const month = parseInt(searchParams.get("month") || "")
        const year = parseInt(searchParams.get("year") || "")

        if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
            return NextResponse.json(
                { error: "Ungueltige Monat/Jahr Parameter" },
                { status: 400 }
            )
        }

        // Find the employee's timesheets to determine sheetFileName
        const employeeTimesheets = await prisma.timesheet.findMany({
            where: {
                employeeId: user.id,
                month,
                year,
            },
            select: {
                sheetFileName: true,
            }
        })

        if (employeeTimesheets.length === 0) {
            return NextResponse.json({
                hasSubmission: false,
                employeeSigned: false,
                clientSigned: false,
                submissionStatus: null,
                canWithdraw: false,
                totalEmployees: 0,
                signedEmployees: 0
            })
        }

        // Get unique sheetFileNames
        const sheetFileNames = [...new Set(employeeTimesheets.map(t => t.sheetFileName).filter(Boolean))]

        if (sheetFileNames.length === 0) {
            return NextResponse.json({
                hasSubmission: false,
                employeeSigned: false,
                clientSigned: false,
                submissionStatus: null,
                canWithdraw: false,
                totalEmployees: 0,
                signedEmployees: 0
            })
        }

        // Find TeamSubmission for this sheetFileName
        const teamSubmission = await prisma.teamSubmission.findFirst({
            where: {
                sheetFileName: { in: sheetFileNames as string[] },
                month,
                year,
            },
            include: {
                employeeSignatures: {
                    select: {
                        id: true,
                        employeeId: true,
                        signedAt: true
                    }
                }
            }
        })

        if (!teamSubmission) {
            return NextResponse.json({
                hasSubmission: false,
                employeeSigned: false,
                clientSigned: false,
                submissionStatus: null,
                canWithdraw: false,
                totalEmployees: 0,
                signedEmployees: 0
            })
        }

        // Check if current user has signed
        const employeeSigned = teamSubmission.employeeSignatures.some(
            sig => sig.employeeId === user.id
        )

        // Check if client has signed
        const clientSigned = !!teamSubmission.recipientSignature

        // Count total employees in this Dienstplan (with status filter to match utility function)
        const allEmployeesInDienstplan = await prisma.timesheet.findMany({
            where: {
                sheetFileName: teamSubmission.sheetFileName,
                month,
                year,
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
            },
            select: { employeeId: true },
            distinct: ['employeeId']
        })
        const totalEmployees = allEmployeesInDienstplan.length
        const signedEmployees = teamSubmission.employeeSignatures.length

        // Can withdraw if: employee has signed AND client has NOT signed
        const canWithdraw = employeeSigned && !clientSigned && teamSubmission.status !== "COMPLETED"

        return NextResponse.json({
            hasSubmission: true,
            submissionId: teamSubmission.id,
            employeeSigned,
            clientSigned,
            submissionStatus: teamSubmission.status,
            canWithdraw,
            totalEmployees,
            signedEmployees,
            employeeSignedAt: employeeSigned
                ? teamSubmission.employeeSignatures.find(s => s.employeeId === user.id)?.signedAt
                : null
        })

    } catch (error: any) {
        console.error("[GET /api/submissions/status] Error:", error)
        return NextResponse.json(
            { error: "Ein unerwarteter Fehler ist aufgetreten" },
            { status: 500 }
        )
    }
}
