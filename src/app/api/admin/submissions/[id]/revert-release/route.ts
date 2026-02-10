import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/submissions/[id]/revert-release
 * Widerruft manuelle Freigabe einer Einreichung
 * Nur möglich wenn: status === PENDING_RECIPIENT UND recipientSignedAt === null
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminAuth = await requireAdmin()
        if (adminAuth instanceof NextResponse) return adminAuth
        const session = adminAuth

        const { id } = await params

        const submission = await prisma.teamSubmission.findUnique({
            where: { id },
            select: {
                status: true,
                recipientSignedAt: true,
                sheetFileName: true,
                month: true,
                year: true
            }
        })

        if (!submission) {
            return NextResponse.json({ error: "Einreichung nicht gefunden" }, { status: 404 })
        }

        // Prüfung: Nur möglich wenn Recipient NICHT unterschrieben hat
        if (submission.status !== "PENDING_RECIPIENT") {
            return NextResponse.json({
                error: "Kann nur Einreichungen im Status PENDING_RECIPIENT widerrufen"
            }, { status: 400 })
        }

        if (submission.recipientSignedAt !== null) {
            return NextResponse.json({
                error: "Assistenznehmer hat bereits unterschrieben. Nutze 'Komplett zurücksetzen' stattdessen."
            }, { status: 400 })
        }

        // Update: Zurück zu PENDING_EMPLOYEES
        await prisma.teamSubmission.update({
            where: { id },
            data: {
                status: "PENDING_EMPLOYEES"
            }
        })

        return NextResponse.json({
            success: true,
            message: "Freigabe erfolgreich widerrufen"
        })
    } catch (error: any) {
        console.error("[REVERT-RELEASE] Error:", error)
        return NextResponse.json({
            error: error.message || "Internal server error"
        }, { status: 500 })
    }
}
