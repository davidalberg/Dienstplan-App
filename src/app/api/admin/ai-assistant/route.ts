import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limiter"
import { cached } from "@/lib/cache"
import { logActivity } from "@/lib/activity-logger"
import { buildSystemPrompt, parseAIResponse } from "@/lib/ai-assistant"
import prisma from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"

// Max ~4MB body (Vercel serverless limit)
const MAX_CONTENT_SIZE = 5.5 * 1024 * 1024

export async function POST(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result
    const { user } = result

    // Rate limit: 10 requests per minute
    const rateLimitResult = checkRateLimit(`ai-assistant:${user.id}`, 10, 60_000)
    if (rateLimitResult.limited) {
        return NextResponse.json(
            { error: "Zu viele Anfragen. Bitte warte eine Minute." },
            { status: 429, headers: rateLimitResult.headers }
        )
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
            { error: "ANTHROPIC_API_KEY ist nicht konfiguriert. Bitte in den Umgebungsvariablen setzen." },
            { status: 500 }
        )
    }

    try {
        const body = await req.json()
        const { type, content, mimeType, fileName } = body as {
            type: "text" | "image" | "pdf" | "xlsx"
            content: string
            mimeType?: string
            fileName?: string
        }

        if (!type || !content) {
            return NextResponse.json({ error: "type und content sind erforderlich" }, { status: 400 })
        }

        // Content size check
        if (content.length > MAX_CONTENT_SIZE) {
            return NextResponse.json(
                { error: "Inhalt zu groß. Maximal ~4MB erlaubt." },
                { status: 400 }
            )
        }

        // Load employees and clients (cached 5min)
        const [employees, clients] = await Promise.all([
            cached("ai-employees", () =>
                prisma.user.findMany({
                    where: { role: "EMPLOYEE" },
                    select: {
                        id: true,
                        name: true,
                        team: {
                            select: {
                                name: true,
                                client: {
                                    select: { firstName: true, lastName: true }
                                }
                            }
                        }
                    },
                    orderBy: { name: "asc" }
                })
            ),
            cached("ai-clients", () =>
                prisma.client.findMany({
                    select: { id: true, firstName: true, lastName: true },
                    orderBy: { lastName: "asc" }
                })
            )
        ])

        const employeeContext = employees.map(e => ({
            id: e.id,
            name: e.name || "Unbekannt",
            teamName: e.team?.name || null,
            clientName: e.team?.client
                ? `${e.team.client.firstName} ${e.team.client.lastName}`
                : null,
        }))

        const clientContext = clients.map(c => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`,
        }))

        const systemPrompt = buildSystemPrompt(employeeContext, clientContext)

        // Build messages for Claude API based on content type
        const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = []

        if (type === "text" || type === "xlsx") {
            // Text and pre-parsed XLSX content
            const prefix = type === "xlsx" && fileName
                ? `Inhalt der Excel-Datei "${fileName}":\n\n`
                : ""
            userContent.push({
                type: "text",
                text: `${prefix}${content}`,
            })
        } else if (type === "image") {
            // Image with vision
            const mediaType = (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp"
            userContent.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: mediaType,
                    data: content,
                },
            })
            userContent.push({
                type: "text",
                text: "Analysiere dieses Bild und extrahiere alle erkennbaren Schichtdaten (Mitarbeiter, Datum, Uhrzeiten).",
            })
        } else if (type === "pdf") {
            userContent.push({
                type: "document",
                source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: content,
                },
            })
            userContent.push({
                type: "text",
                text: "Analysiere dieses PDF-Dokument und extrahiere alle erkennbaren Schichtdaten (Mitarbeiter, Datum, Uhrzeiten).",
            })
        } else {
            return NextResponse.json({ error: "Ungültiger Typ" }, { status: 400 })
        }

        // Call Claude API
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        const message = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
                {
                    role: "user",
                    content: userContent,
                }
            ],
        })

        // Extract text from response
        const responseText = message.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map(block => block.text)
            .join("")

        if (!responseText) {
            return NextResponse.json(
                { error: "Keine Antwort von der KI erhalten" },
                { status: 500 }
            )
        }

        // Parse response
        const aiResponse = parseAIResponse(responseText)

        // Log activity
        await logActivity({
            type: "INFO",
            category: "SYSTEM",
            action: `KI-Assistent: ${aiResponse.shifts.length} Schichten erkannt`,
            details: {
                inputType: type,
                fileName: fileName || null,
                shiftsFound: aiResponse.shifts.length,
                warnings: aiResponse.warnings,
            },
            userId: user.id,
            userName: user.name || user.email || "Admin",
        })

        return NextResponse.json(aiResponse, { headers: rateLimitResult.headers })
    } catch (error: unknown) {
        console.error("[POST /api/admin/ai-assistant] Error:", error)

        const message = error instanceof Error ? error.message : "Unbekannter Fehler"

        // Specific error handling for parsing issues
        if (message.includes("JSON") || message.includes("Antwort")) {
            return NextResponse.json(
                { error: `KI-Antwort konnte nicht verarbeitet werden: ${message}` },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { error: `Fehler bei der KI-Analyse: ${message}` },
            { status: 500 }
        )
    }
}
