import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmployeeConfirmationEmail } from "@/lib/email"
import { headers } from "next/headers"

/**
 * GET /api/sign/employee/[token]
 * Get EmployeeSignature data for employee signature page (PUBLIC - no auth required)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        // Find EmployeeSignature by signToken
        const employeeSignature = await prisma.employeeSignature.findUnique({
            where: { signToken: token },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                teamSubmission: {
                    include: {
                        client: true,
                        employeeSignatures: {
                            include: {
                                employee: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!employeeSignature) {
            return NextResponse.json({ error: "Ungueltiger oder abgelaufener Link" }, { status: 404 })
        }

        // Check if token is expired
        if (employeeSignature.tokenExpiresAt && new Date() > employeeSignature.tokenExpiresAt) {
            return NextResponse.json({ error: "Dieser Link ist abgelaufen" }, { status: 410 })
        }

        // Check if already signed
        if (employeeSignature.signature) {
            return NextResponse.json({
                error: "Du hast diesen Stundennachweis bereits unterschrieben",
                signedAt: employeeSignature.signedAt
            }, { status: 410 })
        }

        const teamSubmission = employeeSignature.teamSubmission
        const client = teamSubmission.client
        const clientName = client ? `${client.firstName} ${client.lastName}` : "Unbekannt"

        // Get timesheets for this employee in this month
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId: employeeSignature.employeeId,
                sheetFileName: teamSubmission.sheetFileName,
                month: teamSubmission.month,
                year: teamSubmission.year
            },
            orderBy: { date: "asc" },
            select: {
                date: true,
                plannedStart: true,
                plannedEnd: true,
                actualStart: true,
                actualEnd: true,
                absenceType: true,
                note: true,
                status: true,
                breakMinutes: true
            }
        })

        // Count how many employees have signed
        const totalEmployees = teamSubmission.employeeSignatures.length
        const signedEmployees = teamSubmission.employeeSignatures.filter(sig => sig.signature).length

        return NextResponse.json({
            employee: {
                id: employeeSignature.employee.id,
                name: employeeSignature.employee.name,
                email: employeeSignature.employee.email
            },
            submission: {
                id: teamSubmission.id,
                month: teamSubmission.month,
                year: teamSubmission.year,
                sheetFileName: teamSubmission.sheetFileName,
                clientName,
                status: teamSubmission.status
            },
            timesheets,
            signatureProgress: {
                signed: signedEmployees,
                total: totalEmployees
            }
        })
    } catch (error: any) {
        console.error("[GET /api/sign/employee/[token]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/sign/employee/[token]
 * Employee signs their timesheet (PUBLIC - no auth required)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params
        const body = await req.json()
        const { signature } = body

        if (!signature) {
            return NextResponse.json({ error: "Unterschrift erforderlich" }, { status: 400 })
        }

        // Validate signature format
        if (!signature.startsWith("data:image/png;base64,")) {
            return NextResponse.json({ error: "Ungueltiges Unterschrift-Format" }, { status: 400 })
        }

        // Find EmployeeSignature by signToken
        const employeeSignature = await prisma.employeeSignature.findUnique({
            where: { signToken: token },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                teamSubmission: {
                    include: {
                        client: true,
                        employeeSignatures: true
                    }
                }
            }
        })

        if (!employeeSignature) {
            return NextResponse.json({ error: "Ungueltiger oder abgelaufener Link" }, { status: 404 })
        }

        // Check if token is expired
        if (employeeSignature.tokenExpiresAt && new Date() > employeeSignature.tokenExpiresAt) {
            return NextResponse.json({ error: "Dieser Link ist abgelaufen" }, { status: 410 })
        }

        // Check if already signed
        if (employeeSignature.signature) {
            return NextResponse.json({
                error: "Du hast diesen Stundennachweis bereits unterschrieben"
            }, { status: 400 })
        }

        // Get IP address
        const headersList = await headers()
        const forwardedFor = headersList.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"

        const signedAt = new Date()

        // Update EmployeeSignature with signature
        await prisma.employeeSignature.update({
            where: { id: employeeSignature.id },
            data: {
                signature,
                signedAt,
                ipAddress: clientIp
            }
        })

        const teamSubmission = employeeSignature.teamSubmission
        const client = teamSubmission.client
        const clientName = client ? `${client.firstName} ${client.lastName}` : "Unbekannt"

        // Check if ALL employees have now signed
        const allSignatures = teamSubmission.employeeSignatures
        const signedCount = allSignatures.filter(sig =>
            sig.id === employeeSignature.id ? true : !!sig.signature
        ).length
        const totalCount = allSignatures.length
        const allSigned = signedCount === totalCount

        // If all employees have signed, update TeamSubmission status
        if (allSigned) {
            await prisma.teamSubmission.update({
                where: { id: teamSubmission.id },
                data: { status: "PENDING_RECIPIENT" }
            })
        }

        // Send confirmation email to employee
        try {
            await sendEmployeeConfirmationEmail({
                employeeEmail: employeeSignature.employee.email,
                employeeName: employeeSignature.employee.name || employeeSignature.employee.email,
                clientName,
                month: teamSubmission.month,
                year: teamSubmission.year,
                signedAt,
                totalSigned: signedCount,
                totalRequired: totalCount
            })
        } catch (emailError: any) {
            console.error("[POST /api/sign/employee/[token]] Email error:", emailError)
            // Continue even if email fails
        }

        return NextResponse.json({
            success: true,
            message: "Unterschrift erfolgreich gespeichert",
            allEmployeesSigned: allSigned,
            signedCount,
            totalCount
        })
    } catch (error: any) {
        console.error("[POST /api/sign/employee/[token]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
