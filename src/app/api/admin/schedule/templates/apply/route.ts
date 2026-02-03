import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

const ApplyTemplateSchema = z.object({
    templateId: z.string().min(1, "Template-ID erforderlich"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
    skipExisting: z.boolean().optional().default(true) // Bestehende Schichten überspringen
})

/**
 * POST /api/admin/schedule/templates/apply
 * Vorlage auf Zeitraum anwenden - erstellt alle Schichten
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const validation = ApplyTemplateSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json({
                error: "Validierungsfehler",
                details: validation.error.flatten()
            }, { status: 400 })
        }

        const { templateId, startDate, endDate, skipExisting } = validation.data

        // Lade Template
        const template = await prisma.shiftTemplate.findUnique({
            where: { id: templateId }
        })

        if (!template) {
            return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 })
        }

        // Berechne alle Tage im Zeitraum
        const start = new Date(startDate)
        const end = new Date(endDate)

        if (start > end) {
            return NextResponse.json({ error: "Startdatum muss vor Enddatum liegen" }, { status: 400 })
        }

        // Maximal 3 Monate auf einmal
        const maxDays = 92
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff > maxDays) {
            return NextResponse.json({
                error: `Zeitraum zu groß (max. ${maxDays} Tage)`
            }, { status: 400 })
        }

        // Sammle alle Tage die zu den Wochentagen passen
        const datesToCreate: Date[] = []
        const current = new Date(start)

        while (current <= end) {
            const dayOfWeek = current.getDay() // 0=So, 1=Mo, ...
            if (template.weekdays.includes(dayOfWeek)) {
                datesToCreate.push(new Date(current))
            }
            current.setDate(current.getDate() + 1)
        }

        if (datesToCreate.length === 0) {
            return NextResponse.json({
                error: "Keine passenden Tage im Zeitraum gefunden"
            }, { status: 400 })
        }

        // Prüfe auf bestehende Schichten
        let existingDates: Date[] = []
        if (skipExisting) {
            const existing = await prisma.timesheet.findMany({
                where: {
                    employeeId: template.employeeId,
                    date: { in: datesToCreate }
                },
                select: { date: true }
            })
            existingDates = existing.map(e => e.date)
        }

        // Filtere bereits existierende Tage
        const filteredDates = datesToCreate.filter(d =>
            !existingDates.some(ed => ed.getTime() === d.getTime())
        )

        if (filteredDates.length === 0) {
            return NextResponse.json({
                message: "Alle Schichten existieren bereits",
                created: 0,
                skipped: datesToCreate.length
            })
        }

        // Lade Employee und Team für sheetFileName
        const employee = await prisma.user.findUnique({
            where: { id: template.employeeId },
            include: {
                team: {
                    include: { client: true }
                }
            }
        })

        // Erstelle Schichten
        const shiftsToCreate = filteredDates.map(date => {
            const month = date.getMonth() + 1
            const year = date.getFullYear()

            // sheetFileName wie in schedule/route.ts
            let sheetFileName = employee?.name || "Mitarbeiter"
            if (employee?.team?.client) {
                const client = employee.team.client
                sheetFileName = `Team_${client.firstName}_${client.lastName}_${year}`
            }

            return {
                date,
                month,
                year,
                employeeId: template.employeeId,
                teamId: employee?.teamId || null,
                plannedStart: template.plannedStart,
                plannedEnd: template.plannedEnd,
                backupEmployeeId: template.backupEmployeeId,
                note: template.note,
                status: "PLANNED",
                sheetFileName,
                source: "TEMPLATE"
            }
        })

        // Bulk Insert
        const result = await prisma.timesheet.createMany({
            data: shiftsToCreate,
            skipDuplicates: true
        })

        return NextResponse.json({
            success: true,
            created: result.count,
            skipped: datesToCreate.length - filteredDates.length,
            template: template.name
        })

    } catch (error: any) {
        console.error("[POST /api/admin/schedule/templates/apply] Error:", error)

        // Unique constraint violation
        if (error.code === "P2002") {
            return NextResponse.json({
                error: "Einige Schichten existieren bereits"
            }, { status: 409 })
        }

        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
