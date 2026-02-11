import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

/**
 * POST /api/submissions/withdraw
 *
 * Allows an employee to withdraw their signature from a TeamSubmission.
 * Only allowed if:
 * - The employee has signed
 * - The client (Assistenznehmer) has NOT signed yet
 *
 * Actions:
 * 1. Delete the EmployeeSignature record
 * 2. Set all employee's Timesheets for that month back to "CONFIRMED"
 * 3. Update TeamSubmission status to "PENDING_EMPLOYEES" if needed
 */

const withdrawSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
})

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult

        // Only employees can withdraw their signatures
        if (user.role !== "EMPLOYEE") {
            return NextResponse.json(
                { error: "Nur Mitarbeiter koennen ihre Unterschrift zurueckziehen" },
                { status: 403 }
            )
        }

        const body = await req.json()
        const parseResult = withdrawSchema.safeParse(body)

        if (!parseResult.success) {
            return NextResponse.json(
                { error: "Ungueltige Anfrage", details: parseResult.error.flatten() },
                { status: 400 }
            )
        }

        const { month, year } = parseResult.data

        // Find the employee's timesheets to determine the sheetFileName
        const employeeTimesheets = await prisma.timesheet.findMany({
            where: {
                employeeId: user.id,
                month,
                year,
            },
            select: {
                id: true,
                sheetFileName: true,
                status: true,
            }
        })

        if (employeeTimesheets.length === 0) {
            return NextResponse.json(
                { error: "Keine Schichten fuer diesen Monat gefunden" },
                { status: 404 }
            )
        }

        // Get unique sheetFileNames (usually just one per employee/month)
        const sheetFileNames = [...new Set(employeeTimesheets.map(t => t.sheetFileName).filter(Boolean))]

        if (sheetFileNames.length === 0) {
            return NextResponse.json(
                { error: "Keine Dienstplan-Zuordnung gefunden" },
                { status: 404 }
            )
        }

        // Find TeamSubmission(s) for these sheetFileNames
        const teamSubmissions = await prisma.teamSubmission.findMany({
            where: {
                sheetFileName: { in: sheetFileNames as string[] },
                month,
                year,
            },
            include: {
                employeeSignatures: {
                    where: { employeeId: user.id }
                }
            }
        })

        if (teamSubmissions.length === 0) {
            return NextResponse.json(
                { error: "Keine Einreichung fuer diesen Monat gefunden" },
                { status: 404 }
            )
        }

        // Find submission where user has signed
        const submissionWithSignature = teamSubmissions.find(
            sub => sub.employeeSignatures.length > 0
        )

        if (!submissionWithSignature) {
            return NextResponse.json(
                { error: "Sie haben fuer diesen Monat noch nicht unterschrieben" },
                { status: 400 }
            )
        }

        // CRITICAL CHECK: Has the client already signed?
        if (submissionWithSignature.recipientSignature) {
            return NextResponse.json(
                {
                    error: "Der Assistenznehmer hat bereits unterschrieben. Die Unterschrift kann nicht mehr zurueckgezogen werden.",
                    code: "RECIPIENT_ALREADY_SIGNED"
                },
                { status: 403 }
            )
        }

        // Also check if status is COMPLETED (extra safety)
        if (submissionWithSignature.status === "COMPLETED") {
            return NextResponse.json(
                {
                    error: "Diese Einreichung ist bereits abgeschlossen und kann nicht mehr geaendert werden.",
                    code: "SUBMISSION_COMPLETED"
                },
                { status: 403 }
            )
        }

        const employeeSignature = submissionWithSignature.employeeSignatures[0]
        if (!employeeSignature) {
            return NextResponse.json(
                { error: "Unterschrift nicht gefunden" },
                { status: 404 }
            )
        }

        // Use transaction with Serializable isolation to prevent race conditions
        await prisma.$transaction(async (tx) => {
            // 1. Delete the EmployeeSignature
            await tx.employeeSignature.delete({
                where: { id: employeeSignature.id }
            })

            // FRESH CHECK inside transaction: Verify recipient hasn't signed since our initial check
            const freshSubmission = await tx.teamSubmission.findUnique({
                where: { id: submissionWithSignature.id },
                select: { recipientSignature: true, status: true }
            })
            if (freshSubmission?.recipientSignature) {
                throw new Error("RECIPIENT_ALREADY_SIGNED")
            }
            if (freshSubmission?.status === "COMPLETED") {
                throw new Error("SUBMISSION_COMPLETED")
            }

            // 2. Update employee's timesheets back to CONFIRMED
            // Only update SUBMITTED timesheets, not other statuses
            await tx.timesheet.updateMany({
                where: {
                    employeeId: user.id,
                    month,
                    year,
                    sheetFileName: submissionWithSignature.sheetFileName,
                    status: "SUBMITTED"
                },
                data: {
                    status: "CONFIRMED",
                    lastUpdatedBy: user.email
                }
            })

            // 3. Update TeamSubmission status back to PENDING_EMPLOYEES
            // CRITICAL: Only update if status is still in an allowed state (prevents overwriting COMPLETED)
            const updated = await tx.teamSubmission.updateMany({
                where: {
                    id: submissionWithSignature.id,
                    status: { in: ["PENDING_EMPLOYEES", "PENDING_RECIPIENT"] }
                },
                data: { status: "PENDING_EMPLOYEES" }
            })

            if (updated.count === 0) {
                throw new Error("Submission status has changed - withdrawal not possible")
            }

            // 4. Create audit log entry
            await tx.auditLog.create({
                data: {
                    employeeId: user.id,
                    date: new Date(),
                    changedBy: user.email || user.name || "System",
                    field: "SIGNATURE_WITHDRAWN",
                    oldValue: `Signed at ${employeeSignature.signedAt?.toISOString()}`,
                    newValue: `Withdrawn for ${month}/${year}`
                }
            })
        }, { isolationLevel: 'Serializable' })

        return NextResponse.json({
            success: true,
            message: "Ihre Unterschrift wurde erfolgreich zurueckgezogen. Sie koennen nun Aenderungen vornehmen und erneut einreichen."
        })

    } catch (error: any) {
        console.error("[POST /api/submissions/withdraw] Error:", error)

        // Handle race condition: submission status changed between check and update
        if (error?.message === "Submission status has changed - withdrawal not possible") {
            return NextResponse.json(
                {
                    error: "Der Status der Einreichung hat sich geaendert. Der Rueckzug ist nicht mehr moeglich.",
                    code: "STATUS_CHANGED"
                },
                { status: 409 }
            )
        }

        // Handle race condition: recipient signed between check and transaction
        if (error?.message === "RECIPIENT_ALREADY_SIGNED") {
            return NextResponse.json(
                {
                    error: "Der Assistenznehmer hat zwischenzeitlich unterschrieben. Die Unterschrift kann nicht mehr zurueckgezogen werden.",
                    code: "RECIPIENT_ALREADY_SIGNED"
                },
                { status: 409 }
            )
        }

        if (error?.message === "SUBMISSION_COMPLETED") {
            return NextResponse.json(
                {
                    error: "Diese Einreichung wurde zwischenzeitlich abgeschlossen. Der Rueckzug ist nicht mehr moeglich.",
                    code: "SUBMISSION_COMPLETED"
                },
                { status: 409 }
            )
        }

        return NextResponse.json(
            { error: "Ein unerwarteter Fehler ist aufgetreten" },
            { status: 500 }
        )
    }
}
