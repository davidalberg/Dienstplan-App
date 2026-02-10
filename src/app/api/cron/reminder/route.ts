import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendReminderEmail } from "@/lib/email"
import { timingSafeEqual } from "crypto"

/**
 * GET /api/cron/reminder
 * Vercel Cron job - sends reminder emails after 2 days
 *
 * Runs daily at 8:00 AM (configured in vercel.json)
 */
export async function GET(req: NextRequest) {
    // Verify cron secret (Vercel sets this header for cron jobs)
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    function safeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false
        return timingSafeEqual(Buffer.from(a), Buffer.from(b))
    }
    if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const now = new Date()
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

        // Find TeamSubmissions that:
        // 1. Status is PENDING_RECIPIENT
        // 2. Token is not expired
        // 3. Created more than 2 days ago OR last reminder was more than 2 days ago
        const pendingSubmissions = await prisma.teamSubmission.findMany({
            where: {
                status: "PENDING_RECIPIENT",
                tokenExpiresAt: { gt: now },
                OR: [
                    // Never sent a reminder and created > 2 days ago
                    {
                        lastReminderSentAt: null,
                        createdAt: { lt: twoDaysAgo }
                    },
                    // Last reminder was > 2 days ago
                    {
                        lastReminderSentAt: { lt: twoDaysAgo }
                    }
                ]
            },
            include: {
                client: true,
                dienstplanConfig: true,
                employeeSignatures: {
                    include: {
                        employee: {
                            select: { name: true, email: true }
                        }
                    }
                }
            }
        })

        const results = {
            processed: 0,
            sent: 0,
            errors: [] as string[]
        }

        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

        for (const submission of pendingSubmissions) {
            results.processed++

            // Get recipient email and name
            const recipientEmail = submission.dienstplanConfig?.assistantRecipientEmail || submission.client?.email
            const recipientName = submission.dienstplanConfig?.assistantRecipientName ||
                (submission.client ? `${submission.client.firstName} ${submission.client.lastName}` : null)

            if (!recipientEmail || !recipientName) {
                results.errors.push(`Submission ${submission.id}: Keine E-Mail-Adresse für Assistenznehmer`)
                continue
            }

            // Calculate days pending
            const createdAt = submission.createdAt
            const daysPending = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))

            // Get employee names who have signed
            const employeeNames = submission.employeeSignatures.map(sig =>
                sig.employee.name || sig.employee.email
            )

            const signatureUrl = `${baseUrl}/sign/${submission.signatureToken}`

            try {
                await sendReminderEmail({
                    recipientEmail,
                    recipientName,
                    sheetFileName: submission.sheetFileName,
                    month: submission.month,
                    year: submission.year,
                    signatureUrl,
                    expiresAt: submission.tokenExpiresAt,
                    employeeNames,
                    daysPending
                })

                // Update lastReminderSentAt
                await prisma.teamSubmission.update({
                    where: { id: submission.id },
                    data: { lastReminderSentAt: now }
                })

                results.sent++
            } catch (emailError: any) {
                results.errors.push(`Submission ${submission.id}: ${emailError.message}`)
            }
        }

        return NextResponse.json({
            success: true,
            message: `Cron job completed: ${results.sent}/${results.processed} reminders sent`,
            ...results
        })
    } catch (error: any) {
        console.error("[GET /api/cron/reminder] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
