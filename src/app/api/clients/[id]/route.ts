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

        // Prüfen ob Klient existiert (mit Mitarbeiter-Info für Auto-Team-Logik)
        const existingClient = await prisma.client.findUnique({
            where: { id },
            include: {
                employees: {
                    select: { id: true }
                }
            }
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

        // Assistenzkräfte-Zuweisungen aktualisieren mit Auto-Team-Erstellung
        const { employeeIds } = body
        if (employeeIds !== undefined) {
            // 1. Hole alte Zuordnungen vor dem Update
            const currentEmployeeIds = existingClient.employees?.map(e => e.id) || []

            // 2. Finde neu hinzugefügte Mitarbeiter
            const newEmployeeIds = employeeIds.filter(
                (empId: string) => !currentEmployeeIds.includes(empId)
            )

            // 3. Für jeden neuen Mitarbeiter: Team-Logik durchführen
            for (const empId of newEmployeeIds) {
                const employee = await prisma.user.findUnique({
                    where: { id: empId },
                    select: { id: true, name: true, teamId: true }
                })

                if (!employee) continue

                // Hat Mitarbeiter bereits ein Primary Team?
                if (employee.teamId === null) {
                    // NEIN → Team für Client suchen oder erstellen
                    let clientTeam = await prisma.team.findFirst({
                        where: { clientId: id }
                    })

                    if (!clientTeam) {
                        // Team erstellen mit naming convention
                        const teamName = `Team ${firstName} ${lastName}`

                        clientTeam = await prisma.team.create({
                            data: {
                                name: teamName,
                                clientId: id,
                                assistantRecipientEmail: email || undefined,
                                assistantRecipientName: `${firstName} ${lastName}`
                            }
                        })

                        console.log(`[Auto-Team] Created team "${teamName}" for client ${id}`)
                    }

                    // Setze Mitarbeiter's Primary Team
                    await prisma.user.update({
                        where: { id: empId },
                        data: { teamId: clientTeam.id }
                    })

                    console.log(`[Auto-Team] Set employee ${employee.name} primary team to "${clientTeam.name}"`)
                } else {
                    console.log(`[Auto-Team] Employee ${employee.name} already has primary team, skipping`)
                }
            }

            // 4. Standard-Update durchführen (Many-to-Many)
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
            // ✅ FIX: Permanent löschen mit CASCADE DELETE
            // Teams werden automatisch mitgelöscht dank onDelete: Cascade im Schema

            // Trenne Mitarbeiter von Teams zuerst
            for (const team of existingClient.teams) {
                await prisma.user.updateMany({
                    where: { teamId: team.id },
                    data: { teamId: null }
                })
            }

            // Klient löschen (CASCADE löscht Teams automatisch)
            await prisma.client.delete({
                where: { id }
            })
        } else {
            // Soft delete - setze isActive auf false
            // ⚠️ WARNUNG: Teams bleiben aktiv, aber Klient wird als inaktiv markiert
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
