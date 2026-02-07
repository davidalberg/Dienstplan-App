import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

export async function GET() {
    const result = await requireAuth()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                team: {
                    select: {
                        id: true,
                        name: true,
                        client: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            }
                        }
                    }
                }
            }
        })

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        return NextResponse.json(user)
    } catch (error: unknown) {
        console.error("[GET /api/profile] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
