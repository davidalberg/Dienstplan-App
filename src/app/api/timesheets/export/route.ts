import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { aggregateMonthlyData } from "@/lib/premium-calculator"

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "", 10)
    const year = parseInt(searchParams.get("year") || "", 10)
    const employeeId = searchParams.get("employeeId")
    const source = searchParams.get("source")

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
        return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    const user = session.user as any

    try {
        // Determine which employee's data to export
        let targetEmployeeId = employeeId
        if (user.role === "EMPLOYEE") {
            targetEmployeeId = user.id // Employees can only export their own data
        } else if (user.role === "TEAMLEAD" && targetEmployeeId) {
            // Validate teamId from database and ensure employee belongs to teamlead's team
            const dbUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: { teamId: true, role: true }
            })

            if (!dbUser || dbUser.role !== "TEAMLEAD" || !dbUser.teamId) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 })
            }

            // Verify the target employee belongs to this teamlead's team
            const targetEmployee = await prisma.user.findUnique({
                where: { id: targetEmployeeId },
                select: { teamId: true }
            })

            if (!targetEmployee || targetEmployee.teamId !== dbUser.teamId) {
                return NextResponse.json({ error: "Forbidden - Employee not in your team" }, { status: 403 })
            }
        }

        const where: any = { month, year }
        if (targetEmployeeId) where.employeeId = targetEmployeeId

        // Support filtering by source (tab name) OR sheetFileName (file name)
        if (source) {
            where.OR = [
                { source }, // Tab name like "Januar"
                { sheetFileName: source } // File name like "Dienstplan Sarah Erbach 2026"
            ]
        }

        // Fetch timesheets with full employee data (including new premium fields)
        const timesheets = await prisma.timesheet.findMany({
            where,
            include: {
                employee: {
                    select: {
                        name: true,
                        email: true,
                        employeeId: true,
                        entryDate: true,
                        exitDate: true,
                        hourlyWage: true,
                        travelCostType: true,
                        nightPremiumEnabled: true,
                        nightPremiumPercent: true,
                        sundayPremiumEnabled: true,
                        sundayPremiumPercent: true,
                        holidayPremiumEnabled: true,
                        holidayPremiumPercent: true
                    }
                }
            },
            orderBy: { date: "asc" }
        })

        if (timesheets.length === 0) {
            return NextResponse.json({ error: "No timesheets found for this period" }, { status: 404 })
        }

        // Group timesheets by employee
        const byEmployee = new Map<string, any[]>()
        timesheets.forEach(ts => {
            const empId = ts.employeeId
            if (!byEmployee.has(empId)) {
                byEmployee.set(empId, [])
            }
            byEmployee.get(empId)!.push(ts)
        })

        // Prepare Excel data - one row per employee (aggregated)
        const excelData: any[] = []

        byEmployee.forEach((empTimesheets, empId) => {
            const employee = empTimesheets[0].employee
            // Prefer sheetFileName (new grouping) over source (tab name)
            const primarySource = source || empTimesheets[0].sheetFileName || empTimesheets[0].source || "-"

            // Aggregate monthly data using premium calculator
            const aggregated = aggregateMonthlyData(empTimesheets, {
                hourlyWage: employee.hourlyWage || 0,
                nightPremiumEnabled: employee.nightPremiumEnabled,
                nightPremiumPercent: employee.nightPremiumPercent || 25,
                sundayPremiumEnabled: employee.sundayPremiumEnabled,
                sundayPremiumPercent: employee.sundayPremiumPercent || 30,
                holidayPremiumEnabled: employee.holidayPremiumEnabled,
                holidayPremiumPercent: employee.holidayPremiumPercent || 125
            })

            // Build row with columns A-Q
            const row: any = {}

            // A: Mitarbeiter-ID
            row["A_Mitarbeiter-ID"] = employee.employeeId || "-"

            // B: Dienstplan Name
            row["B_Dienstplan"] = primarySource

            // C: Name
            row["C_Name"] = employee.name || "-"

            // D: Eintrittsdatum
            row["D_Eintrittsdatum"] = employee.entryDate
                ? format(new Date(employee.entryDate), "dd.MM.yyyy", { locale: de })
                : "-"

            // E: Austrittsdatum
            row["E_Austrittsdatum"] = employee.exitDate
                ? format(new Date(employee.exitDate), "dd.MM.yyyy", { locale: de })
                : "-"

            // F: Stundenlohn
            row["F_Stundenlohn"] = employee.hourlyWage || 0

            // G: Stunden insgesamt
            row["G_Stunden_Gesamt"] = aggregated.totalHours

            // H: Nachtstunden
            row["H_Nachtstunden"] = aggregated.nightHours

            // I: Sonntagsstunden
            row["I_Sonntagsstunden"] = aggregated.sundayHours

            // J: NRW Feiertagsstunden
            row["J_Feiertagsstunden"] = aggregated.holidayHours

            // K: Bereitschaftstage (LEER - vorerst übersprungen)
            row["K_Bereitschaftstage"] = ""

            // L: Krankheitstage
            row["L_Krankheitstage"] = aggregated.sickDays

            // M: Krankstunden
            row["M_Krankstunden"] = aggregated.sickHours

            // N: Urlaubstage
            row["N_Urlaubstage"] = aggregated.vacationDays

            // O: Urlaubsstunden
            row["O_Urlaubsstunden"] = aggregated.vacationHours

            // P: Reserve (LEER)
            row["P_Reserve"] = ""

            // Q: Fahrtkosten-Typ
            let travelCostLabel = ""
            if (employee.travelCostType === "DEUTSCHLANDTICKET") {
                travelCostLabel = "Deutschlandticket"
            } else if (employee.travelCostType === "AUTO") {
                travelCostLabel = "Auto"
            }
            row["Q_Fahrtkosten"] = travelCostLabel

            excelData.push(row)
        })

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(excelData)

        // Set column widths (A-Q = 17 columns)
        ws['!cols'] = [
            { wch: 15 },  // A: Mitarbeiter-ID
            { wch: 25 },  // B: Dienstplan
            { wch: 20 },  // C: Name
            { wch: 15 },  // D: Eintrittsdatum
            { wch: 15 },  // E: Austrittsdatum
            { wch: 12 },  // F: Stundenlohn
            { wch: 15 },  // G: Stunden Gesamt
            { wch: 15 },  // H: Nachtstunden
            { wch: 18 },  // I: Sonntagsstunden
            { wch: 18 },  // J: Feiertagsstunden
            { wch: 18 },  // K: Bereitschaftstage
            { wch: 15 },  // L: Krankheitstage
            { wch: 15 },  // M: Krankstunden
            { wch: 15 },  // N: Urlaubstage
            { wch: 15 },  // O: Urlaubsstunden
            { wch: 12 },  // P: Reserve
            { wch: 20 }   // Q: Fahrtkosten
        ]

        // Apply red background to column Q (Fahrtkosten) if value is not empty
        // Find row indices where Q has a value
        const range = XLSX.utils.decode_range(ws['!ref'] || "A1")
        for (let rowNum = range.s.r + 1; rowNum <= range.e.r; rowNum++) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: 16 }) // Column Q (index 16)
            const cell = ws[cellAddress]

            if (cell && cell.v && cell.v !== "") {
                // Apply red background style
                cell.s = {
                    fill: {
                        fgColor: { rgb: "FFCCCC" }
                    }
                }
            }
        }

        // Add worksheet to workbook
        const sheetName = source
            ? `${source}_${month}_${year}`
            : `Export_${month}_${year}`
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)) // Sheet names max 31 chars

        // Generate Excel file buffer
        const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

        // Return as downloadable file
        const filename = source
            ? `Stundennachweis_${source}_${month}_${year}.xlsx`
            : `Stundennachweis_${month}_${year}.xlsx`

        return new NextResponse(excelBuffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        })
    } catch (error: any) {
        console.error("Export error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
