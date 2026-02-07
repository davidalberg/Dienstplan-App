import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

// Validation Schema für Template
const TemplateSchema = z.object({
    name: z.string().min(1, "Name ist erforderlich"),
    employeeId: z.string().min(1, "Mitarbeiter ist erforderlich"),
    clientId: z.string().optional().nullable(),
    weekdays: z.array(z.number().min(0).max(6)).min(1, "Mindestens ein Wochentag erforderlich"),
    plannedStart: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
    plannedEnd: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
    backupEmployeeId: z.string().optional().nullable(),
    note: z.string().optional().nullable()
})

const ApplyTemplateSchema = z.object({
    templateId: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD")
})

/**
 * GET /api/admin/schedule/templates
 * Liste aller Schicht-Vorlagen
 */
export async function GET(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result

    try {
        const { searchParams } = new URL(req.url)
        const employeeId = searchParams.get("employeeId")
        const clientId = searchParams.get("clientId")

        const templates = await prisma.shiftTemplate.findMany({
            where: {
                ...(employeeId ? { employeeId } : {}),
                ...(clientId ? { clientId } : {})
            },
            orderBy: { createdAt: "desc" }
        })

        // Lade Mitarbeiter-Namen für Anzeige
        const employeeIds = [...new Set(templates.map(t => t.employeeId))]
        const backupIds = templates.map(t => t.backupEmployeeId).filter(Boolean) as string[]
        const allUserIds = [...new Set([...employeeIds, ...backupIds])]

        const users = await prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, name: true }
        })

        const userMap = new Map(users.map(u => [u.id, u.name]))

        const templatesWithNames = templates.map(t => ({
            ...t,
            employeeName: userMap.get(t.employeeId) || "Unbekannt",
            backupEmployeeName: t.backupEmployeeId ? userMap.get(t.backupEmployeeId) : null
        }))

        return NextResponse.json(templatesWithNames)
    } catch (error) {
        console.error("[GET /api/admin/schedule/templates] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/admin/schedule/templates
 * Neue Vorlage erstellen
 */
export async function POST(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const session = result

    try {
        const body = await req.json()
        const validation = TemplateSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json({
                error: "Validierungsfehler",
                details: validation.error.flatten()
            }, { status: 400 })
        }

        const data = validation.data

        const template = await prisma.shiftTemplate.create({
            data: {
                name: data.name,
                employeeId: data.employeeId,
                clientId: data.clientId || null,
                weekdays: data.weekdays,
                plannedStart: data.plannedStart,
                plannedEnd: data.plannedEnd,
                backupEmployeeId: data.backupEmployeeId || null,
                note: data.note || null,
                createdBy: session.user.id || "admin"
            }
        })

        return NextResponse.json(template, { status: 201 })
    } catch (error) {
        console.error("[POST /api/admin/schedule/templates] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/schedule/templates?id=xxx
 * Vorlage löschen
 */
export async function DELETE(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result

    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get("id")

        if (!id) {
            return NextResponse.json({ error: "Template-ID erforderlich" }, { status: 400 })
        }

        await prisma.shiftTemplate.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[DELETE /api/admin/schedule/templates] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
