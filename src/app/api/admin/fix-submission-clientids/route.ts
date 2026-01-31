import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/fix-submission-clientids
 * Fixes TeamSubmissions that have NULL clientId by looking up the client from employee teams
 * Admin only
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Find all submissions with NULL clientId
        const submissionsWithoutClient = await prisma.teamSubmission.findMany({
            where: {
                clientId: null
            },
            include: {
                employeeSignatures: {
                    include: {
                        employee: {
                            include: {
                                team: {
                                    include: {
                                        client: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        const results = {
            total: submissionsWithoutClient.length,
            fixed: 0,
            skipped: 0,
            details: [] as Array<{ id: string; sheetFileName: string; clientId: string | null }>
        }

        for (const submission of submissionsWithoutClient) {
            // Try to get clientId from first employee's team
            const firstEmployee = submission.employeeSignatures[0]?.employee
            const clientId = firstEmployee?.team?.client?.id

            if (clientId) {
                // Update the submission with the clientId
                await prisma.teamSubmission.update({
                    where: { id: submission.id },
                    data: { clientId }
                })

                results.fixed++
                results.details.push({
                    id: submission.id,
                    sheetFileName: submission.sheetFileName,
                    clientId
                })
            } else {
                results.skipped++
                results.details.push({
                    id: submission.id,
                    sheetFileName: submission.sheetFileName,
                    clientId: null
                })
            }
        }

        return NextResponse.json({
            message: "Submission clientIds fixed successfully",
            results
        })
    } catch (error) {
        console.error("[POST /api/admin/fix-submission-clientids] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
