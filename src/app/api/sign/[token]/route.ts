import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { generateTimesheetPdf } from "@/lib/pdf-generator"
import { sendCompletionEmails } from "@/lib/email"
import { uploadPdfToDrive, updatePdfInDrive } from "@/lib/google-drive"
import { aggregateMonthlyData } from "@/lib/premium-calculator"
import { headers } from "next/headers"

/**
 * GET /api/sign/[token]
 * Get submission data for recipient signature page (PUBLIC - no auth required)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        const submission = await prisma.monthlySubmission.findUnique({
            where: { signatureToken: token },
            include: {
                team: {
                    select: {
                        name: true,
                        assistantRecipientName: true
                    }
                },
                employee: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            }
        })

        if (!submission) {
            return NextResponse.json({ error: "Ungültiger oder abgelaufener Link" }, { status: 404 })
        }

        // Check if token is expired
        if (new Date() > submission.tokenExpiresAt) {
            return NextResponse.json({ error: "Dieser Link ist abgelaufen" }, { status: 410 })
        }

        // Check status
        if (submission.status === "COMPLETED") {
            return NextResponse.json({
                error: "Dieser Stundennachweis wurde bereits vollständig unterschrieben",
                pdfUrl: submission.pdfUrl
            }, { status: 410 })
        }

        if (submission.status === "PENDING_EMPLOYEE") {
            return NextResponse.json({
                error: "Der Mitarbeiter hat noch nicht unterschrieben"
            }, { status: 400 })
        }

        // Get timesheets for preview
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId: submission.employeeId,
                month: submission.month,
                year: submission.year
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

        return NextResponse.json({
            submission: {
                id: submission.id,
                month: submission.month,
                year: submission.year,
                status: submission.status,
                employeeName: submission.employee.name,
                teamName: submission.team.name,
                recipientName: submission.team.assistantRecipientName,
                employeeSignedAt: submission.employeeSignedAt,
                pdfUrl: submission.pdfUrl
            },
            timesheets
        })
    } catch (error: any) {
        console.error("[GET /api/sign/[token]] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/sign/[token]
 * Recipient signs the timesheet (PUBLIC - no auth required)
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

        const submission = await prisma.monthlySubmission.findUnique({
            where: { signatureToken: token },
            include: {
                team: true,
                employee: true
            }
        })

        if (!submission) {
            return NextResponse.json({ error: "Ungültiger oder abgelaufener Link" }, { status: 404 })
        }

        // Check if token is expired
        if (new Date() > submission.tokenExpiresAt) {
            return NextResponse.json({ error: "Dieser Link ist abgelaufen" }, { status: 410 })
        }

        // Check status
        if (submission.status === "COMPLETED") {
            return NextResponse.json({
                error: "Dieser Stundennachweis wurde bereits vollständig unterschrieben"
            }, { status: 400 })
        }

        if (submission.status !== "PENDING_RECIPIENT") {
            return NextResponse.json({
                error: "Dieser Stundennachweis wartet noch auf die Mitarbeiter-Unterschrift"
            }, { status: 400 })
        }

        // Get IP address
        const headersList = await headers()
        const forwardedFor = headersList.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"

        // Get timesheets
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId: submission.employeeId,
                month: submission.month,
                year: submission.year
            },
            orderBy: { date: "asc" }
        })

        // Get all timesheets for aggregation
        const allMonthTimesheets = await prisma.timesheet.findMany({
            where: {
                month: submission.month,
                year: submission.year
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

        // Get employee settings
        const employee = await prisma.user.findUnique({
            where: { id: submission.employeeId },
            select: {
                hourlyWage: true,
                nightPremiumEnabled: true,
                nightPremiumPercent: true,
                sundayPremiumEnabled: true,
                sundayPremiumPercent: true,
                holidayPremiumEnabled: true,
                holidayPremiumPercent: true
            }
        })

        // Calculate stats
        const aggregated = aggregateMonthlyData(
            timesheets,
            {
                id: submission.employeeId,
                hourlyWage: employee?.hourlyWage || 0,
                nightPremiumEnabled: employee?.nightPremiumEnabled ?? true,
                nightPremiumPercent: employee?.nightPremiumPercent || 25,
                sundayPremiumEnabled: employee?.sundayPremiumEnabled ?? true,
                sundayPremiumPercent: employee?.sundayPremiumPercent || 30,
                holidayPremiumEnabled: employee?.holidayPremiumEnabled ?? true,
                holidayPremiumPercent: employee?.holidayPremiumPercent || 125
            },
            allMonthTimesheets
        )

        // Calculate planned hours
        let plannedMinutes = 0
        for (const ts of timesheets) {
            if (ts.plannedStart && ts.plannedEnd) {
                const [startH, startM] = ts.plannedStart.split(":").map(Number)
                const [endH, endM] = ts.plannedEnd.split(":").map(Number)
                let diff = (endH * 60 + endM) - (startH * 60 + startM)
                if (diff < 0) diff += 24 * 60
                plannedMinutes += diff
            }
        }

        const recipientSignedAt = new Date()

        // Generate final PDF with both signatures
        const pdfBuffer = generateTimesheetPdf({
            employeeName: submission.employee.name || "Unbekannt",
            teamName: submission.team.name,
            month: submission.month,
            year: submission.year,
            timesheets: timesheets.map(ts => ({
                date: ts.date,
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                absenceType: ts.absenceType,
                note: ts.note,
                status: ts.status,
                breakMinutes: ts.breakMinutes
            })),
            stats: {
                totalHours: aggregated.totalHours,
                plannedHours: plannedMinutes / 60,
                nightHours: aggregated.nightHours,
                sundayHours: aggregated.sundayHours,
                holidayHours: aggregated.holidayHours,
                sickDays: aggregated.sickDays,
                sickHours: aggregated.sickHours,
                vacationDays: aggregated.vacationDays,
                vacationHours: aggregated.vacationHours
            },
            signatures: {
                employeeName: submission.employee.name || "Unbekannt",
                employeeSignature: submission.employeeSignature,
                employeeSignedAt: submission.employeeSignedAt,
                recipientName: submission.team.assistantRecipientName || "Assistenznehmer",
                recipientSignature: signature,
                recipientSignedAt
            }
        })

        // Upload or update PDF in Drive
        let pdfUrl = submission.pdfUrl
        const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
        const fileName = `Stundennachweis_${submission.employee.name?.replace(/\s+/g, "_") || "Mitarbeiter"}_${monthNames[submission.month - 1]}_${submission.year}_FINAL.pdf`

        try {
            // Upload new final PDF
            const driveResult = await uploadPdfToDrive({
                fileName,
                pdfBuffer
            })
            pdfUrl = driveResult.webViewLink
        } catch (driveError: any) {
            console.error("[RECIPIENT SIGN] Google Drive upload failed:", driveError)
        }

        // Update submission
        const updatedSubmission = await prisma.monthlySubmission.update({
            where: { id: submission.id },
            data: {
                recipientSignature: signature,
                recipientSignedAt,
                recipientIp: clientIp,
                status: "COMPLETED",
                pdfUrl
            }
        })

        // Send completion emails to both parties
        try {
            await sendCompletionEmails({
                employeeEmail: submission.employee.email,
                employeeName: submission.employee.name || "Mitarbeiter",
                recipientEmail: submission.team.assistantRecipientEmail!,
                recipientName: submission.team.assistantRecipientName || "Assistenznehmer",
                month: submission.month,
                year: submission.year,
                pdfUrl: pdfUrl || "",
                employeeSignedAt: submission.employeeSignedAt!,
                recipientSignedAt,
                totalHours: aggregated.totalHours
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
