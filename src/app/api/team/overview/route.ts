import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import prisma from "@/lib/prisma"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAuth()
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult
        if (user.role !== "TEAMLEAD" && user.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") || "", 10)
        const year = parseInt(searchParams.get("year") || "", 10)

        if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
            return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
        }

    // Get all employees in the team
    let teamIdFilter = undefined

    if (user.role === "TEAMLEAD") {
        // Validate teamId from database to prevent token manipulation
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { teamId: true, role: true }
        })

        if (!dbUser || dbUser.role !== "TEAMLEAD" || !dbUser.teamId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        teamIdFilter = dbUser.teamId
    }

    const members = await prisma.user.findMany({
        where: {
            teamId: teamIdFilter,
            role: "EMPLOYEE"
        },
        select: {
            id: true,
            name: true,
            employeeId: true,
            hourlyWage: true,
            nightPremiumEnabled: true,
            nightPremiumPercent: true,
            sundayPremiumEnabled: true,
            sundayPremiumPercent: true,
            holidayPremiumEnabled: true,
            holidayPremiumPercent: true,
            timesheets: {
                where: { month, year },
            }
        }
    })

    // Alle Timesheets für Backup-Berechnung laden
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

    // Format response with statistics
    const report = members.map(m => {
        const totalShifts = m.timesheets.length
        const submitted = m.timesheets.every(ts => ts.status === "SUBMITTED") && totalShifts > 0
        const pending = m.timesheets.some(ts => ts.status === "PLANNED")

        // Aggregierte Statistiken berechnen
        const aggregated = aggregateMonthlyData(
            m.timesheets,
            {
                id: m.id,
                hourlyWage: m.hourlyWage || 0,
                nightPremiumEnabled: m.nightPremiumEnabled ?? true,
                nightPremiumPercent: m.nightPremiumPercent || 25,
                sundayPremiumEnabled: m.sundayPremiumEnabled ?? true,
                sundayPremiumPercent: m.sundayPremiumPercent || 30,
                holidayPremiumEnabled: m.holidayPremiumEnabled ?? true,
                holidayPremiumPercent: m.holidayPremiumPercent || 125
            },
            allMonthTimesheets
        )

        return {
            id: m.id,
            name: m.name,
            employeeId: m.employeeId,
            status: submitted ? "SUBMITTED" : (pending ? "DRAFT" : "READY"),
            shiftCount: totalShifts,
            lastUpdate: m.timesheets.length > 0 ? m.timesheets[0].lastUpdatedAt : null,
            stats: {
                totalHours: aggregated.totalHours,
                nightHours: aggregated.nightHours,
                sundayHours: aggregated.sundayHours,
                holidayHours: aggregated.holidayHours,
                backupDays: aggregated.backupDays,
                sickDays: aggregated.sickDays,
                sickHours: aggregated.sickHours,
                vacationDays: aggregated.vacationDays,
                vacationHours: aggregated.vacationHours
            }
        }
    })

    return NextResponse.json(report)
    } catch (error: any) {
        console.error("[GET /api/team/overview] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
