import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

/**
 * GET /api/admin/submissions/preview
 * Get preview data for a specific Dienstplan (what the recipient will see)
 */
export async function GET(req: NextRequest) {
    try {
        const result = await requireAdmin()
        if (result instanceof NextResponse) return result

        const { searchParams } = new URL(req.url)
        const sheetFileName = searchParams.get("sheetFileName")
        const month = parseInt(searchParams.get("month") || "", 10)
        const year = parseInt(searchParams.get("year") || "", 10)

        if (!sheetFileName || isNaN(month) || isNaN(year)) {
            return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 })
        }

        // Get DienstplanConfig for recipient info
        const dienstplanConfig = await prisma.dienstplanConfig.findUnique({
            where: { sheetFileName }
        })

        if (!dienstplanConfig) {
            return NextResponse.json({ error: "Dienstplan nicht konfiguriert" }, { status: 404 })
        }

        // Get all timesheets for this Dienstplan
        const timesheets = await prisma.timesheet.findMany({
            where: {
                sheetFileName,
                month,
                year
            },
            orderBy: [
                { date: "asc" }
            ],
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
        })

        // Get all timesheets for the month (for backup calculation)
        const allMonthTimesheets = await prisma.timesheet.findMany({
            where: { month, year },
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
        const employeeMap = new Map<string, {
            id: string
            name: string
            email: string
            employee: any
            timesheets: any[]
        }>()

        for (const ts of timesheets) {
            const empId = ts.employee.id
            if (!employeeMap.has(empId)) {
                employeeMap.set(empId, {
                    id: empId,
                    name: ts.employee.name || ts.employee.email,
                    email: ts.employee.email,
                    employee: ts.employee,
                    timesheets: []
                })
            }
            employeeMap.get(empId)!.timesheets.push(ts)
        }

        // Calculate statistics for each employee
        let totalHours = 0
        const employees = Array.from(employeeMap.values()).map(emp => {
            const aggregated = aggregateMonthlyData(
                emp.timesheets,
                {
                    id: emp.id,
                    hourlyWage: emp.employee.hourlyWage || 0,
                    nightPremiumEnabled: emp.employee.nightPremiumEnabled ?? true,
                    nightPremiumPercent: emp.employee.nightPremiumPercent || 25,
                    sundayPremiumEnabled: emp.employee.sundayPremiumEnabled ?? true,
                    sundayPremiumPercent: emp.employee.sundayPremiumPercent || 30,
                    holidayPremiumEnabled: emp.employee.holidayPremiumEnabled ?? true,
                    holidayPremiumPercent: emp.employee.holidayPremiumPercent || 125
                },
                allMonthTimesheets
            )

            totalHours += aggregated.totalHours

            return {
                id: emp.id,
                name: emp.name,
                email: emp.email,
                totalHours: aggregated.totalHours,
                nightHours: aggregated.nightHours,
                sundayHours: aggregated.sundayHours,
                holidayHours: aggregated.holidayHours,
                sickDays: aggregated.sickDays,
                vacationDays: aggregated.vacationDays,
                timesheets: emp.timesheets.map(ts => ({
                    date: ts.date,
                    plannedStart: ts.plannedStart,
                    plannedEnd: ts.plannedEnd,
                    actualStart: ts.actualStart,
                    actualEnd: ts.actualEnd,
                    status: ts.status,
                    absenceType: ts.absenceType
                }))
            }
        })

        // Sort employees by name
        employees.sort((a, b) => a.name.localeCompare(b.name))

        return NextResponse.json({
            sheetFileName,
            month,
            year,
            recipientName: dienstplanConfig.assistantRecipientName,
            recipientEmail: dienstplanConfig.assistantRecipientEmail,
            employees,
            totalHours
        })
    } catch (error: any) {
        console.error("[GET /api/admin/submissions/preview] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
