import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET - Einzelnen Klienten abrufen
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { id } = await params

        const client = await prisma.client.findUnique({
            where: { id },
            include: {
                employees: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        })

        if (!client) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        return NextResponse.json({ client })
    } catch (error: any) {
        console.error("[GET /api/clients/[id]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Klienten aktualisieren
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { id } = await params
        const body = await req.json()
        const {
            firstName,
            lastName,
            email,
            phone,
            state,
            isActive
        } = body

        // Prüfen ob Klient existiert
        const existingClient = await prisma.client.findUnique({
            where: { id }
        })

        if (!existingClient) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        // Daten vorbereiten
        const updateData: any = {}
        if (firstName !== undefined) updateData.firstName = firstName
        if (lastName !== undefined) updateData.lastName = lastName
        if (email !== undefined) updateData.email = email || null
        if (phone !== undefined) updateData.phone = phone || null
        if (state !== undefined) updateData.state = state || null
        if (isActive !== undefined) updateData.isActive = isActive

        // Assistenzkräfte-Zuweisungen aktualisieren (employeeIds = Array von User-IDs)
        const { employeeIds } = body
        if (employeeIds !== undefined) {
            updateData.employees = {
                set: employeeIds.map((empId: string) => ({ id: empId }))
            }
        }

        const client = await prisma.client.update({
            where: { id },
            data: updateData,
            include: {
                employees: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        })

        return NextResponse.json({ client })
    } catch (error: any) {
        console.error("[PUT /api/clients/[id]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE - Klienten löschen (soft delete -> isActive=false)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { id } = await params
        const { searchParams } = new URL(req.url)
        const permanent = searchParams.get("permanent") === "true"

        // Prüfen ob Klient existiert
        const existingClient = await prisma.client.findUnique({
            where: { id },
            include: {
                teams: true
            }
        })

        if (!existingClient) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        if (permanent) {
            // Permanent löschen - nur wenn keine Teams zugeordnet
            if (existingClient.teams.length > 0) {
                return NextResponse.json(
                    { error: `Klient kann nicht gelöscht werden. Es sind noch ${existingClient.teams.length} Teams zugeordnet.` },
                    { status: 400 }
                )
            }

            await prisma.client.delete({
                where: { id }
            })
        } else {
            // Soft delete - setze isActive auf false
            await prisma.client.update({
                where: { id },
                data: { isActive: false }
            })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[DELETE /api/clients/[id]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
