import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

/**
 * POST /api/admin/submissions/withdraw-signature
 *
 * Admin endpoint to withdraw employee or client signatures
 * Allows admin to reset individual signatures for corrections
 */

const withdrawSchema = z.object({
    employeeId: z.string().min(1),
    clientId: z.string().min(1),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    type: z.enum(["employee", "client"])
})

export async function POST(req: NextRequest) {
    try {
        const adminAuth = await requireAdmin()
        if (adminAuth instanceof NextResponse) return adminAuth
        const session = adminAuth

        const body = await req.json()
        const parseResult = withdrawSchema.safeParse(body)

        if (!parseResult.success) {
            return NextResponse.json(
                { error: "Ungültige Anfrage", details: parseResult.error.flatten() },
                { status: 400 }
            )
        }

        const { employeeId, clientId, month, year, type } = parseResult.data

        // Find employee's timesheets to get sheetFileName
        const employeeTimesheets = await prisma.timesheet.findMany({
            where: {
                employeeId,
                month,
                year
            },
            select: {
                id: true,
                sheetFileName: true
            }
        })

        if (employeeTimesheets.length === 0) {
            return NextResponse.json(
                { error: "Keine Schichten für diesen Monat gefunden" },
                { status: 404 }
            )
        }

        const sheetFileNames = [...new Set(employeeTimesheets.map(t => t.sheetFileName).filter(Boolean))]

        if (sheetFileNames.length === 0) {
            return NextResponse.json(
                { error: "Keine Dienstplan-Zuordnung gefunden" },
                { status: 404 }
            )
        }

        // Find TeamSubmission
        const teamSubmission = await prisma.teamSubmission.findFirst({
            where: {
                sheetFileName: { in: sheetFileNames as string[] },
                month,
                year
            },
            include: {
                employeeSignatures: {
                    where: { employeeId }
                }
            }
        })

        if (!teamSubmission) {
            return NextResponse.json(
                { error: "Keine Einreichung für diesen Monat gefunden" },
                { status: 404 }
            )
        }

        if (type === "employee") {
            // Withdraw employee signature
            const employeeSignature = teamSubmission.employeeSignatures[0]

            if (!employeeSignature) {
                return NextResponse.json(
                    { error: "Assistent hat noch nicht unterschrieben" },
                    { status: 400 }
                )
            }

            await prisma.$transaction(async (tx) => {
                // 1. Delete EmployeeSignature
                await tx.employeeSignature.delete({
                    where: { id: employeeSignature.id }
                })

                // 2. Update timesheets back to CONFIRMED
                await tx.timesheet.updateMany({
                    where: {
                        employeeId,
                        month,
                        year,
                        sheetFileName: teamSubmission.sheetFileName,
                        status: "SUBMITTED"
                    },
                    data: {
                        status: "CONFIRMED",
                        lastUpdatedBy: (session.user as any).email
                    }
                })

                // 3. Update TeamSubmission status
                await tx.teamSubmission.update({
                    where: { id: teamSubmission.id },
                    data: { status: "PENDING_EMPLOYEES" }
                })

                // 4. Audit log
                await tx.auditLog.create({
                    data: {
                        employeeId,
                        date: new Date(),
                        changedBy: (session.user as any).email || "Admin",
                        field: "ADMIN_WITHDRAW_EMPLOYEE_SIGNATURE",
                        oldValue: `Signed at ${employeeSignature.signedAt?.toISOString()}`,
                        newValue: `Admin withdrew for ${month}/${year}`
                    }
                })
            })

            return NextResponse.json({
                success: true,
                message: "Assistenten-Unterschrift erfolgreich zurückgezogen"
            })

        } else {
            // Withdraw client signature
            if (!teamSubmission.recipientSignature) {
                return NextResponse.json(
                    { error: "Klient hat noch nicht unterschrieben" },
                    { status: 400 }
                )
            }

            await prisma.$transaction(async (tx) => {
                // 1. Remove client signature
                await tx.teamSubmission.update({
                    where: { id: teamSubmission.id },
                    data: {
                        recipientSignature: null,
                        recipientSignedAt: null,
                        status: "PENDING_RECIPIENT" // Back to waiting for client
                    }
                })

                // 2. Audit log
                await tx.auditLog.create({
                    data: {
                        employeeId,
                        date: new Date(),
                        changedBy: (session.user as any).email || "Admin",
                        field: "ADMIN_WITHDRAW_CLIENT_SIGNATURE",
                        oldValue: `Client signed at ${teamSubmission.recipientSignedAt?.toISOString()}`,
                        newValue: `Admin withdrew client signature for ${month}/${year}`
                    }
                })
            })

            return NextResponse.json({
                success: true,
                message: "Klienten-Unterschrift erfolgreich zurückgezogen"
            })
        }

    } catch (error: any) {
        console.error("[POST /api/admin/submissions/withdraw-signature] Error:", error)
        return NextResponse.json(
            { error: "Ein unerwarteter Fehler ist aufgetreten" },
            { status: 500 }
        )
    }
}
