/**
 * Diagnostic Script: Combined Timesheet Data Issues
 *
 * This script checks the database for common issues that cause:
 * 1. Combined Timesheet API to return 404 (no employees found)
 * 2. PDF to show "Geplante Stunden: 0.00 Std."
 *
 * Run with: npx tsx scripts/diagnose-combined-timesheet.ts
 */

import prisma from "../src/lib/prisma"

async function diagnoseCombinedTimesheet() {
    console.log("🔍 DIAGNOSTIC: Combined Timesheet Data Issues\n")
    console.log("=" + "=".repeat(79) + "\n")

    // Parameters from user's error
    const targetMonth = 1
    const targetYear = 2026
    const clientId = "cml237k08000014046fq4bak7"

    // =========================================================================
    // CHECK 1: TeamSubmission with sheetFileName
    // =========================================================================
    console.log("📋 CHECK 1: TeamSubmission for Januar 2026\n")

    const submissions = await prisma.teamSubmission.findMany({
        where: {
            month: targetMonth,
            year: targetYear,
            clientId
        },
        select: {
            id: true,
            sheetFileName: true,
            month: true,
            year: true,
            clientId: true,
            createdAt: true
        }
    })

    if (submissions.length === 0) {
        console.log("❌ NO TeamSubmission found for January 2026 with this clientId!")
        console.log("   This means the submission was not created yet.\n")
    } else {
        console.log(`✅ Found ${submissions.length} TeamSubmission(s):\n`)
        for (const sub of submissions) {
            console.log(`   - sheetFileName: "${sub.sheetFileName}"`)
            console.log(`     clientId: ${sub.clientId}`)
            console.log(`     createdAt: ${sub.createdAt.toISOString()}\n`)
        }
    }

    // =========================================================================
    // CHECK 2: Timesheets with different sheetFileName formats
    // =========================================================================
    console.log("=" + "=".repeat(79) + "\n")
    console.log("⏰ CHECK 2: Timesheets in Database for Januar 2026\n")

    const allTimesheets = await prisma.timesheet.findMany({
        where: {
            month: targetMonth,
            year: targetYear
        },
        select: {
            id: true,
            sheetFileName: true,
            teamId: true,
            employeeId: true,
            date: true,
            plannedStart: true,
            plannedEnd: true,
            actualStart: true,
            actualEnd: true,
            status: true,
            absenceType: true,
            employee: {
                select: {
                    name: true,
                    team: {
                        select: {
                            name: true,
                            client: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: { date: "asc" }
    })

    if (allTimesheets.length === 0) {
        console.log("❌ NO timesheets found for January 2026!")
        console.log("   You need to create timesheets first.\n")
        return
    }

    console.log(`✅ Found ${allTimesheets.length} total timesheets for Januar 2026\n`)

    // Group by sheetFileName
    const bySheetFileName = new Map<string, number>()
    const byTeamName = new Map<string, number>()
    const byClientId = new Map<string, number>()
    let withPlannedTimes = 0
    let withActualTimes = 0
    let withNullSheetFileName = 0

    for (const ts of allTimesheets) {
        // Count by sheetFileName
        const sfKey = ts.sheetFileName || "NULL"
        bySheetFileName.set(sfKey, (bySheetFileName.get(sfKey) || 0) + 1)

        if (!ts.sheetFileName) {
            withNullSheetFileName++
        }

        // Count by team name
        const teamName = ts.employee?.team?.name || "Unknown"
        byTeamName.set(teamName, (byTeamName.get(teamName) || 0) + 1)

        // Count by client ID
        const cid = ts.employee?.team?.client?.id || "Unknown"
        byClientId.set(cid, (byClientId.get(cid) || 0) + 1)

        // Count timesheets with planned/actual times
        if (ts.plannedStart && ts.plannedEnd) {
            withPlannedTimes++
        }
        if (ts.actualStart && ts.actualEnd) {
            withActualTimes++
        }
    }

    console.log("📊 Breakdown by sheetFileName:\n")
    for (const [sfName, count] of bySheetFileName.entries()) {
        console.log(`   - "${sfName}": ${count} timesheets`)
    }

    console.log("\n📊 Breakdown by Team Name:\n")
    for (const [teamName, count] of byTeamName.entries()) {
        console.log(`   - "${teamName}": ${count} timesheets`)
    }

    console.log("\n📊 Breakdown by Client ID:\n")
    for (const [cid, count] of byClientId.entries()) {
        const client = allTimesheets.find(ts => ts.employee?.team?.client?.id === cid)
        const clientName = client?.employee?.team?.client
            ? `${client.employee.team.client.firstName} ${client.employee.team.client.lastName}`
            : "Unknown"
        console.log(`   - ${cid} (${clientName}): ${count} timesheets`)
    }

    console.log("\n⏰ Timesheets with planned times: " + withPlannedTimes + ` (${Math.round(withPlannedTimes / allTimesheets.length * 100)}%)`)
    console.log("⏰ Timesheets with actual times: " + withActualTimes + ` (${Math.round(withActualTimes / allTimesheets.length * 100)}%)`)
    console.log("⏰ Timesheets with NULL sheetFileName: " + withNullSheetFileName + ` (${Math.round(withNullSheetFileName / allTimesheets.length * 100)}%)\n`)

    // =========================================================================
    // CHECK 3: Specific client timesheets
    // =========================================================================
    console.log("=" + "=".repeat(79) + "\n")
    console.log(`🎯 CHECK 3: Timesheets for Target Client (${clientId})\n`)

    const clientTimesheets = allTimesheets.filter(ts => ts.employee?.team?.client?.id === clientId)

    if (clientTimesheets.length === 0) {
        console.log("❌ NO timesheets found for this specific client!")
        console.log("   Possible reasons:")
        console.log("   1. Employees are not assigned to this client's team")
        console.log("   2. Timesheets exist but use different clientId")
        console.log("   3. Timesheets were created for a different month/year\n")
        return
    }

    console.log(`✅ Found ${clientTimesheets.length} timesheets for this client:\n`)

    // Sample first 5 timesheets
    const samples = clientTimesheets.slice(0, 5)
    for (const ts of samples) {
        console.log(`   Date: ${ts.date.toISOString().split('T')[0]}`)
        console.log(`   Employee: ${ts.employee?.name || "Unknown"}`)
        console.log(`   sheetFileName: "${ts.sheetFileName || "NULL"}"`)
        console.log(`   plannedStart: ${ts.plannedStart || "NULL"}`)
        console.log(`   plannedEnd: ${ts.plannedEnd || "NULL"}`)
        console.log(`   actualStart: ${ts.actualStart || "NULL"}`)
        console.log(`   actualEnd: ${ts.actualEnd || "NULL"}`)
        console.log(`   status: ${ts.status}`)
        console.log()
    }

    if (clientTimesheets.length > 5) {
        console.log(`   ... and ${clientTimesheets.length - 5} more\n`)
    }

    // =========================================================================
    // SUMMARY & RECOMMENDATIONS
    // =========================================================================
    console.log("=" + "=".repeat(79) + "\n")
    console.log("💡 SUMMARY & RECOMMENDATIONS\n")

    // Issue 1: sheetFileName mismatch
    if (submissions.length > 0) {
        const submissionSheetFileName = submissions[0].sheetFileName
        const hasMatch = bySheetFileName.has(submissionSheetFileName)

        if (!hasMatch) {
            console.log("🔴 ISSUE 1: sheetFileName Mismatch")
            console.log(`   TeamSubmission uses: "${submissionSheetFileName}"`)
            console.log(`   But NO timesheets found with this exact name!`)
            console.log()
            console.log("   FIX OPTIONS:")
            console.log(`   a) Update timesheets to use sheetFileName: "${submissionSheetFileName}"`)
            console.log(`   b) Update TeamSubmission to use correct sheetFileName from timesheets`)
            console.log(`   c) Improve getEmployeesInDienstplan() to handle format variations\n`)
        } else {
            console.log("✅ sheetFileName matches between TeamSubmission and Timesheets\n")
        }
    }

    // Issue 2: Missing planned times
    const missingPlannedPercent = Math.round((1 - withPlannedTimes / allTimesheets.length) * 100)
    if (missingPlannedPercent > 50) {
        console.log("🔴 ISSUE 2: Missing Planned Times")
        console.log(`   ${missingPlannedPercent}% of timesheets have NO plannedStart/plannedEnd`)
        console.log(`   This causes PDF to show "Geplante Stunden: 0.00 Std."`)
        console.log()
        console.log("   FIX OPTIONS:")
        console.log("   a) Update export route to fallback to actualStart/actualEnd")
        console.log("   b) Migrate database to copy actualStart → plannedStart")
        console.log("   c) Update UI to require planned times when creating shifts\n")
    } else {
        console.log("✅ Most timesheets have planned times\n")
    }

    // Issue 3: Status filter
    const statusBreakdown = new Map<string, number>()
    for (const ts of clientTimesheets) {
        statusBreakdown.set(ts.status, (statusBreakdown.get(ts.status) || 0) + 1)
    }

    console.log("📊 Status Breakdown for Client Timesheets:\n")
    for (const [status, count] of statusBreakdown.entries()) {
        const allowed = ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"].includes(status)
        const icon = allowed ? "✅" : "❌"
        console.log(`   ${icon} ${status}: ${count} timesheets ${!allowed ? "(FILTERED OUT!)" : ""}`)
    }
    console.log()

    console.log("=" + "=".repeat(79))
    console.log("\n✅ Diagnostic complete!\n")
}

diagnoseCombinedTimesheet()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error running diagnostic:", error)
        process.exit(1)
    })
