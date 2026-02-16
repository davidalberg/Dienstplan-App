import prisma from "@/lib/prisma"

export type ActivityType = "INFO" | "WARNING" | "ERROR" | "SUCCESS"
export type ActivityCategory = "SHIFT" | "SUBMISSION" | "CLIENT" | "EMPLOYEE" | "SYSTEM"

interface LogActivityParams {
    type: ActivityType
    category: ActivityCategory
    action: string
    details?: Record<string, unknown>
    userId?: string
    userName?: string
    entityId?: string
    entityType?: string
}

/**
 * Aktivität im Protokoll loggen (fire-and-forget)
 * Kann von API Routes aufgerufen werden
 * Blockiert NICHT den Request - DB-Write läuft im Hintergrund
 */
export function logActivity(params: LogActivityParams): void {
    prisma.activityLog.create({
        data: {
            type: params.type,
            category: params.category,
            action: params.action,
            details: params.details ? JSON.stringify(params.details) : null,
            userId: params.userId,
            userName: params.userName,
            entityId: params.entityId,
            entityType: params.entityType,
        }
    }).catch(error => {
        console.error("[logActivity] Failed:", error)
    })
}

/**
 * Hilfsfunktion für Schicht-Aktivitäten
 */
export function logShiftActivity(
    action: string,
    details: Record<string, unknown>,
    userId?: string,
    userName?: string
): void {
    logActivity({
        type: "INFO",
        category: "SHIFT",
        action,
        details,
        userId,
        userName,
        entityType: "Timesheet",
    })
}

/**
 * Hilfsfunktion für Fehler-Logging
 */
export function logError(
    category: ActivityCategory,
    action: string,
    error: Error | string,
    details?: Record<string, unknown>
): void {
    logActivity({
        type: "ERROR",
        category,
        action,
        details: {
            ...details,
            error: error instanceof Error ? error.message : error,
        },
    })
}
