import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

// PUT - Assistenzkraft einem Klienten zuweisen/entfernen
export async function PUT(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const body = await req.json()
        const { employeeId, fromClientId, toClientId } = body

        if (!employeeId) {
            return NextResponse.json({ error: "employeeId erforderlich" }, { status: 400 })
        }

        // Assistenzkraft finden
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            include: { clients: true }
        })

        if (!employee) {
            return NextResponse.json({ error: "Assistenzkraft nicht gefunden" }, { status: 404 })
        }

        // Wenn fromClientId angegeben, von diesem Klienten entfernen
        if (fromClientId) {
            await prisma.user.update({
                where: { id: employeeId },
                data: {
                    clients: {
                        disconnect: { id: fromClientId }
                    }
                }
            })
        }

        // Wenn toClientId angegeben, zu diesem Klienten hinzufügen
        if (toClientId) {
            await prisma.user.update({
                where: { id: employeeId },
                data: {
                    clients: {
                        connect: { id: toClientId }
                    }
                }
            })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[PUT /api/admin/employee-assignment] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
