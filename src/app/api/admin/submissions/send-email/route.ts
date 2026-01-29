import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { sendSignatureRequestEmail, sendEmployeeConfirmationEmail, sendEmployeeSignatureEmail } from "@/lib/email"
import { randomBytes } from "crypto"

/**
 * POST /api/admin/submissions/send-email
 * Send signature request email to employee or client
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { employeeId, clientId, month, year, type } = body

    if (!employeeId || !clientId || !month || !year || !type) {
        return NextResponse.json({
            error: "employeeId, clientId, month, year und type sind erforderlich"
        }, { status: 400 })
    }

    if (type !== "employee" && type !== "client") {
        return NextResponse.json({
            error: "type muss 'employee' oder 'client' sein"
        }, { status: 400 })
    }

    try {
        // Load employee
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { id: true, name: true, email: true }
        })

        if (!employee) {
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
        }

        // Load client
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { id: true, firstName: true, lastName: true, email: true }
        })

        if (!client) {
            return NextResponse.json({ error: "Klient nicht gefunden" }, { status: 404 })
        }

        const clientName = `${client.firstName} ${client.lastName}`

        // Find existing TeamSubmission or create one
        let teamSubmission = await prisma.teamSubmission.findFirst({
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

        if (!teamSubmission) {
            // Create new TeamSubmission
            const signatureToken = randomBytes(32).toString("hex")
            const tokenExpiresAt = new Date()
            tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 14) // 14 days validity

            // Find the sheetFileName from timesheets
            const sampleTimesheet = await prisma.timesheet.findFirst({
                where: {
                    employeeId,
                    month,
                    year
                },
                select: { sheetFileName: true }
            })

            teamSubmission = await prisma.teamSubmission.create({
                data: {
                    month,
                    year,
                    clientId,
                    sheetFileName: sampleTimesheet?.sheetFileName || clientName,
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

        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

        if (type === "employee") {
            // Mitarbeiter-E-Mails sind deaktiviert.
            // Mitarbeiter unterschreiben direkt im System ueber ihr Dashboard.
            return NextResponse.json({
                error: "Mitarbeiter-E-Mails sind deaktiviert. Mitarbeiter unterschreiben direkt im System."
            }, { status: 400 })
        } else {
            // Send email to client (Assistenznehmer)
            if (!client.email) {
                return NextResponse.json({
                    error: "Für diesen Klienten ist keine E-Mail-Adresse hinterlegt"
                }, { status: 400 })
            }

            // Check if all employees have signed
            const allEmployeeIds = await prisma.timesheet.findMany({
                where: {
                    month,
                    year,
                    sheetFileName: teamSubmission.sheetFileName
                },
                select: { employeeId: true },
                distinct: ['employeeId']
            })

            // Pruefe ob Mitarbeiter tatsaechlich unterschrieben haben (signature !== null)
            const signedEmployeeIds = teamSubmission.employeeSignatures
                .filter(sig => sig.signature !== null) // Nur wenn Signatur vorhanden
                .map(sig => sig.employeeId)
            const allSigned = allEmployeeIds.every(e => signedEmployeeIds.includes(e.employeeId))

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

            // Build employee name list for email
            const employeeNames = teamSubmission.employeeSignatures.map(sig =>
                sig.employee.name || sig.employee.email
            )

            const signatureUrl = `${baseUrl}/sign/${teamSubmission.signatureToken}`

            await sendSignatureRequestEmail({
                recipientEmail: client.email,
                recipientName: clientName,
                employeeName: employeeNames.length === 1 ? employeeNames[0] : `Team (${employeeNames.length} Mitarbeiter)`,
                month,
                year,
                signatureUrl,
                expiresAt: teamSubmission.tokenExpiresAt
            })

            return NextResponse.json({
                success: true,
                message: `E-Mail an ${clientName} gesendet`
            })
        }
    } catch (error: any) {
        console.error("[POST /api/admin/submissions/send-email] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
