import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { sendSignatureRequestEmail, isEmailServiceConfigured } from "@/lib/email"
import { randomBytes } from "crypto"
import { getEmployeesInDienstplan } from "@/lib/team-submission-utils"

/**
 * POST /api/admin/submissions/send-email
 * Send signature request email to client (Assistenznehmer)
 *
 * Supports two modes:
 * 1. Combined mode (new): { sheetFileName, clientId, month, year }
 * 2. Legacy mode: { employeeId, clientId, month, year, type: "client" }
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { employeeId, clientId, month, year, type, sheetFileName } = body

    // Validate RESEND_API_KEY is configured
    if (!isEmailServiceConfigured()) {
        console.error("[POST /api/admin/submissions/send-email] RESEND_API_KEY is not configured")
        return NextResponse.json({
            error: "E-Mail-Service nicht konfiguriert. Bitte RESEND_API_KEY in Vercel setzen."
        }, { status: 500 })
    }

    // Validate required parameters
    if (!clientId || !month || !year) {
        return NextResponse.json({
            error: "clientId, month und year sind erforderlich"
        }, { status: 400 })
    }

    // Determine mode: Combined (sheetFileName) or Legacy (employeeId + type)
    const isCombinedMode = !!sheetFileName
    const isLegacyMode = !!employeeId && !!type

    if (!isCombinedMode && !isLegacyMode) {
        return NextResponse.json({
            error: "Entweder sheetFileName oder (employeeId + type) sind erforderlich"
        }, { status: 400 })
    }

    // Legacy mode validation
    if (isLegacyMode && type !== "client") {
        if (type === "employee") {
            return NextResponse.json({
                error: "Mitarbeiter-E-Mails sind deaktiviert. Mitarbeiter unterschreiben direkt im System."
            }, { status: 400 })
        }
        return NextResponse.json({
            error: "type muss 'client' sein"
        }, { status: 400 })
    }

    try {
        // Load client
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { id: true, firstName: true, lastName: true, email: true }
        })

        if (!client) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        if (!client.email) {
            return NextResponse.json({
                error: "Für diesen Klienten ist keine E-Mail-Adresse hinterlegt"
            }, { status: 400 })
        }

        const clientName = `${client.firstName} ${client.lastName}`

        // Determine the sheetFileName to use
        let targetSheetFileName = sheetFileName

        if (!targetSheetFileName && employeeId) {
            // Legacy mode: Find sheetFileName from employee's timesheets
            const sampleTimesheet = await prisma.timesheet.findFirst({
                where: {
                    employeeId,
                    month,
                    year
                },
                select: { sheetFileName: true }
            })
            targetSheetFileName = sampleTimesheet?.sheetFileName || clientName
        }

        // Find existing TeamSubmission or create one
        let teamSubmission = await prisma.teamSubmission.findUnique({
            where: {
                sheetFileName_month_year: {
                    sheetFileName: targetSheetFileName,
                    month,
                    year
                }
            },
            include: {
                employeeSignatures: {
                    include: {
                        employee: { select: { id: true, name: true, email: true } }
                    }
                }
            }
        })

        if (!teamSubmission) {
            // Try finding by clientId as fallback (legacy data)
            teamSubmission = await prisma.teamSubmission.findFirst({
                where: {
                    clientId,
                    month,
                    year
                },
                include: {
                    employeeSignatures: {
                        include: {
                            employee: { select: { id: true, name: true, email: true } }
                        }
                    }
                }
            })
        }

        if (!teamSubmission) {
            // Create new TeamSubmission
            const signatureToken = randomBytes(32).toString("hex")
            const tokenExpiresAt = new Date()
            tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7) // 7 Tage Gueltigkeit

            teamSubmission = await prisma.teamSubmission.create({
                data: {
                    month,
                    year,
                    clientId,
                    sheetFileName: targetSheetFileName,
                    signatureToken,
                    tokenExpiresAt,
                    status: "PENDING_EMPLOYEES"
                },
                include: {
                    employeeSignatures: {
                        include: {
                            employee: { select: { id: true, name: true, email: true } }
                        }
                    }
                }
            })
        }

        // Get all employee IDs for this dienstplan
        const allEmployeeIds = await getEmployeesInDienstplan(
            teamSubmission.sheetFileName,
            month,
            year
        )

        // Check if all employees have signed (signature !== null)
        const signedEmployeeIds = teamSubmission.employeeSignatures
            .filter(sig => sig.signature !== null)
            .map(sig => sig.employeeId)

        const allSigned = allEmployeeIds.length > 0 &&
            allEmployeeIds.every(empId => signedEmployeeIds.includes(empId))

        if (!allSigned) {
            return NextResponse.json({
                error: "Nicht alle Mitarbeiter haben unterschrieben. Der Klient kann erst unterschreiben, wenn alle Mitarbeiter unterschrieben haben.",
                signedCount: signedEmployeeIds.length,
                totalCount: allEmployeeIds.length
            }, { status: 400 })
        }

        // Update status to PENDING_RECIPIENT if still in PENDING_EMPLOYEES
        if (teamSubmission.status === "PENDING_EMPLOYEES") {
            await prisma.teamSubmission.update({
                where: { id: teamSubmission.id },
                data: { status: "PENDING_RECIPIENT" }
            })
        }

        // Ensure signature token exists and is valid
        let signatureToken = teamSubmission.signatureToken
        if (!signatureToken || (teamSubmission.tokenExpiresAt && teamSubmission.tokenExpiresAt < new Date())) {
            // Generate new token if missing or expired
            signatureToken = randomBytes(32).toString("hex")
            const tokenExpiresAt = new Date()
            tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7) // 7 Tage Gueltigkeit

            await prisma.teamSubmission.update({
                where: { id: teamSubmission.id },
                data: {
                    signatureToken,
                    tokenExpiresAt
                }
            })
        }

        // Build employee name list for email
        const employeeNames = teamSubmission.employeeSignatures
            .filter(sig => sig.signature !== null)
            .map(sig => sig.employee.name || sig.employee.email)

        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const signatureUrl = `${baseUrl}/sign/${signatureToken}`

        // Get token expiry date (7 Tage als Fallback)
        const expiresAt = teamSubmission.tokenExpiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

        // ✅ FIX: Rückgabewert prüfen - Resend kann fehlschlagen ohne Exception
        const emailResult = await sendSignatureRequestEmail({
            recipientEmail: client.email,
            recipientName: clientName,
            employeeName: employeeNames.length === 1
                ? employeeNames[0]
                : `Team (${employeeNames.length} Mitarbeiter)`,
            month,
            year,
            signatureUrl,
            expiresAt
        })

        if (!emailResult?.success) {
            return NextResponse.json({
                error: "E-Mail konnte nicht gesendet werden"
            }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: `E-Mail an ${clientName} gesendet`
        })

    } catch (error: any) {
        console.error("[POST /api/admin/submissions/send-email] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
