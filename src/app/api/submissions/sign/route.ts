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

        const user = session.user as any
        const body = await req.json()
        const { submissionId, signature } = body

        if (!submissionId || !signature) {
            return NextResponse.json({ error: "Submission ID and signature required" }, { status: 400 })
        }

        // Validate signature is a valid base64 PNG
        if (!signature.startsWith("data:image/png;base64,")) {
            return NextResponse.json({ error: "Invalid signature format" }, { status: 400 })
        }

        // Get TeamSubmission (new multi-employee system)
        const teamSubmission = await prisma.teamSubmission.findUnique({
            where: { id: submissionId },
            include: {
                dienstplanConfig: true,
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

        // Only send email if WE were the one to transition the status
        if (result.allSigned && result.statusTransitioned) {
            // Send email to Assistenznehmer
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
            const signatureUrl = `${baseUrl}/sign/${teamSubmission.signatureToken}`

            try {
                await sendSignatureRequestEmail({
                    recipientEmail: teamSubmission.dienstplanConfig.assistantRecipientEmail,
                    recipientName: teamSubmission.dienstplanConfig.assistantRecipientName,
                    employeeName: `Team ${teamSubmission.sheetFileName}`,
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
            } catch (emailError: any) {
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
            message: `Erfolgreich unterschrieben! ${result.signedCount} von ${result.totalEmployees} Teammitgliedern haben unterschrieben.`,
            allSigned: false,
            totalCount: result.totalEmployees,
            signedCount: result.signedCount,
            pendingCount: result.totalEmployees - result.signedCount,
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
    } catch (error: any) {
        console.error("[POST /api/submissions/sign] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
