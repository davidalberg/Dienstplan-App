import prisma from "@/lib/prisma"

export type ActivityType = "INFO" | "WARNING" | "ERROR" | "SUCCESS"
export type ActivityCategory = "SHIFT" | "SUBMISSION" | "CLIENT" | "EMPLOYEE" | "SYSTEM"

interface LogActivityParams {
    type: ActivityType
    category: ActivityCategory
    action: string
    details?: Record<string, any>
    userId?: string
    userName?: string
    entityId?: string
    entityType?: string
}

/**
 * Aktivität im Protokoll loggen
 * Kann von API Routes aufgerufen werden
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
    try {
        await prisma.activityLog.create({
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
        })
    } catch (error) {
        // Silently fail - logging should not break the main operation
        console.error("[logActivity] Failed to log activity:", error)
    }
}

/**
 * Hilfsfunktion für Schicht-Aktivitäten
 */
export async function logShiftActivity(
    action: string,
    details: Record<string, any>,
    userId?: string,
    userName?: string
) {
    return logActivity({
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
export async function logError(
    category: ActivityCategory,
    action: string,
    error: Error | string,
    details?: Record<string, any>
) {
    return logActivity({
        type: "ERROR",
        category,
        action,
        details: {
            ...details,
            error: error instanceof Error ? error.message : error,
        },
    })
}
