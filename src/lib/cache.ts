/**
 * In-Memory Cache mit TTL
 * Fuer Teams, Clients und andere selten aendernde Daten
 */

interface CacheEntry<T> {
    data: T
    expiresAt: number
}

const cacheStore = new Map<string, CacheEntry<unknown>>()

/**
 * Holt einen Wert aus dem Cache oder fuehrt die Factory-Funktion aus
 * @param key - Cache Key
 * @param factory - Async Funktion die den Wert liefert (wird nur bei Cache-Miss aufgerufen)
 * @param ttlMs - Time-to-Live in Millisekunden (default: 5 Minuten)
 */
export async function cached<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number = 5 * 60 * 1000
): Promise<T> {
    const now = Date.now()
    const existing = cacheStore.get(key) as CacheEntry<T> | undefined

    if (existing && existing.expiresAt > now) {
        return existing.data
    }

    const data = await factory()
    cacheStore.set(key, { data, expiresAt: now + ttlMs })
    return data
}

/**
 * Invalidiert einen spezifischen Cache-Key
 */
export function invalidateCache(key: string): void {
    cacheStore.delete(key)
}

/**
 * Invalidiert alle Cache-Keys die mit einem Prefix beginnen
 */
export function invalidateCacheByPrefix(prefix: string): void {
    for (const key of cacheStore.keys()) {
        if (key.startsWith(prefix)) {
            cacheStore.delete(key)
        }
    }
}

/**
 * Leert den gesamten Cache
 */
export function clearCache(): void {
    cacheStore.clear()
}
