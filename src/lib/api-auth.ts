import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { Session } from "next-auth"

/**
 * Require authenticated admin user. Returns session or 401 response.
 *
 * Usage:
 *   const result = await requireAdmin()
 *   if (result instanceof NextResponse) return result
 *   const session = result
 */
export async function requireAdmin(): Promise<Session | NextResponse> {
    const session = await auth()
    if (!session?.user || (session.user as unknown as { role: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return session
}

/**
 * Require authenticated user (any role). Returns session or 401 response.
 *
 * Usage:
 *   const result = await requireAuth()
 *   if (result instanceof NextResponse) return result
 *   const session = result
 */
export async function requireAuth(): Promise<Session | NextResponse> {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return session
}
