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
        // Hole alle eindeutigen sheetFileNames aus der Timesheet-Tabelle
        const sheetFileNames = await prisma.timesheet.findMany({
            where: {
                sheetFileName: { not: null }
            },
            select: {
                sheetFileName: true
            },
            distinct: ['sheetFileName']
        })

        // Hole alle DienstplanConfigs
        const configs = await prisma.dienstplanConfig.findMany()

        // Erstelle eine Map für schnellen Lookup
        const configMap = new Map(
            configs.map(c => [c.sheetFileName, c])
        )

        // Kombiniere die Daten
        const result = sheetFileNames
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

        return NextResponse.json({ dienstplaene: result })
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

        // Upsert: Erstellen oder aktualisieren
        const config = await prisma.dienstplanConfig.upsert({
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

        return NextResponse.json({
            success: true,
            config
        })
    } catch (error: any) {
        console.error("[POST /api/admin/dienstplan-config] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
