import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'

// Firebase Configuration from Urlaubs-App
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAFNPJs-8hJgfcNk_lHZvkhHVfDR8TZJ7I",
    authDomain: "urlaubsapp-12920.firebaseapp.com",
    projectId: "urlaubsapp-12920",
    storageBucket: "urlaubsapp-12920.firebasestorage.app",
    messagingSenderId: "798498912557",
    appId: "1:798498912557:web:9a2e6c0bba1cebf5f26cf5"
}

// App ID from Urlaubs-App (used in document path)
export const URLAUBS_APP_ID = "urlaubsapp-prod-v1"

// Singleton pattern for Firebase app
let firebaseApp: FirebaseApp | null = null
let firestoreDb: Firestore | null = null

export function getFirebaseApp(): FirebaseApp {
    if (firebaseApp) return firebaseApp

    const existingApps = getApps()
    if (existingApps.length > 0) {
        firebaseApp = existingApps[0]
    } else {
        firebaseApp = initializeApp(firebaseConfig)
    }

    return firebaseApp
}

export function getFirebaseDb(): Firestore {
    if (firestoreDb) return firestoreDb

    const app = getFirebaseApp()
    firestoreDb = getFirestore(app)

    return firestoreDb
}

// Document paths for Urlaubs-App data structure
export const FIRESTORE_PATHS = {
    // Path: artifacts/{appId}/public/data/employees/allEmployees
    employeesDoc: `artifacts/${URLAUBS_APP_ID}/public/data/employees/allEmployees`
} as const
