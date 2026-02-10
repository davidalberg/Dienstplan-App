import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export interface AuthUser {
    id: string
    email: string
    name?: string | null
    role: string
}

export interface AuthSession {
    user: AuthUser
}

/**
 * Require authenticated admin user. Returns session or 401 response.
 *
 * Usage:
 *   const result = await requireAdmin()
 *   if (result instanceof NextResponse) return result
 *   const { user } = result
 */
export async function requireAdmin(): Promise<AuthSession | NextResponse> {
    const session = await auth()
    const user = session?.user as AuthUser | undefined
    if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return { user }
}

/**
 * Require authenticated user (any role). Returns session or 401 response.
 *
 * Usage:
 *   const result = await requireAuth()
 *   if (result instanceof NextResponse) return result
 *   const { user } = result
 */
export async function requireAuth(): Promise<AuthSession | NextResponse> {
    const session = await auth()
    const user = session?.user as AuthUser | undefined
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return { user }
}
