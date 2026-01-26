import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getAllEmployeesInDienstplan } from "@/lib/team-submission-utils"

/**
 * GET /api/admin/submissions
 * Get all team submissions with employee signature progress
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Get all TeamSubmissions (ordered by most recent first)
        const teamSubmissions = await prisma.teamSubmission.findMany({
            orderBy: [
                { year: "desc" },
                { month: "desc" },
                { createdAt: "desc" }
            ],
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

        // For each submission, get total employee count
        const submissionsWithProgress = await Promise.all(
            teamSubmissions.map(async (submission) => {
                const allEmployees = await getAllEmployeesInDienstplan(
                    submission.sheetFileName,
                    submission.month,
                    submission.year
                )

                return {
                    id: submission.id,
                    sheetFileName: submission.sheetFileName,
                    month: submission.month,
                    year: submission.year,
                    status: submission.status,
                    createdAt: submission.createdAt,
                    updatedAt: submission.updatedAt,
                    recipientEmail: submission.dienstplanConfig.assistantRecipientEmail,
                    recipientName: submission.dienstplanConfig.assistantRecipientName,
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
                    }))
                }
            })
        )

        return NextResponse.json({ submissions: submissionsWithProgress })
    } catch (error: any) {
        console.error("[GET /api/admin/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
