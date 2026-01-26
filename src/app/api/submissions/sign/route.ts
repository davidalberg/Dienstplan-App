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

        // Create EmployeeSignature
        await prisma.employeeSignature.create({
            data: {
                teamSubmissionId: submissionId,
                employeeId: user.id,
                signature,
                signedAt: new Date(),
                ipAddress: clientIp
            }
        })

        // Update all user's timesheets to SUBMITTED status
        await prisma.timesheet.updateMany({
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

        // Check if all employees have signed
        const { allSigned, total, signed } = await areAllEmployeesSigned(submissionId)

        // If all employees have signed → send email to Assistenznehmer
        if (allSigned) {
            // Update status to PENDING_RECIPIENT
            await prisma.teamSubmission.update({
                where: { id: submissionId },
                data: { status: "PENDING_RECIPIENT" }
            })

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
                    message: `Erfolgreich unterschrieben! Alle ${total} Teammitglieder haben unterschrieben. Der Assistenznehmer wurde per E-Mail benachrichtigt.`,
                    allSigned: true,
                    totalCount: total,
                    signedCount: signed
                })
            } catch (emailError: any) {
                console.error("[SIGN] Email sending failed:", emailError)
                return NextResponse.json({
                    message: `Unterschrift gespeichert. Alle ${total} Teammitglieder haben unterschrieben, aber E-Mail konnte nicht gesendet werden.`,
                    warning: "Bitte informieren Sie den Assistenznehmer manuell.",
                    signatureUrl,
                    allSigned: true,
                    totalCount: total,
                    signedCount: signed
                })
            }
        }

        // Not all employees have signed yet
        const allEmployees = await getAllEmployeesInDienstplan(
            teamSubmission.sheetFileName,
            teamSubmission.month,
            teamSubmission.year
        )

        return NextResponse.json({
            message: `Erfolgreich unterschrieben! ${signed} von ${total} Teammitgliedern haben unterschrieben.`,
            allSigned: false,
            totalCount: total,
            signedCount: signed,
            pendingCount: total - signed,
            employees: allEmployees.map(emp => {
                const hasSigned = teamSubmission.employeeSignatures.some(
                    sig => sig.employeeId === emp.id
                )
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
