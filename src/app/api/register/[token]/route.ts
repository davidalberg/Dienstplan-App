import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

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
 * Set password for invited employee
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params
        const { password } = await req.json()

        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: "Passwort muss mindestens 8 Zeichen lang sein" },
                { status: 400 }
            )
        }

        const user = await prisma.user.findFirst({
            where: {
                invitationToken: token,
                invitationExpiry: { gt: new Date() }
            }
        })

        if (!user) {
            return NextResponse.json(
                { error: "Ungültiger oder abgelaufener Einladungslink" },
                { status: 404 }
            )
        }

        const hashedPassword = await bcrypt.hash(password, 12)

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                invitationToken: null,
                invitationExpiry: null
            }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[POST /api/register] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
