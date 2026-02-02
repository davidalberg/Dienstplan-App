import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET - Alle Urlaubskontingente (mit Filter year/employeeId)
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const year = searchParams.get("year")
        const employeeId = searchParams.get("employeeId")

        // Filter aufbauen
        const where: any = {}

        if (year) {
            const yearNum = parseInt(year)
            if (isNaN(yearNum)) {
                return NextResponse.json({ error: "Ungueltiges Jahr" }, { status: 400 })
            }
            where.year = yearNum
        }

        if (employeeId) {
            where.employeeId = employeeId
        }

        const quotas = await prisma.vacationQuota.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true
                    }
                }
            },
            orderBy: [
                { year: "desc" },
                { employee: { name: "asc" } }
            ]
        })

        // Berechne verbleibende Tage
        const quotasWithRemaining = quotas.map(quota => ({
            ...quota,
            remainingDays: quota.totalDays - quota.usedDays
        }))

        return NextResponse.json({ quotas: quotasWithRemaining })
    } catch (error: any) {
        console.error("[GET /api/admin/vacations/quota] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Urlaubskontingent erstellen oder aktualisieren
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { employeeId, year, totalDays, usedDays } = body

        // Validierung
        if (!employeeId) {
            return NextResponse.json({ error: "Mitarbeiter-ID ist erforderlich" }, { status: 400 })
        }

        if (!year) {
            return NextResponse.json({ error: "Jahr ist erforderlich" }, { status: 400 })
        }

        const yearNum = parseInt(year)
        if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
            return NextResponse.json({ error: "Ungueltiges Jahr" }, { status: 400 })
        }

        // Pruefen ob Mitarbeiter existiert
        const employee = await prisma.user.findUnique({
            where: { id: employeeId }
        })

        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
        }

        // Werte validieren
        let totalDaysNum = 30 // Default
        if (totalDays !== undefined) {
            totalDaysNum = parseInt(totalDays)
            if (isNaN(totalDaysNum) || totalDaysNum < 0 || totalDaysNum > 365) {
                return NextResponse.json({ error: "Ungueltige Gesamttage (0-365)" }, { status: 400 })
            }
        }

        let usedDaysNum: number | undefined
        if (usedDays !== undefined) {
            usedDaysNum = parseFloat(usedDays)
            if (isNaN(usedDaysNum) || usedDaysNum < 0) {
                return NextResponse.json({ error: "Ungueltige verwendete Tage" }, { status: 400 })
            }
        }

        // Upsert: Erstellen oder Aktualisieren
        const quota = await prisma.vacationQuota.upsert({
            where: {
                employeeId_year: {
                    employeeId,
                    year: yearNum
                }
            },
            create: {
                employeeId,
                year: yearNum,
                totalDays: totalDaysNum,
                usedDays: usedDaysNum ?? 0
            },
            update: {
                totalDays: totalDaysNum,
                ...(usedDaysNum !== undefined && { usedDays: usedDaysNum })
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true
                    }
                }
            }
        })

        return NextResponse.json({
            quota: {
                ...quota,
                remainingDays: quota.totalDays - quota.usedDays
            }
        })
    } catch (error: any) {
        console.error("[POST /api/admin/vacations/quota] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Bulk-Update: Kontingente fuer alle Mitarbeiter eines Jahres erstellen
export async function PUT(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { year, totalDays } = body

        if (!year) {
            return NextResponse.json({ error: "Jahr ist erforderlich" }, { status: 400 })
        }

        const yearNum = parseInt(year)
        if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
            return NextResponse.json({ error: "Ungueltiges Jahr" }, { status: 400 })
        }

        let totalDaysNum = 30
        if (totalDays !== undefined) {
            totalDaysNum = parseInt(totalDays)
            if (isNaN(totalDaysNum) || totalDaysNum < 0 || totalDaysNum > 365) {
                return NextResponse.json({ error: "Ungueltige Gesamttage (0-365)" }, { status: 400 })
            }
        }

        // Alle aktiven Mitarbeiter holen
        const employees = await prisma.user.findMany({
            where: {
                role: "EMPLOYEE",
                exitDate: null // Nur aktive Mitarbeiter
            },
            select: { id: true }
        })

        // Bulk upsert fuer alle Mitarbeiter
        const results = await Promise.all(
            employees.map(emp =>
                prisma.vacationQuota.upsert({
                    where: {
                        employeeId_year: {
                            employeeId: emp.id,
                            year: yearNum
                        }
                    },
                    create: {
                        employeeId: emp.id,
                        year: yearNum,
                        totalDays: totalDaysNum,
                        usedDays: 0
                    },
                    update: {
                        totalDays: totalDaysNum
                        // usedDays bleibt unveraendert
                    }
                })
            )
        )

        return NextResponse.json({
            success: true,
            created: results.length,
            year: yearNum,
            totalDays: totalDaysNum
        })
    } catch (error: any) {
        console.error("[PUT /api/admin/vacations/quota] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
