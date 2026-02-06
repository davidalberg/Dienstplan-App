import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { sendSignatureRequestEmail } from "@/lib/email"
import { headers } from "next/headers"
import {
    getAllEmployeesInDienstplan,
    areAllEmployeesSigned
} from "@/lib/team-submission-utils"

/**
 * POST /api/submissions/sign
 * Employee signs their timesheet (NEW: Multi-Employee Logic)
 *
 * Flow:
 * 1. Create EmployeeSignature for current user
 * 2. Check if all employees have signed
 * 3. If YES: Status → PENDING_RECIPIENT, send email to Assistenznehmer
 * 4. If NO: Status stays PENDING_EMPLOYEES, return progress
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const user = session.user
        const body = await req.json()
        const { submissionId, signature } = body

        if (!submissionId || !signature) {
            return NextResponse.json({ error: "Submission ID and signature required" }, { status: 400 })
        }

        // Validate signature is a valid base64 PNG
        if (!signature.startsWith("data:image/png;base64,")) {
            return NextResponse.json({ error: "Invalid signature format" }, { status: 400 })
        }
        if (signature.length > 500_000) {
            return NextResponse.json({ error: "Signatur zu groß (max 500KB)" }, { status: 400 })
        }

        // Get TeamSubmission (new multi-employee system)
        const teamSubmission = await prisma.teamSubmission.findUnique({
            where: { id: submissionId },
            include: {
                dienstplanConfig: true,
                client: true,
                employeeSignatures: {
                    include: {
                        employee: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        })

        if (!teamSubmission) {
            return NextResponse.json({ error: "Submission not found" }, { status: 404 })
        }

        // Check if status allows signing
        if (teamSubmission.status !== "PENDING_EMPLOYEES") {
            return NextResponse.json({
                error: "Diese Einreichung ist nicht mehr im Signaturstatus."
            }, { status: 400 })
        }

        // Check if user already signed
        const alreadySigned = teamSubmission.employeeSignatures.some(
            sig => sig.employeeId === user.id
        )

        if (alreadySigned) {
            return NextResponse.json({
                error: "Sie haben bereits für diese Einreichung unterschrieben."
            }, { status: 400 })
        }

        // Get IP address
        const headersList = await headers()
        const forwardedFor = headersList.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"

        // Use transaction to prevent race condition when multiple employees sign simultaneously
        const result = await prisma.$transaction(async (tx) => {
            // Double-check inside transaction (race condition safety)
            const existingSignature = await tx.employeeSignature.findUnique({
                where: {
                    teamSubmissionId_employeeId: {
                        teamSubmissionId: submissionId,
                        employeeId: user.id
                    }
                }
            })

            if (existingSignature) {
                // User already signed (race condition between outer check and transaction)
                return { alreadySigned: true as const, allSigned: false, totalEmployees: 0, signedCount: 0, statusTransitioned: false }
            }

            // Create EmployeeSignature
            await tx.employeeSignature.create({
                data: {
                    teamSubmissionId: submissionId,
                    employeeId: user.id,
                    signature,
                    signedAt: new Date(),
                    ipAddress: clientIp
                }
            })

            // Update all user's timesheets to SUBMITTED status
            await tx.timesheet.updateMany({
                where: {
                    employeeId: user.id,
                    month: teamSubmission.month,
                    year: teamSubmission.year,
                    sheetFileName: teamSubmission.sheetFileName
                },
                data: {
                    status: "SUBMITTED",
                    lastUpdatedBy: user.email
                }
            })

            // Get all employee IDs in this Dienstplan
            const allEmployeeTimesheets = await tx.timesheet.findMany({
                where: {
                    sheetFileName: teamSubmission.sheetFileName,
                    month: teamSubmission.month,
                    year: teamSubmission.year
                },
                select: { employeeId: true },
                distinct: ['employeeId']
            })
            const totalEmployees = allEmployeeTimesheets.length

            // Count how many have signed (including current user)
            const signedCount = await tx.employeeSignature.count({
                where: { teamSubmissionId: submissionId }
            })

            const allSigned = signedCount === totalEmployees

            // If all signed, atomically update status (only succeeds for ONE request due to WHERE condition)
            let statusTransitioned = false
            if (allSigned) {
                const updateResult = await tx.teamSubmission.updateMany({
                    where: {
                        id: submissionId,
                        status: "PENDING_EMPLOYEES" // CRITICAL: Only update if still in PENDING_EMPLOYEES
                    },
                    data: { status: "PENDING_RECIPIENT" }
                })

                statusTransitioned = updateResult.count > 0 // True if we were the one to transition
            }

            return {
                alreadySigned: false,
                allSigned,
                totalEmployees,
                signedCount,
                statusTransitioned
            }
        }, {
            isolationLevel: 'Serializable',
            maxWait: 5000,
            timeout: 10000
        })

        // Handle race condition case where user signed between outer check and transaction
        if (result.alreadySigned) {
            return NextResponse.json({
                error: "Sie haben bereits für diese Einreichung unterschrieben."
            }, { status: 400 })
        }

        // Only send email if WE were the one to transition the status
        if (result.allSigned && result.statusTransitioned) {
            // Send email to Assistenznehmer
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
            const signatureUrl = `${baseUrl}/sign/${teamSubmission.signatureToken}`

            // Get recipient info from dienstplanConfig or client
            const recipientEmail = teamSubmission.dienstplanConfig?.assistantRecipientEmail || teamSubmission.client?.email
            const recipientName = teamSubmission.dienstplanConfig?.assistantRecipientName ||
                (teamSubmission.client ? `${teamSubmission.client.firstName} ${teamSubmission.client.lastName}` : null)

            if (!recipientEmail || !recipientName) {
                return NextResponse.json({
                    message: `Unterschrift gespeichert. Alle ${result.totalEmployees} Teammitglieder haben unterschrieben, aber keine E-Mail-Adresse für den Assistenznehmer hinterlegt.`,
                    warning: "Bitte informieren Sie den Assistenznehmer manuell.",
                    signatureUrl,
                    allSigned: true,
                    totalCount: result.totalEmployees,
                    signedCount: result.signedCount
                }, { status: 207 })
            }

            try {
                await sendSignatureRequestEmail({
                    recipientEmail,
                    recipientName,
                    employeeName: "Team", // Not used in email template anymore
                    month: teamSubmission.month,
                    year: teamSubmission.year,
                    signatureUrl,
                    expiresAt: teamSubmission.tokenExpiresAt
                })

                return NextResponse.json({
                    message: `Erfolgreich unterschrieben! Alle ${result.totalEmployees} Teammitglieder haben unterschrieben. Der Assistenznehmer wurde per E-Mail benachrichtigt.`,
                    allSigned: true,
                    totalCount: result.totalEmployees,
                    signedCount: result.signedCount
                })
            } catch (emailError: unknown) {
                console.error("[SIGN] Email sending failed:", emailError)
                return NextResponse.json({
                    message: `Unterschrift gespeichert. Alle ${result.totalEmployees} Teammitglieder haben unterschrieben, aber E-Mail konnte nicht gesendet werden.`,
                    warning: "Bitte informieren Sie den Assistenznehmer manuell oder kontaktieren Sie den Administrator.",
                    signatureUrl,
                    allSigned: true,
                    totalCount: result.totalEmployees,
                    signedCount: result.signedCount,
                    emailError: true
                }, { status: 207 }) // 207 Multi-Status: Partial success
            }
        }

        // Either not all signed, or another request already transitioned the status
        if (result.allSigned && !result.statusTransitioned) {
            // Another employee just signed at the same time and sent the email
            return NextResponse.json({
                message: `Erfolgreich unterschrieben! Alle ${result.totalEmployees} Teammitglieder haben unterschrieben. Der Assistenznehmer wurde bereits benachrichtigt.`,
                allSigned: true,
                totalCount: result.totalEmployees,
                signedCount: result.signedCount
            })
        }

        // Not all employees have signed yet
        const allEmployees = await getAllEmployeesInDienstplan(
            teamSubmission.sheetFileName,
            teamSubmission.month,
            teamSubmission.year
        )

        // Reload team submission to get updated signature list
        const updatedSubmission = await prisma.teamSubmission.findUnique({
            where: { id: submissionId },
            include: {
                employeeSignatures: {
                    include: {
                        employee: {
                            select: { id: true, name: true, email: true }
                        }
                    }
                }
            }
        })

        return NextResponse.json({
            message: `Erfolgreich unterschrieben! ${result.signedCount ?? 0} von ${result.totalEmployees ?? 0} Teammitgliedern haben unterschrieben.`,
            allSigned: false,
            totalCount: result.totalEmployees ?? 0,
            signedCount: result.signedCount ?? 0,
            pendingCount: (result.totalEmployees ?? 0) - (result.signedCount ?? 0),
            employees: allEmployees.map(emp => {
                const hasSigned = updatedSubmission?.employeeSignatures.some(
                    sig => sig.employeeId === emp.id
                ) || false
                return {
                    id: emp.id,
                    name: emp.name,
                    email: emp.email,
                    signed: hasSigned
                }
            })
        })
    } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : "Internal server error"
        const errCode = error && typeof error === "object" && "code" in error ? (error as { code: string }).code : undefined
        console.error("[POST /api/submissions/sign] Error:", errMessage)

        // Handle Prisma unique constraint violation (race condition fallback)
        if (errCode === 'P2002') {
            return NextResponse.json({
                error: "Sie haben bereits für diese Einreichung unterschrieben."
            }, { status: 400 })
        }

        // Return more specific error message for debugging
        const errorMessage = errMessage
        return NextResponse.json({
            error: "Interner Server-Fehler beim Unterschreiben. Bitte versuchen Sie es erneut.",
            debug: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        }, { status: 500 })
    }
}
