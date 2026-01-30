import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { generateTimesheetPdf } from "@/lib/pdf-generator"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

/**
 * GET /api/timesheets/download/[submissionId]
 * Public endpoint to download completed timesheet PDF
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ submissionId: string }> }
) {
    try {
        const { submissionId } = await params

        // Load TeamSubmission with all signatures and timesheets
        const teamSubmission = await prisma.teamSubmission.findUnique({
            where: { id: submissionId },
            include: {
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
                    }
                },
                client: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                dienstplanConfig: true
            }
        })

        if (!teamSubmission) {
            return NextResponse.json({ error: "Submission not found" }, { status: 404 })
        }

        // Only allow download if submission is completed
        if (teamSubmission.status !== "COMPLETED") {
            return NextResponse.json({ error: "Submission not completed yet" }, { status: 403 })
        }

        // Load all timesheets for this submission
        const timesheets = await prisma.timesheet.findMany({
            where: {
                sheetFileName: teamSubmission.sheetFileName,
                month: teamSubmission.month,
                year: teamSubmission.year,
                status: { in: ["SUBMITTED", "COMPLETED"] }
            },
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
            orderBy: [
                { employeeId: "asc" },
                { date: "asc" }
            ]
        })

        if (timesheets.length === 0) {
            return NextResponse.json({ error: "No timesheets found" }, { status: 404 })
        }

        // Group timesheets by employee
        const timesheetsByEmployee = new Map<string, typeof timesheets>()
        for (const ts of timesheets) {
            const empId = ts.employeeId
            if (!timesheetsByEmployee.has(empId)) {
                timesheetsByEmployee.set(empId, [])
            }
            timesheetsByEmployee.get(empId)!.push(ts)
        }

        // Calculate stats for all employees
        let totalHours = 0
        const allEmployeeData: any[] = []

        for (const [employeeId, empTimesheets] of timesheetsByEmployee) {
            const employee = empTimesheets[0].employee
            const monthlyData = aggregateMonthlyData(
                empTimesheets.map(ts => ({
                    date: ts.date,
                    actualStart: ts.actualStart,
                    actualEnd: ts.actualEnd,
                    breakMinutes: ts.breakMinutes || 0,
                    absenceType: ts.absenceType
                })),
                {
                    hourlyWage: employee.hourlyWage || 0,
                    nightPremiumEnabled: employee.nightPremiumEnabled,
                    nightPremiumPercent: employee.nightPremiumPercent || 25,
                    sundayPremiumEnabled: employee.sundayPremiumEnabled,
                    sundayPremiumPercent: employee.sundayPremiumPercent || 50,
                    holidayPremiumEnabled: employee.holidayPremiumEnabled,
                    holidayPremiumPercent: employee.holidayPremiumPercent || 100
                }
            )

            totalHours += monthlyData.totalHours

            allEmployeeData.push({
                employee,
                timesheets: empTimesheets,
                stats: monthlyData
            })
        }

        // Get client name
        const clientName = teamSubmission.client
            ? `${teamSubmission.client.firstName} ${teamSubmission.client.lastName}`
            : teamSubmission.dienstplanConfig?.assistantRecipientName || "Unbekannt"

        // Generate PDF with all employees
        const teamName = clientName
        const employeeName = allEmployeeData.length === 1
            ? allEmployeeData[0].employee.name || "Unbekannt"
            : `Team (${allEmployeeData.length} Mitarbeiter)`

        const pdfTimesheets = timesheets.map(ts => ({
            date: ts.date,
            plannedStart: ts.plannedStart,
            plannedEnd: ts.plannedEnd,
            actualStart: ts.actualStart,
            actualEnd: ts.actualEnd,
            absenceType: ts.absenceType,
            note: ts.note,
            status: ts.status,
            breakMinutes: ts.breakMinutes || 0,
            employeeName: ts.employee.name || ts.employee.email
        }))

        const pdfBuffer = generateTimesheetPdf({
            employeeName,
            teamName,
            month: teamSubmission.month,
            year: teamSubmission.year,
            timesheets: pdfTimesheets,
            stats: {
                totalHours,
                plannedHours: totalHours,
                sickDays: timesheets.filter(ts => ts.absenceType === "SICK").length,
                sickHours: 0,
                vacationDays: timesheets.filter(ts => ts.absenceType === "VACATION").length,
                vacationHours: 0,
                nightHours: 0,
                sundayHours: 0,
                holidayHours: 0
            },
            signatures: {
                employeeSignatures: teamSubmission.employeeSignatures
                    .filter(sig => sig.signedAt && sig.signature)
                    .map(sig => ({
                        employeeName: sig.employee.name || sig.employee.email,
                        signature: sig.signature!,
                        signedAt: sig.signedAt!
                    })),
                recipientSignature: teamSubmission.recipientSignature,
                recipientSignedAt: teamSubmission.recipientSignedAt
            }
        })

        const filename = `Stundennachweis_${teamName.replace(/\s+/g, "_")}_${teamSubmission.month}_${teamSubmission.year}.pdf`

        return new NextResponse(pdfBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        })
    } catch (error: any) {
        console.error("[GET /api/timesheets/download] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
