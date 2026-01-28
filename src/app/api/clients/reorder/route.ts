import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// PUT - Klienten-Reihenfolge aktualisieren
export async function PUT(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { clientIds } = body

        if (!Array.isArray(clientIds)) {
            return NextResponse.json(
                { error: "clientIds muss ein Array sein" },
                { status: 400 }
            )
        }

        // Aktualisiere displayOrder für jeden Klienten
        await Promise.all(
            clientIds.map((clientId: string, index: number) =>
                prisma.client.update({
                    where: { id: clientId },
                    data: { displayOrder: index }
                })
            )
        )

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[PUT /api/clients/reorder] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
