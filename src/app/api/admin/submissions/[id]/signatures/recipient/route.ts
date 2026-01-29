import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * DELETE /api/admin/submissions/[id]/signatures/recipient
 * Delete recipient (Assistenznehmer) signature and reset submission status
 * Admin-only endpoint
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params

        // Find the submission
        const submission = await prisma.teamSubmission.findUnique({
            where: { id }
        })

        if (!submission) {
            return NextResponse.json({ error: "Submission nicht gefunden" }, { status: 404 })
        }

        // Only allow deletion if status is COMPLETED
        if (submission.status !== "COMPLETED") {
            return NextResponse.json({
                error: "Kann nur Unterschrift von abgeschlossenen Nachweisen löschen"
            }, { status: 400 })
        }

        // Reset recipient signature and status
        await prisma.teamSubmission.update({
            where: { id },
            data: {
                recipientSignature: null,
                recipientSignedAt: null,
                recipientIp: null,
                status: "PENDING_RECIPIENT",
                pdfUrl: null,
                googleDriveFileId: null
            }
        })

        // Reset timesheet status back to SUBMITTED
        await prisma.timesheet.updateMany({
            where: {
                sheetFileName: submission.sheetFileName,
                month: submission.month,
                year: submission.year
            },
            data: { status: "SUBMITTED" }
        })

        console.log(`[DELETE recipient signature] Deleted recipient signature for submission ${id}`)

        return NextResponse.json({
            success: true,
            message: "Assistenznehmer-Unterschrift gelöscht"
        })
    } catch (error) {
        console.error("[DELETE recipient signature] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
