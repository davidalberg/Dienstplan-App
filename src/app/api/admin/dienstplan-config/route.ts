import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/admin/dienstplan-config
 * Liste aller Dienstplan-Konfigurationen
 * Zeigt alle sheetFileNames aus Timesheet-Tabelle + ob konfiguriert
 */
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // 1. Hole alle eindeutigen sheetFileNames aus Timesheet-Tabelle
        const sheetFileNames = await prisma.timesheet.findMany({
            where: {
                sheetFileName: { not: null }
            },
            select: {
                sheetFileName: true
            },
            distinct: ['sheetFileName']
        })

        // 2. Hole alle DienstplanConfigs
        const dienstplanConfigs = await prisma.dienstplanConfig.findMany()

        // 3. Hole alle Teams (für Mitarbeiter-Zuordnung)
        const teams = await prisma.team.findMany({
            orderBy: { name: 'asc' }
        })

        // 4. Erstelle eine Map für schnellen Lookup
        const configMap = new Map(
            dienstplanConfigs.map(c => [c.sheetFileName, c])
        )

        // 5. Kombiniere die Daten für Dienstplan-Config-Seite
        const dienstplaene = sheetFileNames
            .filter(item => item.sheetFileName !== null)
            .map(item => {
                const sheetFileName = item.sheetFileName!
                const config = configMap.get(sheetFileName)

                return {
                    sheetFileName,
                    configured: !!config,
                    assistantRecipientEmail: config?.assistantRecipientEmail || null,
                    assistantRecipientName: config?.assistantRecipientName || null,
                    id: config?.id || null
                }
            })
            .sort((a, b) => a.sheetFileName.localeCompare(b.sheetFileName))

        // 6. Für Mitarbeiter-Dropdown: Teams aus Team-Tabelle
        const configs = teams.map(team => ({
            sheetFileName: team.name,
            assistantRecipientName: team.assistantRecipientName || team.name,
            assistantRecipientEmail: team.assistantRecipientEmail || "",
            id: team.id
        }))

        return NextResponse.json({
            dienstplaene, // Für Dienstplan-Config-Seite (alle mit configured-Status)
            configs // Für Mitarbeiter-Dropdown (Teams aus Team-Tabelle)
        })
    } catch (error: any) {
        console.error("[GET /api/admin/dienstplan-config] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * POST /api/admin/dienstplan-config
 * Erstellt oder aktualisiert eine Dienstplan-Konfiguration
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { sheetFileName, assistantRecipientEmail, assistantRecipientName } = body

        // Validierung
        if (!sheetFileName || !assistantRecipientEmail || !assistantRecipientName) {
            return NextResponse.json({
                error: "Fehlende Felder: sheetFileName, assistantRecipientEmail und assistantRecipientName sind erforderlich"
            }, { status: 400 })
        }

        // Email-Format validieren
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(assistantRecipientEmail)) {
            return NextResponse.json({
                error: "Ungültige E-Mail-Adresse"
            }, { status: 400 })
        }

        // Upsert DienstplanConfig AND Team (beide synchron halten)
        const result = await prisma.$transaction(async (tx) => {
            // 1. Upsert DienstplanConfig
            const config = await tx.dienstplanConfig.upsert({
                where: { sheetFileName },
                update: {
                    assistantRecipientEmail,
                    assistantRecipientName
                },
                create: {
                    sheetFileName,
                    assistantRecipientEmail,
                    assistantRecipientName
                }
            })

            // 2. Upsert Team (für Mitarbeiter-Zuordnung)
            const team = await tx.team.upsert({
                where: { name: sheetFileName },
                update: {
                    assistantRecipientEmail,
                    assistantRecipientName
                },
                create: {
                    name: sheetFileName,
                    assistantRecipientEmail,
                    assistantRecipientName
                }
            })

            return { config, team }
        })

        return NextResponse.json({
            success: true,
            config: result.config,
            team: result.team
        })
    } catch (error: any) {
        console.error("[POST /api/admin/dienstplan-config] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
