import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/schedule/bulk-delete
 * Löscht mehrere Schichten gleichzeitig
 * Admin-only endpoint
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user || (session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        const { shiftIds } = body

        // Validierung
        if (!shiftIds || !Array.isArray(shiftIds) || shiftIds.length === 0) {
            return NextResponse.json(
                { error: "shiftIds array erforderlich" },
                { status: 400 }
            )
        }

        // 1. Fetch existing shifts with submission info BEFORE deleting
        const existingShifts = await prisma.timesheet.findMany({
            where: { id: { in: shiftIds } },
            select: {
                id: true,
                sheetFileName: true,
                month: true,
                year: true
            }
        })

        if (existingShifts.length !== shiftIds.length) {
            const missingIds = shiftIds.filter(
                id => !existingShifts.find(shift => shift.id === id)
            )
            return NextResponse.json(
                { error: `Schichten nicht gefunden: ${missingIds.join(", ")}` },
                { status: 404 }
            )
        }

        // 2. Group affected submissions (distinct by sheetFileName + month + year)
        const affectedSubmissions = new Map<string, { sheetFileName: string; month: number; year: number }>()
        existingShifts.forEach(shift => {
            if (shift.sheetFileName) {
                const key = `${shift.sheetFileName}_${shift.month}_${shift.year}`
                if (!affectedSubmissions.has(key)) {
                    affectedSubmissions.set(key, {
                        sheetFileName: shift.sheetFileName,
                        month: shift.month,
                        year: shift.year
                    })
                }
            }
        })

        // 3. Delete all shifts
        const result = await prisma.timesheet.deleteMany({
            where: { id: { in: shiftIds } }
        })

        console.log(`[POST /api/admin/schedule/bulk-delete] Deleted ${result.count} shifts`)

        // 4. CLEANUP: Check each affected submission
        for (const submission of affectedSubmissions.values()) {
            const remainingCount = await prisma.timesheet.count({
                where: {
                    sheetFileName: submission.sheetFileName,
                    month: submission.month,
                    year: submission.year
                }
            })

            if (remainingCount === 0) {
                // All timesheets deleted → Delete orphaned TeamSubmission
                console.log(`[POST /api/admin/schedule/bulk-delete] CLEANUP: Deleting orphaned TeamSubmission for ${submission.sheetFileName} ${submission.month}/${submission.year}`)
                await prisma.teamSubmission.delete({
                    where: {
                        sheetFileName_month_year: {
                            sheetFileName: submission.sheetFileName,
                            month: submission.month,
                            year: submission.year
                        }
                    }
                }).catch((err) => {
                    // Submission might not exist (not yet submitted) - ignore error
                    console.log("[POST /api/admin/schedule/bulk-delete] No submission to delete (not yet submitted)")
                })
            }
        }

        return NextResponse.json({
            success: true,
            deleted: result.count,
            message: `${result.count} Schichten gelöscht`
        })
    } catch (error: any) {
        console.error("[POST /api/admin/schedule/bulk-delete] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
