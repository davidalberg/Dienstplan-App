import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

// Schema für neue Activity
const createActivitySchema = z.object({
    type: z.enum(["INFO", "WARNING", "ERROR", "SUCCESS"]),
    category: z.enum(["SHIFT", "SUBMISSION", "CLIENT", "EMPLOYEE", "SYSTEM"]),
    action: z.string(),
    details: z.string().optional(),
    entityId: z.string().optional(),
    entityType: z.string().optional(),
})

/**
 * GET /api/admin/activity
 * Aktivitätsprotokoll abrufen
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const limit = parseInt(searchParams.get("limit") || "50")
        const offset = parseInt(searchParams.get("offset") || "0")
        const type = searchParams.get("type") || undefined
        const category = searchParams.get("category") || undefined

        const where: any = {}
        if (type) where.type = type
        if (category) where.category = category

        const [activities, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.activityLog.count({ where })
        ])

        return NextResponse.json({ activities, total })
    } catch (error: any) {
        console.error("[GET /api/admin/activity] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/admin/activity
 * Neue Aktivität loggen
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        const validated = createActivitySchema.safeParse(body)

        if (!validated.success) {
            return NextResponse.json({ error: validated.error }, { status: 400 })
        }

        const activity = await prisma.activityLog.create({
            data: {
                ...validated.data,
                userId: session.user.id,
                userName: session.user.name || session.user.email || "Admin",
            }
        })

        return NextResponse.json(activity)
    } catch (error: any) {
        console.error("[POST /api/admin/activity] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/activity
 * Alle Aktivitäten löschen (Cleanup)
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const olderThanDays = parseInt(searchParams.get("olderThanDays") || "30")

        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

        const result = await prisma.activityLog.deleteMany({
            where: {
                createdAt: { lt: cutoffDate }
            }
        })

        return NextResponse.json({ deleted: result.count })
    } catch (error: any) {
        console.error("[DELETE /api/admin/activity] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
