import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { sendSignatureRequestEmail } from "@/lib/email"

/**
 * POST /api/admin/submissions/[id]/release
 * Manually release an incomplete team submission
 * Allows admin to proceed to PENDING_RECIPIENT even if not all employees signed
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params
        const body = await req.json()
        const { releaseNote } = body

        if (!releaseNote) {
            return NextResponse.json({
                error: "Bitte geben Sie einen Grund für die Freigabe an"
            }, { status: 400 })
        }

        // Get TeamSubmission
        const teamSubmission = await prisma.teamSubmission.findUnique({
            where: { id },
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

        if (!teamSubmission) {
            return NextResponse.json({ error: "Einreichung nicht gefunden" }, { status: 404 })
        }

        // Check status
        if (teamSubmission.status !== "PENDING_EMPLOYEES") {
            return NextResponse.json({
                error: "Diese Einreichung kann nicht freigegeben werden. Status muss PENDING_EMPLOYEES sein."
            }, { status: 400 })
        }

        // Update status to PENDING_RECIPIENT
        await prisma.teamSubmission.update({
            where: { id },
            data: {
                status: "PENDING_RECIPIENT",
                manuallyReleasedAt: new Date(),
                manuallyReleasedBy: (session.user as any).email,
                releaseNote
            }
        })

        // Send email to recipient with note about manual release
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const signatureUrl = `${baseUrl}/sign/${teamSubmission.signatureToken}`

        try {
            // Use existing email function but with modified employee name to indicate manual release
            await sendSignatureRequestEmail({
                recipientEmail: teamSubmission.dienstplanConfig.assistantRecipientEmail,
                recipientName: teamSubmission.dienstplanConfig.assistantRecipientName,
                employeeName: `Team ${teamSubmission.sheetFileName} (Manuell freigegeben)`,
                month: teamSubmission.month,
                year: teamSubmission.year,
                signatureUrl,
                expiresAt: teamSubmission.tokenExpiresAt
            })
        } catch (emailError: any) {
            console.error("[MANUAL RELEASE] Email sending failed:", emailError)
            return NextResponse.json({
                success: true,
                warning: "Freigabe erfolgt, aber E-Mail konnte nicht gesendet werden. Bitte informieren Sie den Assistenznehmer manuell.",
                signatureUrl
            })
        }

        return NextResponse.json({
            success: true,
            message: "Einreichung wurde manuell freigegeben. Der Assistenznehmer wurde benachrichtigt."
        })
    } catch (error: any) {
        console.error("[POST /api/admin/submissions/[id]/release] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
