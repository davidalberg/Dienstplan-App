import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { generateCombinedTeamPdf } from "@/lib/pdf-generator"
import { aggregateMonthlyData } from "@/lib/premium-calculator"
import { calculateMinutesBetween } from "@/lib/time-utils"

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
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED", "COMPLETED"] }
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
                    plannedStart: ts.plannedStart,
                    plannedEnd: ts.plannedEnd,
                    actualStart: ts.actualStart,
                    actualEnd: ts.actualEnd,
                    absenceType: ts.absenceType,
                    status: ts.status
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

        // Prepare timesheets for combined PDF (flat structure with employee names)
        const pdfTimesheets = timesheets.map(ts => {
            // Calculate hours from actual times
            let hours = 0
            if (ts.actualStart && ts.actualEnd && !ts.absenceType) {
                const minutes = calculateMinutesBetween(ts.actualStart, ts.actualEnd)
                hours = minutes ? Math.round(minutes / 60 * 100) / 100 : 0
            }
            return {
                date: ts.date,
                employeeId: ts.employeeId,
                employeeName: ts.employee.name || ts.employee.email,
                plannedStart: ts.plannedStart,
                plannedEnd: ts.plannedEnd,
                actualStart: ts.actualStart,
                actualEnd: ts.actualEnd,
                absenceType: ts.absenceType,
                note: ts.note,
                status: ts.status,
                hours
            }
        })

        // Prepare employee stats for the PDF
        const employeeStats = allEmployeeData.map(empData => {
            // Calculate planned hours from planned times
            let plannedHours = 0
            for (const ts of empData.timesheets) {
                if (ts.plannedStart && ts.plannedEnd && !ts.absenceType) {
                    const minutes = calculateMinutesBetween(ts.plannedStart, ts.plannedEnd)
                    if (minutes !== null && minutes > 0) {
                        plannedHours += Math.round(minutes / 60 * 100) / 100
                    }
                }
            }
            return {
                employeeId: empData.employee.id,
                employeeName: empData.employee.name || empData.employee.email,
                totalHours: empData.stats.totalHours,
                plannedHours,
                workDays: empData.timesheets.filter((ts: any) => !ts.absenceType).length,
                sickDays: empData.timesheets.filter((ts: any) => ts.absenceType === "SICK").length,
                vacationDays: empData.timesheets.filter((ts: any) => ts.absenceType === "VACATION").length
            }
        })

        // Generate combined PDF (same format as admin export)
        const pdfBuffer = generateCombinedTeamPdf({
            teamName: teamSubmission.sheetFileName || clientName,
            clientName,
            month: teamSubmission.month,
            year: teamSubmission.year,
            timesheets: pdfTimesheets,
            employeeStats,
            totalHours,
            signatures: {
                employees: teamSubmission.employeeSignatures
                    .filter(sig => sig.signedAt && sig.signature)
                    .map(sig => ({
                        employeeId: sig.employeeId,
                        employeeName: sig.employee.name || sig.employee.email,
                        signature: sig.signature!,
                        signedAt: sig.signedAt!
                    })),
                client: {
                    clientName,
                    signature: teamSubmission.recipientSignature,
                    signedAt: teamSubmission.recipientSignedAt
                }
            }
        })

        const filename = `Stundennachweis_${clientName.replace(/\s+/g, "_")}_${teamSubmission.month}_${teamSubmission.year}.pdf`

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
