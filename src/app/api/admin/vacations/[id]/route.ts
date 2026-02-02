import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Helper: Berechne Urlaubstage zwischen zwei Daten (inklusive)
function calculateVacationDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
}

// GET - Einzelner Urlaubsantrag
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

        const vacationRequest = await prisma.vacationRequest.findUnique({
            where: { id },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true
                    }
                },
                approver: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        })

        if (!vacationRequest) {
            return NextResponse.json({ error: "Urlaubsantrag nicht gefunden" }, { status: 404 })
        }

        const days = calculateVacationDays(vacationRequest.startDate, vacationRequest.endDate)

        return NextResponse.json({
            vacationRequest: {
                ...vacationRequest,
                days
            }
        })
    } catch (error: any) {
        console.error("[GET /api/admin/vacations/[id]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Urlaubsantrag aktualisieren (approve/reject/update)
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
        const { status, startDate, endDate, reason, firebaseId } = body

        // Pruefen ob Antrag existiert
        const existing = await prisma.vacationRequest.findUnique({
            where: { id },
            include: {
                employee: true
            }
        })

        if (!existing) {
            return NextResponse.json({ error: "Urlaubsantrag nicht gefunden" }, { status: 404 })
        }

        // Update-Daten vorbereiten
        const updateData: any = {}

        // Datumsaenderungen validieren
        if (startDate !== undefined || endDate !== undefined) {
            const newStart = startDate ? new Date(startDate) : existing.startDate
            const newEnd = endDate ? new Date(endDate) : existing.endDate

            if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
                return NextResponse.json({ error: "Ungueltiges Datumsformat" }, { status: 400 })
            }

            if (newStart > newEnd) {
                return NextResponse.json({ error: "Startdatum muss vor Enddatum liegen" }, { status: 400 })
            }

            // Pruefen auf Ueberlappungen (ausser mit sich selbst)
            const overlapping = await prisma.vacationRequest.findFirst({
                where: {
                    id: { not: id },
                    employeeId: existing.employeeId,
                    status: { not: "REJECTED" },
                    AND: [
                        { startDate: { lte: newEnd } },
                        { endDate: { gte: newStart } }
                    ]
                }
            })

            if (overlapping) {
                return NextResponse.json(
                    { error: "Es existiert bereits ein anderer Urlaubsantrag fuer diesen Zeitraum" },
                    { status: 400 }
                )
            }

            if (startDate) updateData.startDate = newStart
            if (endDate) updateData.endDate = newEnd
        }

        if (reason !== undefined) {
            updateData.reason = reason || null
        }

        if (firebaseId !== undefined) {
            updateData.firebaseId = firebaseId || null
        }

        // Status-Aenderung mit Seiteneffekten
        if (status !== undefined) {
            const validStatuses = ["PENDING", "APPROVED", "REJECTED"]
            if (!validStatuses.includes(status)) {
                return NextResponse.json(
                    { error: `Ungueltiger Status. Erlaubt: ${validStatuses.join(", ")}` },
                    { status: 400 }
                )
            }

            updateData.status = status

            // Bei Genehmigung: approvedBy und approvedAt setzen, usedDays erhoehen
            if (status === "APPROVED" && existing.status !== "APPROVED") {
                updateData.approvedBy = (session.user as any).id
                updateData.approvedAt = new Date()

                // Urlaubstage zum Kontingent hinzufuegen
                const days = calculateVacationDays(
                    updateData.startDate || existing.startDate,
                    updateData.endDate || existing.endDate
                )
                const year = new Date(updateData.startDate || existing.startDate).getFullYear()

                await prisma.vacationQuota.upsert({
                    where: {
                        employeeId_year: {
                            employeeId: existing.employeeId,
                            year
                        }
                    },
                    create: {
                        employeeId: existing.employeeId,
                        year,
                        totalDays: 30,
                        usedDays: days
                    },
                    update: {
                        usedDays: { increment: days }
                    }
                })
            }

            // Bei Ablehnung nach vorheriger Genehmigung: usedDays reduzieren
            if (status === "REJECTED" && existing.status === "APPROVED") {
                const days = calculateVacationDays(existing.startDate, existing.endDate)
                const year = existing.startDate.getFullYear()

                await prisma.vacationQuota.update({
                    where: {
                        employeeId_year: {
                            employeeId: existing.employeeId,
                            year
                        }
                    },
                    data: {
                        usedDays: { decrement: days }
                    }
                })

                // approvedBy und approvedAt zuruecksetzen
                updateData.approvedBy = null
                updateData.approvedAt = null
            }

            // Bei Zuruecksetzen auf PENDING nach Genehmigung: usedDays reduzieren
            if (status === "PENDING" && existing.status === "APPROVED") {
                const days = calculateVacationDays(existing.startDate, existing.endDate)
                const year = existing.startDate.getFullYear()

                await prisma.vacationQuota.update({
                    where: {
                        employeeId_year: {
                            employeeId: existing.employeeId,
                            year
                        }
                    },
                    data: {
                        usedDays: { decrement: days }
                    }
                })

                updateData.approvedBy = null
                updateData.approvedAt = null
            }
        }

        const updatedRequest = await prisma.vacationRequest.update({
            where: { id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true
                    }
                },
                approver: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        })

        const days = calculateVacationDays(updatedRequest.startDate, updatedRequest.endDate)

        return NextResponse.json({
            vacationRequest: {
                ...updatedRequest,
                days
            }
        })
    } catch (error: any) {
        console.error("[PUT /api/admin/vacations/[id]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE - Urlaubsantrag loeschen (nur PENDING oder REJECTED)
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

        // Pruefen ob Antrag existiert und Status erlaubt Loeschung
        const existing = await prisma.vacationRequest.findUnique({
            where: { id }
        })

        if (!existing) {
            return NextResponse.json({ error: "Urlaubsantrag nicht gefunden" }, { status: 404 })
        }

        // Bei genehmigten Antraegen: usedDays reduzieren
        if (existing.status === "APPROVED") {
            const days = Math.ceil(
                Math.abs(existing.endDate.getTime() - existing.startDate.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1
            const year = existing.startDate.getFullYear()

            await prisma.vacationQuota.update({
                where: {
                    employeeId_year: {
                        employeeId: existing.employeeId,
                        year
                    }
                },
                data: {
                    usedDays: { decrement: days }
                }
            }).catch(() => {
                // Quota might not exist, ignore
            })
        }

        await prisma.vacationRequest.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("[DELETE /api/admin/vacations/[id]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
