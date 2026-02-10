import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limiter"
import { sendSignatureRequestEmail } from "@/lib/email"

/**
 * POST /api/test-email
 * Test endpoint to check if email sending works
 */
export async function POST(req: NextRequest) {
    try {
        const result = await requireAdmin()
        if (result instanceof NextResponse) return result

        const { limited, headers } = checkRateLimit("test-email:test-email", 2, 60_000)
        if (limited) {
            return NextResponse.json(
                { error: "Zu viele Test-E-Mails. Bitte warte eine Minute." },
                { status: 429, headers }
            )
        }

        const body = await req.json()
        const { recipientEmail, recipientName } = body

        if (!recipientEmail || !recipientName) {
            return NextResponse.json({
                error: "recipientEmail und recipientName sind erforderlich"
            }, { status: 400 })
        }

        console.log("[TEST-EMAIL] Attempting to send test email to:", recipientEmail)

        // Send test email
        await sendSignatureRequestEmail({
            recipientEmail,
            recipientName,
            employeeName: "Test Mitarbeiter",
            month: 1,
            year: 2026,
            signatureUrl: "http://localhost:3000/sign/test-token",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })

        console.log("[TEST-EMAIL] Email sent successfully!")

        return NextResponse.json({
            success: true,
            message: "Test-E-Mail erfolgreich versendet!"
        })
    } catch (error: any) {
        console.error("[TEST-EMAIL] Error:", error)
        return NextResponse.json({
            error: "E-Mail-Versand fehlgeschlagen",
            details: error.message
        }, { status: 500 })
    }
}
