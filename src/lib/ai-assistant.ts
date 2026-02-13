/**
 * KI-Assistent für automatische Diensterstellung
 * Prompt-Builder, Response-Parser und Types
 */

export interface RecognizedShift {
    employeeName: string
    employeeId: string | null
    clientName: string | null
    clientId: string | null
    date: string           // YYYY-MM-DD
    startTime: string      // HH:MM
    endTime: string        // HH:MM
    note: string | null
    confidence: "high" | "medium" | "low"
    matchIssue: string | null
}

export interface AIAssistantResponse {
    shifts: RecognizedShift[]
    summary: string
    warnings: string[]
}

interface EmployeeContext {
    id: string
    name: string
    teamName: string | null
    clientName: string | null
}

interface ClientContext {
    id: string
    name: string
}

/**
 * Baut den System-Prompt mit Mitarbeiter- und Klienten-Kontext
 */
export function buildSystemPrompt(
    employees: EmployeeContext[],
    clients: ClientContext[]
): string {
    const today = new Date().toISOString().split("T")[0]

    const employeeList = employees
        .map(e => {
            const parts = [`ID: ${e.id}`, `Name: ${e.name}`]
            if (e.teamName) parts.push(`Team: ${e.teamName}`)
            if (e.clientName) parts.push(`Klient: ${e.clientName}`)
            return `  - ${parts.join(", ")}`
        })
        .join("\n")

    const clientList = clients
        .map(c => `  - ID: ${c.id}, Name: ${c.name}`)
        .join("\n")

    return `Du bist ein Assistent für die Dienstplanung in einem Assistenzdienst-Unternehmen.
Deine Aufgabe ist es, aus Freitext, Bildern oder Dokumenten Schichtdaten zu extrahieren.

HEUTIGES DATUM: ${today}

VERFÜGBARE MITARBEITER:
${employeeList}

VERFÜGBARE KLIENTEN:
${clientList}

REGELN:
1. Extrahiere alle erkennbaren Schichten (Mitarbeiter + Datum + Uhrzeit)
2. Matche Mitarbeiternamen fuzzy: "Max" → "Maximilian Müller", "Lena M." → "Lena Meier" etc.
3. Wenn ein Name nicht eindeutig zugeordnet werden kann, setze employeeId auf null und beschreibe das Problem in matchIssue
4. Deutsche Datumsformate erkennen: "Mo-Fr", "1.-5. März", "03.02.2026", "nächste Woche" etc.
5. Deutsche Zeitformate erkennen: "8-16 Uhr", "08:00-16:00", "von 8 bis 16", "morgens 7 Uhr" etc.
6. Wenn kein Jahr angegeben ist, verwende das aktuelle Jahr (${today.substring(0, 4)})
7. Wenn "nächste Woche" oder ähnliche relative Angaben vorkommen, berechne basierend auf dem heutigen Datum
8. Setze confidence auf "high" wenn Name und Zeiten eindeutig sind, "medium" bei leichten Unklarheiten, "low" bei starken Annahmen
9. Wenn ein Klient erwähnt wird, versuche ihn zuzuordnen
10. Notizen/Bemerkungen aus dem Text extrahieren (z.B. "bitte pünktlich", "Arzttermin", "Einkaufen")

AUSGABEFORMAT:
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt im folgenden Format (kein Markdown, kein Text davor/danach):
{
  "shifts": [
    {
      "employeeName": "Name wie im Input",
      "employeeId": "gematchte-id-oder-null",
      "clientName": "Klientenname oder null",
      "clientId": "gematchte-id-oder-null",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "note": "Notiz oder null",
      "confidence": "high|medium|low",
      "matchIssue": "Beschreibung des Problems oder null"
    }
  ],
  "summary": "Kurze Zusammenfassung was erkannt wurde",
  "warnings": ["Warnung 1", "Warnung 2"]
}`
}

/**
 * Parsed die KI-Antwort sicher zu AIAssistantResponse
 */
export function parseAIResponse(rawText: string): AIAssistantResponse {
    // Versuche JSON direkt zu parsen
    let cleaned = rawText.trim()

    // Entferne eventuelle Markdown Code-Block-Wrapper
    if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7)
    } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3)
    }
    if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3)
    }
    cleaned = cleaned.trim()

    const parsed = JSON.parse(cleaned)

    // Validierung der Grundstruktur
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Antwort ist kein gültiges Objekt")
    }

    if (!Array.isArray(parsed.shifts)) {
        throw new Error("Antwort enthält kein shifts-Array")
    }

    // Validiere und bereinige jede Schicht
    const shifts: RecognizedShift[] = parsed.shifts.map((s: Record<string, unknown>) => ({
        employeeName: String(s.employeeName || ""),
        employeeId: s.employeeId ? String(s.employeeId) : null,
        clientName: s.clientName ? String(s.clientName) : null,
        clientId: s.clientId ? String(s.clientId) : null,
        date: String(s.date || ""),
        startTime: String(s.startTime || ""),
        endTime: String(s.endTime || ""),
        note: s.note ? String(s.note) : null,
        confidence: (["high", "medium", "low"].includes(String(s.confidence))
            ? String(s.confidence)
            : "low") as "high" | "medium" | "low",
        matchIssue: s.matchIssue ? String(s.matchIssue) : null,
    }))

    return {
        shifts,
        summary: String(parsed.summary || ""),
        warnings: Array.isArray(parsed.warnings)
            ? parsed.warnings.map((w: unknown) => String(w))
            : [],
    }
}
