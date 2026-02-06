/**
 * In-Memory Rate Limiter
 * Einfache Implementierung fuer Vercel Serverless (pro Instance)
 * Schuetzt vor Brute-Force und API-Missbrauch
 */

interface RateLimitEntry {
    count: number
    resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup alte Eintraege alle 5 Minuten
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now

    for (const [key, entry] of store) {
        if (entry.resetAt < now) {
            store.delete(key)
        }
    }
}

/**
 * Prueft ob ein Request erlaubt ist
 * @param key - Eindeutiger Key (z.B. userId oder IP)
 * @param limit - Max Requests pro Window
 * @param windowMs - Zeitfenster in Millisekunden
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function rateLimit(
    key: string,
    limit: number = 100,
    windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
    cleanup()

    const now = Date.now()
    const entry = store.get(key)

    if (!entry || entry.resetAt < now) {
        // Neues Window starten
        store.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
    }

    entry.count++

    if (entry.count > limit) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    }

    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Rate Limit Check fuer API Routes
 * Gibt 429 Response zurueck wenn Limit ueberschritten
 */
export function checkRateLimit(
    identifier: string,
    limit: number = 100,
    windowMs: number = 60_000
): { limited: boolean; headers: Record<string, string> } {
    const result = rateLimit(identifier, limit, windowMs)

    const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000))
    }

    return {
        limited: !result.allowed,
        headers
    }
}
