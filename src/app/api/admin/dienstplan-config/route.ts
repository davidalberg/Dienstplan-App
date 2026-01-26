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
        // Hole alle Teams (für Mitarbeiter-Zuordnung)
        const teams = await prisma.team.findMany({
            orderBy: { name: 'asc' }
        })

        // Formatiere für Frontend (verwendet "sheetFileName" als Name)
        const result = teams.map(team => ({
            sheetFileName: team.name,
            assistantRecipientName: team.assistantRecipientName || team.name,
            assistantRecipientEmail: team.assistantRecipientEmail || "",
            id: team.id
        }))

        return NextResponse.json({ configs: result })
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
