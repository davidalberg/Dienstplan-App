import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
// sendEmployeeConfirmationEmail import entfernt - Mitarbeiter sieht Status im Dashboard
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

        // Check if already signed (vor Token-Check, da dann Token-Erneuerung sinnlos)
        if (employeeSignature.signature) {
            return NextResponse.json({
                error: "Du hast diesen Stundennachweis bereits unterschrieben",
                signedAt: employeeSignature.signedAt
            }, { status: 410 })
        }

        // ✅ FIX: Check if token is expired - Automatische Token-Erneuerung
        if (employeeSignature.tokenExpiresAt && new Date() > employeeSignature.tokenExpiresAt) {
            // Token abgelaufen aber noch nicht unterschrieben - erneuere Token automatisch
            const { randomBytes } = await import("crypto")
            const newToken = randomBytes(32).toString("hex")
            const newExpiry = new Date()
            newExpiry.setDate(newExpiry.getDate() + 14) // 14 Tage gültig

            await prisma.employeeSignature.update({
                where: { id: employeeSignature.id },
                data: {
                    signToken: newToken,
                    tokenExpiresAt: newExpiry
                }
            })

            console.log(`[GET /api/sign/employee] Token erneuert für Employee ${employeeSignature.employeeId}`)

            // Redirect zur neuen URL
            return NextResponse.json({
                expired: true,
                message: "Link war abgelaufen und wurde automatisch erneuert",
                newToken: newToken,
                redirectUrl: `/sign/employee/${newToken}`
            }, { status: 200 }) // 200 damit Frontend redirect kann
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
                status: true
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

        // Check if already signed (vor Token-Check)
        if (employeeSignature.signature) {
            return NextResponse.json({
                error: "Du hast diesen Stundennachweis bereits unterschrieben"
            }, { status: 400 })
        }

        // ✅ FIX: Check if token is expired - für POST: Fehler zurückgeben (User soll GET neu aufrufen)
        if (employeeSignature.tokenExpiresAt && new Date() > employeeSignature.tokenExpiresAt) {
            return NextResponse.json({
                error: "Der Link ist abgelaufen. Bitte Seite neu laden für automatische Erneuerung.",
                expired: true
            }, { status: 410 })
        }

        // Get IP address
        const headersList = await headers()
        const forwardedFor = headersList.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"

        const signedAt = new Date()

        // Update EmployeeSignature with signature (with WHERE filter to prevent overwrite)
        const updateResult = await prisma.employeeSignature.updateMany({
            where: {
                id: employeeSignature.id,
                signature: null  // Only update if NOT already signed
            },
            data: {
                signature,
                signedAt,
                ipAddress: clientIp
            }
        })

        // If update failed, signature was already saved (race condition or duplicate request)
        if (updateResult.count === 0) {
            return NextResponse.json({
                error: "Diese Unterschrift wurde bereits gespeichert"
            }, { status: 409 })
        }

        // Re-fetch TeamSubmission with UPDATED employeeSignatures to get accurate count
        const updatedSubmission = await prisma.teamSubmission.findUnique({
            where: { id: employeeSignature.teamSubmissionId },
            include: {
                client: true,
                employeeSignatures: {
                    include: {
                        employee: {
                            select: { id: true, name: true, email: true }
                        }
                    }
                }
            }
        })

        if (!updatedSubmission) {
            return NextResponse.json({ error: "Submission nicht gefunden" }, { status: 404 })
        }

        const teamSubmission = updatedSubmission
        const client = teamSubmission.client
        const clientName = client ? `${client.firstName} ${client.lastName}` : "Unbekannt"

        // Check if ALL employees have now signed (using FRESH data)
        const allSignatures = updatedSubmission.employeeSignatures
        const signedCount = allSignatures.filter(sig => !!sig.signature).length
        const totalCount = allSignatures.length
        const allSigned = signedCount === totalCount

        // If all employees have signed, update TeamSubmission status
        if (allSigned) {
            await prisma.teamSubmission.update({
                where: { id: teamSubmission.id },
                data: { status: "PENDING_RECIPIENT" }
            })
        }

        // Mitarbeiter-Confirmation-E-Mail deaktiviert
        // (Mitarbeiter sieht Status direkt im Dashboard)
        // Die sendEmployeeConfirmationEmail Funktion wird nicht mehr aufgerufen.

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
