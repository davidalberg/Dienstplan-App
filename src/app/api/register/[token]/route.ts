import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { validatePassword } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limiter"

/**
 * GET /api/register/[token]
 * Validate invitation token and return employee info
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        const user = await prisma.user.findFirst({
            where: {
                invitationToken: token,
                invitationExpiry: { gt: new Date() }
            },
            select: {
                id: true,
                name: true,
                email: true
            }
        })

        if (!user) {
            return NextResponse.json(
                { error: "Ungültiger oder abgelaufener Einladungslink" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            name: user.name,
            email: user.email
        })
    } catch (error: any) {
        console.error("[GET /api/register] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/register/[token]
 * Set password for invited employee.
 * Uses atomic updateMany to prevent TOCTOU race condition:
 * the token is validated and consumed in a single database operation.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        const { limited, headers } = checkRateLimit(`register:${token}`, 3, 60_000)
        if (limited) {
            return NextResponse.json(
                { error: "Zu viele Versuche. Bitte warte eine Minute." },
                { status: 429, headers }
            )
        }

        const { password } = await req.json()

        const passwordCheck = validatePassword(password)
        if (!passwordCheck.valid) {
            return NextResponse.json(
                { error: passwordCheck.error },
                { status: 400 }
            )
        }

        // Hash password before the atomic update so the DB operation is as fast as possible
        const hashedPassword = await bcrypt.hash(password, 12)

        // Atomic: validate token + consume it in one operation.
        // If two requests race with the same token, only one will match
        // (the other sees invitationToken already set to null).
        const result = await prisma.user.updateMany({
            where: {
                invitationToken: token,
                invitationExpiry: { gt: new Date() }
            },
            data: {
                password: hashedPassword,
                invitationToken: null,
                invitationExpiry: null
            }
        })

        if (result.count === 0) {
            return NextResponse.json(
                { error: "Dieser Einladungslink wurde bereits verwendet oder ist abgelaufen" },
                { status: 409 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error("[POST /api/register] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
