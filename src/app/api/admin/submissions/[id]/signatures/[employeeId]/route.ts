import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * DELETE /api/admin/submissions/[id]/signatures/[employeeId]
 * Löscht einzelne Mitarbeiter-Unterschrift
 * Setzt Timesheets zurück und ändert Status falls nötig
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; employeeId: string }> }
) {
    try {
        const adminAuth = await requireAdmin()
        if (adminAuth instanceof NextResponse) return adminAuth
        const session = adminAuth

        const { id, employeeId } = await params

        const result = await prisma.$transaction(async (tx) => {
            // 1. Hole Submission mit allen Unterschriften
            const submission = await tx.teamSubmission.findUnique({
                where: { id },
                include: {
                    employeeSignatures: {
                        include: {
                            employee: {
                                select: { id: true, name: true }
                            }
                        }
                    }
                }
            })

            if (!submission) {
                throw new Error("Einreichung nicht gefunden")
            }

            // Prüfung: Nicht möglich wenn bereits COMPLETED
            if (submission.status === "COMPLETED") {
                throw new Error("Abgeschlossene Einreichungen können nicht geändert werden")
            }

            // 2. Hole Mitarbeiter-Info für Audit-Log
            const employeeSignature = submission.employeeSignatures.find(
                sig => sig.employeeId === employeeId
            )

            if (!employeeSignature) {
                throw new Error("Unterschrift nicht gefunden")
            }

            const employeeName = employeeSignature.employee.name

            // 3. Lösche Mitarbeiter-Unterschrift
            await tx.employeeSignature.deleteMany({
                where: {
                    teamSubmissionId: id,
                    employeeId: employeeId
                }
            })

            // 4. Hole alle Mitarbeiter die in diesem Dienstplan arbeiten
            const totalEmployees = await tx.timesheet.findMany({
                where: {
                    sheetFileName: submission.sheetFileName,
                    month: submission.month,
                    year: submission.year
                },
                select: { employeeId: true },
                distinct: ['employeeId']
            })

            const signedCount = submission.employeeSignatures.length - 1 // Minus die gelöschte

            // 5. Status-Update: Falls PENDING_RECIPIENT → PENDING_EMPLOYEES
            let statusChanged = false
            if (submission.status === "PENDING_RECIPIENT" && signedCount < totalEmployees.length) {
                await tx.teamSubmission.update({
                    where: { id },
                    data: { status: "PENDING_EMPLOYEES" }
                })
                statusChanged = true
            }

            // 6. Setze Timesheets zurück auf CONFIRMED
            await tx.timesheet.updateMany({
                where: {
                    sheetFileName: submission.sheetFileName,
                    month: submission.month,
                    year: submission.year,
                    employeeId: employeeId,
                    status: "SUBMITTED"
                },
                data: { status: "CONFIRMED" }
            })

            return {
                success: true,
                signedCount,
                totalCount: totalEmployees.length,
                statusChanged,
                employeeName
            }
        }, {
            isolationLevel: "Serializable" // Prevent race conditions
        })

        return NextResponse.json(result)
    } catch (error: any) {
        console.error("[DELETE-SIGNATURE] Error:", error)
        return NextResponse.json({
            error: error.message || "Internal server error"
        }, { status: 500 })
    }
}
