import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { generateTimesheetPdf } from "@/lib/pdf-generator"
import { sendCompletionEmails } from "@/lib/email"
import { uploadPdfToDrive } from "@/lib/google-drive"
import { aggregateMonthlyData } from "@/lib/premium-calculator"
import { headers } from "next/headers"
import { getSignedEmployees } from "@/lib/team-submission-utils"

/**
 * GET /api/sign/[token]
 * Get TeamSubmission data for recipient signature page (PUBLIC - no auth required)
 * NEW: Multi-Employee Support - shows all employee signatures
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        // Look for TeamSubmission (new multi-employee system)
        const teamSubmission = await prisma.teamSubmission.findUnique({
            where: { signatureToken: token },
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
                    },
                    orderBy: { signedAt: "asc" }
                }
            }
        })

        if (!teamSubmission) {
            return NextResponse.json({ error: "Ungültiger oder abgelaufener Link" }, { status: 404 })
        }

        // Check if token is expired
        if (new Date() > teamSubmission.tokenExpiresAt) {
            return NextResponse.json({ error: "Dieser Link ist abgelaufen" }, { status: 410 })
        }

        // Check status
        if (teamSubmission.status === "COMPLETED") {
            return NextResponse.json({
                error: "Dieser Stundennachweis wurde bereits vollständig unterschrieben",
                pdfUrl: teamSubmission.pdfUrl
            }, { status: 410 })
        }

        if (teamSubmission.status === "PENDING_EMPLOYEES") {
            return NextResponse.json({
                error: "Noch nicht alle Mitarbeiter haben unterschrieben"
            }, { status: 400 })
        }

        // Get ALL timesheets for this Dienstplan (all employees)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                sheetFileName: teamSubmission.sheetFileName,
                month: teamSubmission.month,
                year: teamSubmission.year
            },
            orderBy: [
                { date: "asc" },
                { employeeId: "asc" }
            ],
            select: {
                date: true,
                plannedStart: true,
                plannedEnd: true,
                actualStart: true,
                actualEnd: true,
                absenceType: true,
                note: true,
                status: true,
                employeeId: true,
                employee: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            }
        })

        return NextResponse.json({
            submission: {
                id: teamSubmission.id,
                month: teamSubmission.month,
                year: teamSubmission.year,
                status: teamSubmission.status,
                sheetFileName: teamSubmission.sheetFileName,
                recipientName: teamSubmission.dienstplanConfig.assistantRecipientName,
                manuallyReleasedAt: teamSubmission.manuallyReleasedAt,
                releaseNote: teamSubmission.releaseNote
            },
            employeeSignatures: teamSubmission.employeeSignatures.map(sig => ({
                employeeId: sig.employeeId,
                employeeName: sig.employee.name,
                employeeEmail: sig.employee.email,
                signature: sig.signature,
                signedAt: sig.signedAt
            })),
            timesheets
        })
    } catch (error: any) {
        console.error("[GET /api/sign/[token]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/sign/[token]
 * Recipient signs the TeamSubmission (PUBLIC - no auth required)
 * NEW: Generates PDF with ALL employee signatures + recipient signature
 * Sends emails to ALL employees + recipient + employer
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
            return NextResponse.json({ error: "Signature required" }, { status: 400 })
        }

        // Validate signature format
        if (!signature.startsWith("data:image/png;base64,")) {
            return NextResponse.json({ error: "Invalid signature format" }, { status: 400 })
        }

        const teamSubmission = await prisma.teamSubmission.findUnique({
            where: { signatureToken: token },
            include: {
                dienstplanConfig: true,
                employeeSignatures: {
                    include: {
                        employee: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                hourlyWage: true,
                                nightPremiumEnabled: true,
                                nightPremiumPercent: true,
                                sundayPremiumEnabled: true,
                                sundayPremiumPercent: true,
                                holidayPremiumEnabled: true,
                                holidayPremiumPercent: true
                            }
                        }
                    },
                    orderBy: { signedAt: "asc" }
                }
            }
        })

        if (!teamSubmission) {
            return NextResponse.json({ error: "Ungültiger oder abgelaufener Link" }, { status: 404 })
        }

        // Check if token is expired
        if (new Date() > teamSubmission.tokenExpiresAt) {
            return NextResponse.json({ error: "Dieser Link ist abgelaufen" }, { status: 410 })
        }

        // Check status
        if (teamSubmission.status === "COMPLETED") {
            return NextResponse.json({
                error: "Dieser Stundennachweis wurde bereits vollständig unterschrieben"
            }, { status: 400 })
        }

        if (teamSubmission.status !== "PENDING_RECIPIENT") {
            return NextResponse.json({
                error: "Dieser Stundennachweis wartet noch auf die Mitarbeiter-Unterschriften"
            }, { status: 400 })
        }

        // Get IP address
        const headersList = await headers()
        const forwardedFor = headersList.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"

        // Get ALL timesheets for this Dienstplan (all employees)
        const timesheets = await prisma.timesheet.findMany({
            where: {
                sheetFileName: teamSubmission.sheetFileName,
                month: teamSubmission.month,
                year: teamSubmission.year
            },
            orderBy: [
                { date: "asc" },
                { employeeId: "asc" }
            ],
            include: {
                employee: {
                    select: {
                        name: true,
                        email: true,
                        hourlyWage: true,
                        nightPremiumEnabled: true,
                        nightPremiumPercent: true,
                        sundayPremiumEnabled: true,
                        sundayPremiumPercent: true,
                        holidayPremiumEnabled: true,
                        holidayPremiumPercent: true
                    }
                }
            }
        })

        // Get all timesheets for backup calculation
        const allMonthTimesheets = await prisma.timesheet.findMany({
            where: {
                month: teamSubmission.month,
                year: teamSubmission.year
            },
            select: {
                backupEmployeeId: true,
                absenceType: true,
                actualStart: true,
                actualEnd: true,
                plannedStart: true,
                plannedEnd: true,
                date: true
            }
        })

        // Group timesheets by employee
        const timesheetsByEmployee = new Map<string, any[]>()
        for (const ts of timesheets) {
            if (!timesheetsByEmployee.has(ts.employeeId)) {
                timesheetsByEmployee.set(ts.employeeId, [])
            }
            timesheetsByEmployee.get(ts.employeeId)!.push(ts)
        }

        // Calculate aggregated stats for ALL employees
        let totalHours = 0
        let totalPlannedHours = 0
        let totalNightHours = 0
        let totalSundayHours = 0
        let totalHolidayHours = 0
        let totalSickDays = 0
        let totalSickHours = 0
        let totalVacationDays = 0
        let totalVacationHours = 0

        for (const [employeeId, employeeTimesheets] of timesheetsByEmployee.entries()) {
            const employee = employeeTimesheets[0].employee

            const aggregated = aggregateMonthlyData(
                employeeTimesheets,
                {
                    id: employeeId,
                    hourlyWage: employee.hourlyWage || 0,
                    nightPremiumEnabled: employee.nightPremiumEnabled ?? true,
                    nightPremiumPercent: employee.nightPremiumPercent || 25,
                    sundayPremiumEnabled: employee.sundayPremiumEnabled ?? true,
                    sundayPremiumPercent: employee.sundayPremiumPercent || 30,
                    holidayPremiumEnabled: employee.holidayPremiumEnabled ?? true,
                    holidayPremiumPercent: employee.holidayPremiumPercent || 125
                },
                allMonthTimesheets
            )

            totalHours += aggregated.totalHours
            totalNightHours += aggregated.nightHours
            totalSundayHours += aggregated.sundayHours
            totalHolidayHours += aggregated.holidayHours
            totalSickDays += aggregated.sickDays
            totalSickHours += aggregated.sickHours
            totalVacationDays += aggregated.vacationDays
            totalVacationHours += aggregated.vacationHours

            // Calculate planned hours
            for (const ts of employeeTimesheets) {
                if (ts.plannedStart && ts.plannedEnd) {
                    const [startH, startM] = ts.plannedStart.split(":").map(Number)
                    const [endH, endM] = ts.plannedEnd.split(":").map(Number)
                    let diff = (endH * 60 + endM) - (startH * 60 + startM)
                    if (diff < 0) diff += 24 * 60
                    totalPlannedHours += diff / 60
                }
            }
        }

        const recipientSignedAt = new Date()

        // Generate final PDF with ALL signatures (4 employees + 1 recipient)
        const pdfBuffer = generateTimesheetPdf({
            employeeName: "", // Not used for team submission
            teamName: teamSubmission.sheetFileName,
            month: teamSubmission.month,
            year: teamSubmission.year,
            timesheets: timesheets.map(ts => ({
                date: ts.date,
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                absenceType: ts.absenceType,
                note: ts.note,
                status: ts.status,
                breakMinutes: ts.breakMinutes,
                employeeName: ts.employee.name || ts.employee.email
            })),
            stats: {
                totalHours,
                plannedHours: totalPlannedHours,
                nightHours: totalNightHours,
                sundayHours: totalSundayHours,
                holidayHours: totalHolidayHours,
                sickDays: totalSickDays,
                sickHours: totalSickHours,
                vacationDays: totalVacationDays,
                vacationHours: totalVacationHours
            },
            signatures: {
                // NEW: Multiple employee signatures
                employeeSignatures: teamSubmission.employeeSignatures.map(sig => ({
                    employeeName: sig.employee.name || sig.employee.email,
                    signature: sig.signature,
                    signedAt: sig.signedAt
                })),
                // Recipient signature
                recipientName: teamSubmission.dienstplanConfig.assistantRecipientName,
                recipientSignature: signature,
                recipientSignedAt,
                // Manual release info (if applicable)
                manuallyReleased: !!teamSubmission.manuallyReleasedAt,
                releaseNote: teamSubmission.releaseNote
            }
        })

        // Upload final PDF to Drive
        let pdfUrl = teamSubmission.pdfUrl
        const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
        const fileName = `Stundennachweis_${teamSubmission.sheetFileName.replace(/\s+/g, "_")}_${monthNames[teamSubmission.month - 1]}_${teamSubmission.year}_FINAL.pdf`

        try {
            const driveResult = await uploadPdfToDrive({
                fileName,
                pdfBuffer
            })
            pdfUrl = driveResult.webViewLink
        } catch (driveError: any) {
            console.error("[RECIPIENT SIGN] Google Drive upload failed:", driveError)
        }

        // Update TeamSubmission to COMPLETED
        await prisma.teamSubmission.update({
            where: { id: teamSubmission.id },
            data: {
                recipientSignature: signature,
                recipientSignedAt,
                recipientIp: clientIp,
                status: "COMPLETED",
                pdfUrl
            }
        })

        // Update all timesheets to COMPLETED status
        await prisma.timesheet.updateMany({
            where: {
                sheetFileName: teamSubmission.sheetFileName,
                month: teamSubmission.month,
                year: teamSubmission.year
            },
            data: {
                status: "COMPLETED"
            }
        })

        // Send completion emails to ALL employees + recipient + employer
        try {
            const employeeEmails = teamSubmission.employeeSignatures.map(sig => ({
                email: sig.employee.email,
                name: sig.employee.name || sig.employee.email
            }))

            await sendCompletionEmails({
                // Send to ALL employees
                employeeEmails,
                // Recipient
                recipientEmail: teamSubmission.dienstplanConfig.assistantRecipientEmail,
                recipientName: teamSubmission.dienstplanConfig.assistantRecipientName,
                // Employer
                employerEmail: process.env.EMPLOYER_EMAIL!,
                month: teamSubmission.month,
                year: teamSubmission.year,
                pdfUrl: pdfUrl || "",
                sheetFileName: teamSubmission.sheetFileName,
                totalHours,
                employeeSignatures: teamSubmission.employeeSignatures.map(sig => ({
                    name: sig.employee.name || sig.employee.email,
                    signedAt: sig.signedAt
                })),
                recipientSignedAt
            })
        } catch (emailError: any) {
            console.error("[RECIPIENT SIGN] Completion emails failed:", emailError)
        }

        return NextResponse.json({
            success: true,
            message: "Stundennachweis erfolgreich unterschrieben und abgeschlossen.",
            pdfUrl
        })
    } catch (error: any) {
        console.error("[POST /api/sign/[token]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
