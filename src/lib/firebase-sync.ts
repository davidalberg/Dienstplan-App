import { getFirebaseDb, FIRESTORE_PATHS } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { format } from 'date-fns'

// Types matching Urlaubs-App structure EXACTLY
interface UrlaubsAppRequest {
    id: string
    date: string  // Format: "YYYY-MM-DD"
    reqHours: number
    // Optional: Source tracking (Urlaubs-App ignores unknown fields)
    source?: 'dienstplan' | 'urlaubsapp'
}

interface UrlaubsAppEmployee {
    id: string
    name: string
    hireDate: string
    exitDate?: string
    daysPerWeek: number
    hoursPerDay: number
    holidayBasis: number
    hourlyWage: number
    requests: UrlaubsAppRequest[]
    variations?: Array<{
        year: number
        month: number
        daysPerWeek: number
    }>
}

interface UrlaubsAppData {
    list: UrlaubsAppEmployee[]
}

/**
 * Sync a vacation entry from Dienstplan-App to Firebase (Urlaubs-App)
 *
 * Finds employee by NAME (Urlaubs-App has no email field)
 * Adds entry to their requests[] array
 */
export async function syncVacationToFirebase(params: {
    employeeEmail: string
    employeeName: string
    date: Date
    hours: number
    type: 'VACATION' | 'SICK'
    note?: string
}): Promise<{ success: boolean; error?: string }> {
    // Only sync VACATION entries (SICK is handled differently in Urlaubs-App)
    if (params.type !== 'VACATION') {
        console.log('[Firebase Sync] Skipping non-vacation entry')
        return { success: true }
    }

    try {
        const db = getFirebaseDb()
        const docRef = doc(db, FIRESTORE_PATHS.employeesDoc)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            console.warn('[Firebase Sync] Employees document does not exist')
            return { success: false, error: 'Firebase document not found' }
        }

        const data = docSnap.data() as UrlaubsAppData
        const employees = data.list || []

        // Find employee by NAME (case-insensitive, partial match)
        const employeeIndex = employees.findIndex(emp => {
            const empName = emp.name?.toLowerCase().trim()
            const searchName = params.employeeName?.toLowerCase().trim()
            // Try exact match first, then partial
            return empName === searchName ||
                   empName?.includes(searchName) ||
                   searchName?.includes(empName)
        })

        if (employeeIndex === -1) {
            console.warn(`[Firebase Sync] Employee not found in Urlaubs-App: "${params.employeeName}"`)
            console.log('[Firebase Sync] Available employees:', employees.map(e => e.name).join(', '))
            // Employee doesn't exist in Urlaubs-App - not an error, just skip sync
            return { success: true }
        }

        const dateStr = format(params.date, 'yyyy-MM-dd')

        // Check for duplicate (same date)
        const existingRequest = employees[employeeIndex].requests?.find(
            r => r.date === dateStr
        )

        if (existingRequest) {
            console.log(`[Firebase Sync] Entry already exists for ${dateStr}`)
            return { success: true }
        }

        // Create vacation request in Urlaubs-App format
        const request: UrlaubsAppRequest = {
            id: `dp-${format(params.date, 'yyyyMMdd')}-${Date.now().toString(36)}`,
            date: dateStr,
            reqHours: params.hours,
            source: 'dienstplan' // Track where it came from
        }

        // Update the employee's requests array
        const updatedEmployees = [...employees]
        if (!updatedEmployees[employeeIndex].requests) {
            updatedEmployees[employeeIndex].requests = []
        }
        updatedEmployees[employeeIndex].requests.push(request)

        // Write back to Firestore
        await setDoc(docRef, { list: updatedEmployees })

        console.log(`[Firebase Sync] ✅ Synced vacation for "${params.employeeName}" on ${dateStr} (${params.hours}h)`)
        return { success: true }

    } catch (error) {
        console.error('[Firebase Sync] Error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

/**
 * Remove a vacation entry from Firebase when deleted in Dienstplan-App
 */
export async function removeVacationFromFirebase(params: {
    employeeEmail: string
    employeeName?: string
    date: Date
}): Promise<{ success: boolean; error?: string }> {
    try {
        const db = getFirebaseDb()
        const docRef = doc(db, FIRESTORE_PATHS.employeesDoc)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            return { success: true } // Nothing to remove
        }

        const data = docSnap.data() as UrlaubsAppData
        const employees = data.list || []

        // Find employee by name
        const searchName = params.employeeName?.toLowerCase().trim()
        const employeeIndex = employees.findIndex(emp => {
            const empName = emp.name?.toLowerCase().trim()
            return empName === searchName ||
                   empName?.includes(searchName || '') ||
                   searchName?.includes(empName || '')
        })

        if (employeeIndex === -1) {
            return { success: true } // Employee not in Firebase
        }

        const dateStr = format(params.date, 'yyyy-MM-dd')

        // Filter out the request (only those from dienstplan or matching date)
        const updatedEmployees = [...employees]
        const originalCount = updatedEmployees[employeeIndex].requests?.length || 0

        updatedEmployees[employeeIndex].requests = (
            updatedEmployees[employeeIndex].requests || []
        ).filter(r => {
            // Remove if: same date AND (source is dienstplan OR no source specified)
            if (r.date === dateStr) {
                return r.source && r.source !== 'dienstplan' // Keep if explicitly from urlaubsapp
            }
            return true // Keep all other entries
        })

        const newCount = updatedEmployees[employeeIndex].requests?.length || 0

        if (originalCount !== newCount) {
            await setDoc(docRef, { list: updatedEmployees })
            console.log(`[Firebase Sync] ✅ Removed vacation for "${params.employeeName}" on ${dateStr}`)
        }

        return { success: true }

    } catch (error) {
        console.error('[Firebase Sync] Error removing vacation:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

/**
 * Fetch all vacation data from Firebase (for display in Urlaubsverwaltung)
 */
export async function fetchVacationsFromFirebase(): Promise<{
    success: boolean
    employees?: UrlaubsAppEmployee[]
    error?: string
}> {
    try {
        const db = getFirebaseDb()
        const docRef = doc(db, FIRESTORE_PATHS.employeesDoc)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            return { success: true, employees: [] }
        }

        const data = docSnap.data() as UrlaubsAppData
        return {
            success: true,
            employees: data.list || []
        }

    } catch (error) {
        console.error('[Firebase Sync] Error fetching vacations:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

/**
 * Get employee stats from Urlaubs-App (remaining vacation hours)
 */
export async function getEmployeeVacationStats(employeeName: string): Promise<{
    found: boolean
    remainingHours?: number
    hoursPerDay?: number
    daysPerWeek?: number
    error?: string
}> {
    try {
        const result = await fetchVacationsFromFirebase()
        if (!result.success || !result.employees) {
            return { found: false, error: result.error }
        }

        const searchName = employeeName.toLowerCase().trim()
        const employee = result.employees.find(emp => {
            const empName = emp.name?.toLowerCase().trim()
            return empName === searchName ||
                   empName?.includes(searchName) ||
                   searchName?.includes(empName)
        })

        if (!employee) {
            return { found: false }
        }

        // Calculate remaining hours (simplified version of Urlaubs-App logic)
        const totalConsumed = (employee.requests || []).reduce(
            (sum, r) => sum + (r.reqHours || 0),
            0
        )

        // Approximate yearly entitlement (proper calc would need full logic from Urlaubs-App)
        const yearlyEntitlement = (employee.holidayBasis / 6) * employee.daysPerWeek * employee.hoursPerDay
        const remainingHours = yearlyEntitlement - totalConsumed

        return {
            found: true,
            remainingHours,
            hoursPerDay: employee.hoursPerDay,
            daysPerWeek: employee.daysPerWeek
        }

    } catch (error) {
        return {
            found: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}
