import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { fetchVacationsFromFirebase } from "@/lib/firebase-sync"

/**
 * GET /api/admin/vacations/firebase
 * Fetch vacation data from Firebase (Urlaubs-App)
 */
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") || "")
    const year = parseInt(searchParams.get("year") || "")

    try {
        const result = await fetchVacationsFromFirebase()

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 })
        }

        // Filter requests by month/year if provided
        let filteredEmployees = result.employees || []

        if (!isNaN(month) && !isNaN(year)) {
            filteredEmployees = filteredEmployees.map(emp => ({
                ...emp,
                requests: (emp.requests || []).filter(req => {
                    const reqDate = new Date(req.date)
                    return reqDate.getMonth() + 1 === month && reqDate.getFullYear() === year
                })
            })).filter(emp => emp.requests.length > 0)
        }

        return NextResponse.json({
            employees: filteredEmployees,
            totalEmployees: result.employees?.length || 0
        })

    } catch (error: any) {
        console.error("[GET /api/admin/vacations/firebase] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
