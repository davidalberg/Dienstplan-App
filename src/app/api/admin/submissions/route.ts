import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getAllEmployeesInDienstplan } from "@/lib/team-submission-utils"

/**
 * GET /api/admin/submissions
 * Get all team submissions with employee signature progress
 * NEW: Also returns all configured Dienstpläne without submissions
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

        // Parallele Abfragen für bessere Performance
        const [teamSubmissions, allConfigs] = await Promise.all([
            prisma.teamSubmission.findMany({
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
            }),
            prisma.dienstplanConfig.findMany({
                orderBy: { sheetFileName: "asc" }
            })
        ])

        // NEW: Get all configured Dienstpläne that don't have a submission for the current/selected month
        const currentDate = new Date()
        const targetMonth = filterMonth || currentDate.getMonth() + 1
        const targetYear = filterYear || currentDate.getFullYear()

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

                    return {
                        id: null, // No submission yet
                        sheetFileName: config.sheetFileName,
                        month: targetMonth,
                        year: targetYear,
                        status: "NOT_STARTED",
                        recipientEmail: config.assistantRecipientEmail,
                        recipientName: config.assistantRecipientName,
                        totalEmployees: allEmployees.length,
                        signedEmployees: 0,
                        employeeSignatures: []
                    }
                })
        )

        // Filter out Dienstpläne with 0 employees (no timesheets for this month)
        const pendingWithEmployees = pendingDienstplaene.filter(d => d.totalEmployees > 0)

        return NextResponse.json({
            submissions: submissionsWithProgress,
            pendingDienstplaene: pendingWithEmployees,
            targetMonth,
            targetYear
        })
    } catch (error: any) {
        console.error("[GET /api/admin/submissions] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
