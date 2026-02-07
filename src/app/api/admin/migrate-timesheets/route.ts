import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/migrate-timesheets
 * Migriert alle alten Timesheets (mit teamId aber ohne sheetFileName)
 * Generiert sheetFileName und erstellt DienstplanConfig Eintraege
 *
 * NUR FUER ADMINS
 */
export async function POST(req: NextRequest) {
    try {
        const adminResult = await requireAdmin()
        if (adminResult instanceof NextResponse) return adminResult
        const session = adminResult

        const body = await req.json().catch(() => ({}))
        const { dryRun = true } = body // Default: Dry Run (zeigt nur was passieren wuerde)

        console.log(`[migrate-timesheets] Starting migration (dryRun: ${dryRun})`)

        // 1. Finde alle eindeutigen Team/Monat/Jahr Kombinationen ohne sheetFileName
        const legacyTimesheets = await prisma.timesheet.findMany({
            where: {
                sheetFileName: null,
                teamId: { not: null }
            },
            select: {
                id: true,
                teamId: true,
                month: true,
                year: true,
                team: {
                    select: {
                        id: true,
                        name: true,
                        client: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                }
            }
        })

        if (legacyTimesheets.length === 0) {
            return NextResponse.json({
                success: true,
                message: "Keine Legacy-Timesheets gefunden. Migration nicht erforderlich.",
                stats: {
                    totalTimesheets: 0,
                    uniqueCombinations: 0,
                    configsCreated: 0,
                    timesheetsUpdated: 0
                }
            })
        }

        // 2. Gruppiere nach Team/Monat/Jahr
        const groupedTimesheets = new Map<string, {
            teamId: string
            teamName: string
            month: number
            year: number
            clientEmail: string | null
            clientName: string
            timesheetIds: string[]
        }>()

        for (const ts of legacyTimesheets) {
            if (!ts.team) continue

            const key = `${ts.teamId}_${ts.month}_${ts.year}`
            const client = ts.team.client

            if (!groupedTimesheets.has(key)) {
                groupedTimesheets.set(key, {
                    teamId: ts.team.id,
                    teamName: ts.team.name,
                    month: ts.month,
                    year: ts.year,
                    clientEmail: client?.email || null,
                    clientName: client
                        ? `${client.firstName} ${client.lastName}`
                        : ts.team.name,
                    timesheetIds: []
                })
            }

            groupedTimesheets.get(key)!.timesheetIds.push(ts.id)
        }

        const migrationPlan: Array<{
            sheetFileName: string
            teamName: string
            month: number
            year: number
            timesheetCount: number
            configExists: boolean
            configWillCreate: boolean
        }> = []

        // 3. Erstelle Migration-Plan
        for (const [, group] of groupedTimesheets) {
            const sheetFileName = `Team_${group.teamName.replace(/\s+/g, '_')}_${group.year}`

            // Pruefe ob DienstplanConfig bereits existiert
            const existingConfig = await prisma.dienstplanConfig.findUnique({
                where: { sheetFileName }
            })

            migrationPlan.push({
                sheetFileName,
                teamName: group.teamName,
                month: group.month,
                year: group.year,
                timesheetCount: group.timesheetIds.length,
                configExists: !!existingConfig,
                configWillCreate: !existingConfig
            })
        }

        // DRY RUN: Nur Plan zurueckgeben
        if (dryRun) {
            return NextResponse.json({
                success: true,
                dryRun: true,
                message: "Migration Dry Run - keine Aenderungen vorgenommen",
                plan: migrationPlan,
                stats: {
                    totalTimesheets: legacyTimesheets.length,
                    uniqueCombinations: groupedTimesheets.size,
                    configsToCreate: migrationPlan.filter(p => p.configWillCreate).length,
                    timesheetsToUpdate: legacyTimesheets.length
                }
            })
        }

        // 4. Fuehre Migration in Transaktion aus
        const result = await prisma.$transaction(async (tx) => {
            let configsCreated = 0
            let timesheetsUpdated = 0

            for (const [, group] of groupedTimesheets) {
                const sheetFileName = `Team_${group.teamName.replace(/\s+/g, '_')}_${group.year}`

                // Erstelle DienstplanConfig falls nicht vorhanden
                const existingConfig = await tx.dienstplanConfig.findUnique({
                    where: { sheetFileName }
                })

                if (!existingConfig) {
                    await tx.dienstplanConfig.create({
                        data: {
                            sheetFileName,
                            assistantRecipientEmail: group.clientEmail || "konfiguration-erforderlich@example.com",
                            assistantRecipientName: group.clientName
                        }
                    })
                    configsCreated++
                    console.log(`[migrate-timesheets] Created DienstplanConfig: ${sheetFileName}`)
                }

                // Update alle Timesheets dieser Gruppe
                const updateResult = await tx.timesheet.updateMany({
                    where: {
                        id: { in: group.timesheetIds }
                    },
                    data: {
                        sheetFileName
                    }
                })
                timesheetsUpdated += updateResult.count
                console.log(`[migrate-timesheets] Updated ${updateResult.count} timesheets for ${sheetFileName}`)
            }

            return { configsCreated, timesheetsUpdated }
        }, {
            timeout: 60000 // 60 Sekunden Timeout fuer grosse Migrationen
        })

        return NextResponse.json({
            success: true,
            dryRun: false,
            message: "Migration erfolgreich abgeschlossen",
            plan: migrationPlan,
            stats: {
                totalTimesheets: legacyTimesheets.length,
                uniqueCombinations: groupedTimesheets.size,
                configsCreated: result.configsCreated,
                timesheetsUpdated: result.timesheetsUpdated
            }
        })
    } catch (error: any) {
        console.error("[migrate-timesheets] Error:", error)
        return NextResponse.json({
            error: "Migration failed",
            details: error.message
        }, { status: 500 })
    }
}

/**
 * GET /api/admin/migrate-timesheets
 * Zeigt Status der Legacy-Timesheets (ohne Migration)
 */
export async function GET(req: NextRequest) {
    try {
        const result = await requireAdmin()
        if (result instanceof NextResponse) return result
        const session = result

        // Zaehle Legacy-Timesheets
        const legacyCount = await prisma.timesheet.count({
            where: {
                sheetFileName: null,
                teamId: { not: null }
            }
        })

        // Zaehle moderne Timesheets (mit sheetFileName)
        const modernCount = await prisma.timesheet.count({
            where: {
                sheetFileName: { not: null }
            }
        })

        // Zaehle DienstplanConfigs
        const configCount = await prisma.dienstplanConfig.count()

        return NextResponse.json({
            status: legacyCount === 0 ? "migrated" : "pending",
            stats: {
                legacyTimesheets: legacyCount,
                modernTimesheets: modernCount,
                dienstplanConfigs: configCount,
                migrationNeeded: legacyCount > 0
            },
            hint: legacyCount > 0
                ? "Senden Sie POST mit { dryRun: false } um die Migration auszufuehren"
                : "Keine Migration erforderlich"
        })
    } catch (error: any) {
        console.error("[migrate-timesheets] GET Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
