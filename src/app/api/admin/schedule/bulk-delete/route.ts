import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/schedule/bulk-delete
 * Löscht mehrere Schichten gleichzeitig
 * Admin-only endpoint
 */
export async function POST(req: NextRequest) {
    try {
        const adminAuth = await requireAdmin()
        if (adminAuth instanceof NextResponse) return adminAuth

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

        // ✅ FIX: Atomare Transaktion für Delete + Cleanup (Race Condition verhindert)
        const result = await prisma.$transaction(async (tx) => {
            // 3. Delete all shifts
            const deleteResult = await tx.timesheet.deleteMany({
                where: { id: { in: shiftIds } }
            })

            console.log(`[POST /api/admin/schedule/bulk-delete] Deleted ${deleteResult.count} shifts`)

            // 4. CLEANUP: Check each affected submission (innerhalb Transaktion!)
            for (const submission of affectedSubmissions.values()) {
                const remainingCount = await tx.timesheet.count({
                    where: {
                        sheetFileName: submission.sheetFileName,
                        month: submission.month,
                        year: submission.year
                    }
                })

                if (remainingCount === 0) {
                    // All timesheets deleted → Delete orphaned TeamSubmission
                    console.log(`[POST /api/admin/schedule/bulk-delete] CLEANUP: Deleting orphaned TeamSubmission for ${submission.sheetFileName} ${submission.month}/${submission.year}`)
                    await tx.teamSubmission.delete({
                        where: {
                            sheetFileName_month_year: {
                                sheetFileName: submission.sheetFileName,
                                month: submission.month,
                                year: submission.year
                            }
                        }
                    }).catch(() => {
                        // Submission might not exist (not yet submitted) - ignore error
                        console.log("[POST /api/admin/schedule/bulk-delete] No submission to delete (not yet submitted)")
                    })
                }
            }

            return deleteResult
        })

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
