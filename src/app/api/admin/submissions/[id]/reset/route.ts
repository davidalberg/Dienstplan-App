import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import crypto from "crypto"

/**
 * POST /api/admin/submissions/[id]/reset
 * Komplett-Reset einer Einreichung
 * Löscht ALLE Unterschriften, generiert neuen Token, setzt alles zurück
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
        const { reason } = body  // Optional: Grund für Reset

        const result = await prisma.$transaction(async (tx) => {
            // 1. Hole Submission mit allen Unterschriften
            const submission = await tx.teamSubmission.findUnique({
                where: { id },
                include: {
                    employeeSignatures: {
                        include: {
                            employee: { select: { id: true, name: true } }
                        }
                    }
                }
            })

            if (!submission) {
                throw new Error("Einreichung nicht gefunden")
            }

            const employeeIds = submission.employeeSignatures.map(sig => sig.employee.id)
            const employeeNames = submission.employeeSignatures.map(sig => sig.employee.name)

            // 2. Lösche ALLE Mitarbeiter-Unterschriften
            await tx.employeeSignature.deleteMany({
                where: { teamSubmissionId: id }
            })

            // 3. Setze ALLE Timesheets zurück auf CONFIRMED
            if (employeeIds.length > 0) {
                await tx.timesheet.updateMany({
                    where: {
                        sheetFileName: submission.sheetFileName,
                        month: submission.month,
                        year: submission.year,
                        employeeId: { in: employeeIds },
                        status: "SUBMITTED"
                    },
                    data: { status: "CONFIRMED" }
                })
            }

            // 4. Update Submission: Reset Status + neuer Token
            const newToken = crypto.randomUUID()
            const newExpiry = new Date()
            newExpiry.setDate(newExpiry.getDate() + 7) // 7 Tage Gültigkeit

            await tx.teamSubmission.update({
                where: { id },
                data: {
                    status: "PENDING_EMPLOYEES",
                    // Lösche Assistenznehmer-Unterschrift
                    recipientSignature: null,
                    recipientSignedAt: null,
                    recipientIp: null,
                    // Neuer Token (alter wird ungültig)
                    signatureToken: newToken,
                    tokenExpiresAt: newExpiry,
                    // Lösche PDF
                    pdfUrl: null,
                    // Lösche manuelle Freigabe-Metadaten
                    manuallyReleasedAt: null,
                    manuallyReleasedBy: null,
                    releaseNote: null
                }
            })

            // 5. Log to console (for debugging/auditing)
            console.log(`[RESET-SUBMISSION] Admin ${session.user!.email} reset submission ${id} (${submission.sheetFileName} ${submission.month}/${submission.year}). Reason: ${reason || "None"}. Deleted ${employeeIds.length} signatures.`)

            return {
                success: true,
                newToken,
                resetCount: employeeIds.length,
                employeeNames
            }
        }, {
            isolationLevel: "Serializable" // Prevent race conditions
        })

        return NextResponse.json(result)
    } catch (error: any) {
        console.error("[RESET-SUBMISSION] Error:", error)
        return NextResponse.json({
            error: error.message || "Internal server error"
        }, { status: 500 })
    }
}
