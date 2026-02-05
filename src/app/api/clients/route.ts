import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { logActivity } from "@/lib/activity-logger"

// GET - Liste aller Klienten
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const isActive = searchParams.get("isActive")

        const whereClause: any = {}
        if (isActive !== null) {
            whereClause.isActive = isActive === "true"
        }

        const clients = await prisma.client.findMany({
            where: whereClause,
            include: {
                employees: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: [
                { displayOrder: "asc" },
                { lastName: "asc" },
                { firstName: "asc" }
            ]
        })

        return NextResponse.json({ clients })
    } catch (error: any) {
        console.error("[GET /api/clients] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Neuen Klienten erstellen
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            firstName,
            lastName,
            email,
            phone,
            state
        } = body

        // Validierung
        if (!firstName || !lastName) {
            return NextResponse.json(
                { error: "Vorname und Nachname sind erforderlich" },
                { status: 400 }
            )
        }

        // Klient erstellen
        const client = await prisma.client.create({
            data: {
                firstName,
                lastName,
                email: email || null,
                phone: phone || null,
                state: state || null,
                isActive: true
            }
        })

        // Log activity
        await logActivity({
            type: "SUCCESS",
            category: "CLIENT",
            action: `Klient erstellt: ${firstName} ${lastName}`,
            details: { email, phone, state },
            userId: session.user.id,
            userName: session.user.name || session.user.email || "Admin",
            entityId: client.id,
            entityType: "Client"
        })

        return NextResponse.json({ client })
    } catch (error: any) {
        console.error("[POST /api/clients] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
