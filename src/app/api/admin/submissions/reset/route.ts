import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { clientId, month, year } = body

        if (!clientId || !month || !year) {
            return NextResponse.json(
                { error: "clientId, month, year erforderlich" },
                { status: 400 }
            )
        }

        // Find TeamSubmission
        const submission = await prisma.teamSubmission.findFirst({
            where: {
                clientId,
                month,
                year
            },
            include: {
                employeeSignatures: true
            }
        })

        if (!submission) {
            return NextResponse.json(
                { error: "Keine Einreichung gefunden" },
                { status: 404 }
            )
        }

        // Reset all signatures and timesheets in transaction
        await prisma.$transaction(async (tx) => {
            // Delete all employee signatures
            await tx.employeeSignature.deleteMany({
                where: { teamSubmissionId: submission.id }
            })

            // Reset TeamSubmission fields
            await tx.teamSubmission.update({
                where: { id: submission.id },
                data: {
                    status: "PENDING_EMPLOYEES",
                    recipientSignedAt: null,
                    clientSignatureUrl: null,
                    signToken: null,
                    tokenExpiry: null,
                    allEmployeesSigned: false
                }
            })

            // Reset all related timesheets back to CONFIRMED status
            // (so employees can edit and re-submit)
            await tx.timesheet.updateMany({
                where: {
                    month,
                    year,
                    employee: {
                        team: {
                            clientId
                        }
                    },
                    status: "COMPLETED"
                },
                data: {
                    status: "CONFIRMED"
                }
            })
        })

        return NextResponse.json({
            success: true,
            message: "Stundennachweis erfolgreich zurückgesetzt"
        })
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[POST /api/admin/submissions/reset] Error:", errorMessage, error)
        return NextResponse.json(
            { error: "Interner Serverfehler" },
            { status: 500 }
        )
    }
}
