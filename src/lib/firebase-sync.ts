import { getFirebaseDb, FIRESTORE_PATHS } from './firebase'
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore'
import { format } from 'date-fns'

// Types matching Urlaubs-App structure
interface VacationRequest {
    id: string
    date: string  // Format: "YYYY-MM-DD"
    type: 'urlaub' | 'krank' | 'sonderurlaub'
    hours: number
    status: 'genehmigt' | 'ausstehend' | 'abgelehnt'
    source: 'dienstplan' | 'urlaubsapp'
    note?: string
    createdAt: string
}

interface FirebaseEmployee {
    id: string
    name: string
    email: string
    requests: VacationRequest[]
    // ... other fields from Urlaubs-App
}

interface FirebaseEmployeesDoc {
    employees: FirebaseEmployee[]
    lastUpdated?: string
}

/**
 * Sync a vacation entry from Dienstplan-App to Firebase (Urlaubs-App)
 */
export async function syncVacationToFirebase(params: {
    employeeEmail: string
    employeeName: string
    date: Date
    hours: number
    type: 'VACATION' | 'SICK'
    note?: string
}): Promise<{ success: boolean; error?: string }> {
    try {
        const db = getFirebaseDb()
        const docRef = doc(db, FIRESTORE_PATHS.employeesDoc)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            console.warn('[Firebase Sync] Employees document does not exist')
            return { success: false, error: 'Firebase document not found' }
        }

        const data = docSnap.data() as FirebaseEmployeesDoc
        const employees = data.employees || []

        // Find employee by email
        const employeeIndex = employees.findIndex(
            emp => emp.email?.toLowerCase() === params.employeeEmail.toLowerCase()
        )

        if (employeeIndex === -1) {
            console.warn(`[Firebase Sync] Employee not found: ${params.employeeEmail}`)
            // Employee doesn't exist in Urlaubs-App - not an error, just skip sync
            return { success: true }
        }

        // Create vacation request
        const request: VacationRequest = {
            id: `dienstplan-${format(params.date, 'yyyyMMdd')}-${Date.now()}`,
            date: format(params.date, 'yyyy-MM-dd'),
            type: params.type === 'VACATION' ? 'urlaub' : 'krank',
            hours: params.hours,
            status: 'genehmigt', // Auto-approved when coming from Dienstplan
            source: 'dienstplan',
            note: params.note,
            createdAt: new Date().toISOString()
        }

        // Check for duplicate (same date)
        const existingRequest = employees[employeeIndex].requests?.find(
            r => r.date === request.date && r.source === 'dienstplan'
        )

        if (existingRequest) {
            console.log(`[Firebase Sync] Entry already exists for ${params.date}`)
            return { success: true }
        }

        // Update the employee's requests array
        const updatedEmployees = [...employees]
        if (!updatedEmployees[employeeIndex].requests) {
            updatedEmployees[employeeIndex].requests = []
        }
        updatedEmployees[employeeIndex].requests.push(request)

        // Write back to Firestore
        await updateDoc(docRef, {
            employees: updatedEmployees,
            lastUpdated: new Date().toISOString()
        })

        console.log(`[Firebase Sync] Synced vacation for ${params.employeeName} on ${request.date}`)
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
    date: Date
}): Promise<{ success: boolean; error?: string }> {
    try {
        const db = getFirebaseDb()
        const docRef = doc(db, FIRESTORE_PATHS.employeesDoc)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            return { success: true } // Nothing to remove
        }

        const data = docSnap.data() as FirebaseEmployeesDoc
        const employees = data.employees || []

        const employeeIndex = employees.findIndex(
            emp => emp.email?.toLowerCase() === params.employeeEmail.toLowerCase()
        )

        if (employeeIndex === -1) {
            return { success: true } // Employee not in Firebase
        }

        const dateStr = format(params.date, 'yyyy-MM-dd')

        // Filter out the request
        const updatedEmployees = [...employees]
        updatedEmployees[employeeIndex].requests = (
            updatedEmployees[employeeIndex].requests || []
        ).filter(r => !(r.date === dateStr && r.source === 'dienstplan'))

        await updateDoc(docRef, {
            employees: updatedEmployees,
            lastUpdated: new Date().toISOString()
        })

        console.log(`[Firebase Sync] Removed vacation for ${params.employeeEmail} on ${dateStr}`)
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
    employees?: FirebaseEmployee[]
    error?: string
}> {
    try {
        const db = getFirebaseDb()
        const docRef = doc(db, FIRESTORE_PATHS.employeesDoc)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            return { success: true, employees: [] }
        }

        const data = docSnap.data() as FirebaseEmployeesDoc
        return {
            success: true,
            employees: data.employees || []
        }

    } catch (error) {
        console.error('[Firebase Sync] Error fetching vacations:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}
