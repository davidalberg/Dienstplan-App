import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
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
        const adminAuth = await requireAdmin()
        if (adminAuth instanceof NextResponse) return adminAuth
        const { user: adminUser } = adminAuth

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

        // Atomic update: only update if status is still PENDING_EMPLOYEES (prevents race condition)
        const updateResult = await prisma.teamSubmission.updateMany({
            where: { id, status: "PENDING_EMPLOYEES" },
            data: {
                status: "PENDING_RECIPIENT",
                manuallyReleasedAt: new Date(),
                manuallyReleasedBy: adminUser.email,
                releaseNote
            }
        })

        if (updateResult.count === 0) {
            return NextResponse.json({
                error: "Diese Einreichung wurde bereits von jemand anderem freigegeben."
            }, { status: 409 })
        }

        // Send email to recipient with note about manual release
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const signatureUrl = `${baseUrl}/sign/${teamSubmission.signatureToken}`

        // Get recipient email and name from dienstplanConfig or client
        const recipientEmail = teamSubmission.dienstplanConfig?.assistantRecipientEmail || teamSubmission.client?.email
        const recipientName = teamSubmission.dienstplanConfig?.assistantRecipientName ||
            (teamSubmission.client ? `${teamSubmission.client.firstName} ${teamSubmission.client.lastName}` : null)

        if (!recipientEmail || !recipientName) {
            return NextResponse.json({
                success: true,
                warning: "Freigabe erfolgt, aber keine E-Mail-Adresse für den Assistenznehmer hinterlegt.",
                signatureUrl
            })
        }

        try {
            // Use existing email function but with modified employee name to indicate manual release
            await sendSignatureRequestEmail({
                recipientEmail,
                recipientName,
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
