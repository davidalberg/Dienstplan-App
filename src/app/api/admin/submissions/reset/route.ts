import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"
import { randomBytes } from "crypto"

/**
 * POST /api/admin/submissions/reset
 * Reset a Combined Timesheet - removes all signatures and allows re-editing
 *
 * Request Body: { clientId: string, month: number, year: number }
 *
 * Actions:
 * 1. Delete all EmployeeSignatures for this TeamSubmission
 * 2. Reset TeamSubmission: status, client signature fields, regenerate token
 * 3. Reset related Timesheets from SUBMITTED/COMPLETED back to CONFIRMED
 *
 * All changes are wrapped in a transaction for atomicity.
 */

const resetSchema = z.object({
    clientId: z.string().min(1, "clientId ist erforderlich"),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100)
})

export async function POST(request: NextRequest) {
    try {
        // 1. Auth check - only ADMIN allowed
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 2. Parse and validate request body
        const body = await request.json()
        const validationResult = resetSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                {
                    error: "Validierungsfehler",
                    details: validationResult.error.flatten()
                },
                { status: 400 }
            )
        }

        const { clientId, month, year } = validationResult.data

        // 3. Find TeamSubmission for this client/month/year
        const submission = await prisma.teamSubmission.findFirst({
            where: {
                clientId,
                month,
                year
            },
            include: {
                employeeSignatures: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        })

        if (!submission) {
            return NextResponse.json(
                {
                    error: "Keine Einreichung gefunden",
                    hint: `Keine TeamSubmission fuer clientId=${clientId}, ${month}/${year}`
                },
                { status: 404 }
            )
        }

        // 4. Execute reset in a transaction (all or nothing)
        const result = await prisma.$transaction(async (tx) => {
            // Count signatures before deletion for audit
            const employeeSignatureCount = submission.employeeSignatures.length
            const hadClientSignature = !!submission.recipientSignedAt

            // 4a. Delete all employee signatures
            const deletedSignatures = await tx.employeeSignature.deleteMany({
                where: { teamSubmissionId: submission.id }
            })

            // 4b. Generate new token for future client signature
            // (signatureToken is required and unique, cannot be null)
            const newToken = randomBytes(32).toString("hex")
            const newTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

            // 4c. Reset TeamSubmission fields
            await tx.teamSubmission.update({
                where: { id: submission.id },
                data: {
                    status: "PENDING_EMPLOYEES",
                    // Client signature fields
                    recipientSignature: null,
                    recipientSignedAt: null,
                    recipientIp: null,
                    clientSignatureUrl: null,
                    // Employee tracking
                    allEmployeesSigned: false,
                    // Token fields - regenerate for security
                    signatureToken: newToken,
                    tokenExpiresAt: newTokenExpiry,
                    // Clear PDF since it will need to be regenerated
                    pdfUrl: null,
                    googleDriveFileId: null
                }
            })

            // 4d. Reset all related timesheets back to CONFIRMED status
            // This allows employees to edit their times and re-submit
            // We reset both SUBMITTED and COMPLETED status
            const updatedTimesheets = await tx.timesheet.updateMany({
                where: {
                    month,
                    year,
                    sheetFileName: submission.sheetFileName,
                    status: { in: ["SUBMITTED", "COMPLETED"] }
                },
                data: {
                    status: "CONFIRMED"
                }
            })

            return {
                employeeSignaturesDeleted: deletedSignatures.count,
                hadClientSignature,
                timesheetsReset: updatedTimesheets.count
            }
        })

        // 5. Log the action for audit trail
        console.log(
            `[RESET] TeamSubmission ${submission.id} reset by ${session.user.email}:`,
            {
                clientId,
                month,
                year,
                sheetFileName: submission.sheetFileName,
                employeeSignaturesDeleted: result.employeeSignaturesDeleted,
                hadClientSignature: result.hadClientSignature,
                timesheetsReset: result.timesheetsReset
            }
        )

        // 6. Return success with details
        return NextResponse.json({
            success: true,
            message: "Stundennachweis erfolgreich zurueckgesetzt",
            details: {
                sheetFileName: submission.sheetFileName,
                clientName: submission.client
                    ? `${submission.client.firstName} ${submission.client.lastName}`
                    : null,
                employeeSignaturesRemoved: result.employeeSignaturesDeleted,
                clientSignatureRemoved: result.hadClientSignature,
                timesheetsReset: result.timesheetsReset
            }
        })
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[POST /api/admin/submissions/reset] Error:", errorMessage, error)
        return NextResponse.json(
            {
                error: "Interner Serverfehler",
                hint: "Bitte versuchen Sie es erneut oder kontaktieren Sie den Administrator"
            },
            { status: 500 }
        )
    }
}
