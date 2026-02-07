import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { randomBytes } from "crypto"
import { sendInvitationEmail } from "@/lib/email"
import { logActivity } from "@/lib/activity-logger"

/**
 * POST /api/admin/employees/invite
 * Send invitation email to employee so they can set their own password
 */
export async function POST(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const { employeeId } = await req.json()

        if (!employeeId) {
            return NextResponse.json({ error: "employeeId erforderlich" }, { status: 400 })
        }

        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { id: true, email: true, name: true, password: true }
        })

        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
        }

        if (!employee.email) {
            return NextResponse.json({ error: "Mitarbeiter hat keine E-Mail-Adresse" }, { status: 400 })
        }

        // Generate invitation token
        const invitationToken = randomBytes(32).toString("hex")
        const invitationExpiry = new Date()
        invitationExpiry.setDate(invitationExpiry.getDate() + 7) // 7 days

        // Save token to user
        await prisma.user.update({
            where: { id: employeeId },
            data: {
                invitationToken,
                invitationExpiry
            }
        })

        // Send invitation email
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const registrationUrl = `${baseUrl}/register/${invitationToken}`

        await sendInvitationEmail({
            employeeEmail: employee.email,
            employeeName: employee.name || employee.email,
            registrationUrl,
            expiresAt: invitationExpiry
        })

        // Log activity
        await logActivity({
            type: "INFO",
            category: "EMPLOYEE",
            action: `Einladung gesendet an: ${employee.name || employee.email}`,
            details: { email: employee.email },
            userId: session.user.id,
            userName: session.user.name || session.user.email || "Admin",
            entityId: employee.id,
            entityType: "User"
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[POST /api/admin/employees/invite] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
