import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { generateTimesheetPdf } from "@/lib/pdf-generator"
import { sendSignatureRequestEmail } from "@/lib/email"
import { uploadPdfToDrive } from "@/lib/google-drive"
import { aggregateMonthlyData } from "@/lib/premium-calculator"
import { headers } from "next/headers"

/**
 * POST /api/submissions/sign
 * Employee signs their timesheet
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

        // Get submission
        const submission = await prisma.monthlySubmission.findUnique({
            where: { id: submissionId },
            include: {
                team: true,
                employee: true
            }
        })

        if (!submission) {
            return NextResponse.json({ error: "Submission not found" }, { status: 404 })
        }

        // Verify ownership
        if (submission.employeeId !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        // Check status
        if (submission.status !== "PENDING_EMPLOYEE") {
            return NextResponse.json({
                error: "Diese Einreichung wurde bereits unterschrieben"
            }, { status: 400 })
        }

        // Get IP address
        const headersList = await headers()
        const forwardedFor = headersList.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"

        // Get timesheets for PDF
        const timesheets = await prisma.timesheet.findMany({
            where: {
                employeeId: user.id,
                month: submission.month,
                year: submission.year
            },
            orderBy: { date: "asc" }
        })

        // Get all timesheets for aggregation (backup calculation)
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
            where: { id: user.id },
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
                id: user.id,
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

        // Generate PDF with employee signature only
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
                employeeSignature: signature,
                employeeSignedAt: new Date(),
                recipientName: submission.team.assistantRecipientName || "Assistenznehmer",
                recipientSignature: null,
                recipientSignedAt: null
            }
        })

        // Upload preliminary PDF to Drive
        const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
        const fileName = `Stundennachweis_${submission.employee.name?.replace(/\s+/g, "_") || "Mitarbeiter"}_${monthNames[submission.month - 1]}_${submission.year}.pdf`

        let driveResult
        try {
            driveResult = await uploadPdfToDrive({
                fileName,
                pdfBuffer
            })
        } catch (driveError: any) {
            console.error("[SIGN] Google Drive upload failed:", driveError)
            // Continue without Drive - we can still send the email
        }

        // Update submission with signature
        const updatedSubmission = await prisma.monthlySubmission.update({
            where: { id: submissionId },
            data: {
                employeeSignature: signature,
                employeeSignedAt: new Date(),
                employeeIp: clientIp,
                status: "PENDING_RECIPIENT",
                pdfUrl: driveResult?.webViewLink || null
            }
        })

        // Send email to recipient
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const signatureUrl = `${baseUrl}/sign/${submission.signatureToken}`

        try {
            await sendSignatureRequestEmail({
                recipientEmail: submission.team.assistantRecipientEmail!,
                recipientName: submission.team.assistantRecipientName || "Assistenznehmer",
                employeeName: submission.employee.name || "Mitarbeiter",
                month: submission.month,
                year: submission.year,
                signatureUrl,
                expiresAt: submission.tokenExpiresAt
            })
        } catch (emailError: any) {
            console.error("[SIGN] Email sending failed:", emailError)
            // Don't fail the request, but inform the user
            return NextResponse.json({
                submission: updatedSubmission,
                warning: "Unterschrift gespeichert, aber E-Mail konnte nicht gesendet werden. Bitte informieren Sie den Assistenznehmer manuell.",
                signatureUrl
            })
        }

        // Update all timesheets to SUBMITTED status
        await prisma.timesheet.updateMany({
            where: {
                employeeId: user.id,
                month: submission.month,
                year: submission.year
            },
            data: {
                status: "SUBMITTED",
                lastUpdatedBy: user.email
            }
        })

        return NextResponse.json({
            submission: updatedSubmission,
            message: "Erfolgreich unterschrieben. Der Assistenznehmer wurde per E-Mail benachrichtigt."
        })
    } catch (error: any) {
        console.error("[POST /api/submissions/sign] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
