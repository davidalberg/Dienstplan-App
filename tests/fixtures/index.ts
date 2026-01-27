import { test as base, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { LoginPage } from '../pages/login.page'
import { DashboardPage } from '../pages/dashboard.page'
import { AdminPage } from '../pages/admin.page'
import { SchedulePage } from '../pages/schedule.page'
import { EmployeesPage } from '../pages/employees.page'

// Prisma Client mit PgBouncer-Konfiguration für Supabase
// Fix für "prepared statement already exists" Fehler
function createPrismaClient() {
    const databaseUrl = process.env.DATABASE_URL || ''

    // Füge pgbouncer Parameter hinzu falls nicht vorhanden
    let optimizedUrl = databaseUrl
    if (!optimizedUrl.includes('pgbouncer=true')) {
        const separator = optimizedUrl.includes('?') ? '&' : '?'
        optimizedUrl += `${separator}pgbouncer=true`
    }

    return new PrismaClient({
        datasources: {
            db: { url: optimizedUrl }
        },
        log: ['error']
    })
}

// Singleton Prisma Client für Tests
let prisma: PrismaClient | null = null

function getPrismaClient() {
    if (!prisma) {
        prisma = createPrismaClient()
    }
    return prisma
}

// Cleanup-Funktion für Test-Ende
export async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect()
        prisma = null
    }
}

// Test user types
interface TestUser {
    email: string
    password: string
    name: string
    role: 'ADMIN' | 'EMPLOYEE' | 'TEAMLEAD'
}

// Test fixtures interface
interface TestFixtures {
    loginPage: LoginPage
    dashboardPage: DashboardPage
    adminPage: AdminPage
    schedulePage: SchedulePage
    employeesPage: EmployeesPage
    prisma: PrismaClient
    testUsers: {
        admin: TestUser
        employee: TestUser
        teamlead: TestUser
        backup: TestUser
    }
    testMonth: number
    testYear: number
}

export const test = base.extend<TestFixtures>({
    // Page Objects
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page))
    },

    dashboardPage: async ({ page }, use) => {
        await use(new DashboardPage(page))
    },

    adminPage: async ({ page }, use) => {
        await use(new AdminPage(page))
    },

    schedulePage: async ({ page }, use) => {
        await use(new SchedulePage(page))
    },

    employeesPage: async ({ page }, use) => {
        await use(new EmployeesPage(page))
    },

    // Prisma Client - mit automatischem Disconnect nach Test
    prisma: async ({}, use) => {
        const client = getPrismaClient()
        await use(client)
        // Disconnect nach jedem Test um Connection-Pool-Probleme zu vermeiden
        await client.$disconnect()
        prisma = null
    },

    // Test Users
    testUsers: async ({}, use) => {
        await use({
            admin: {
                email: process.env.TEST_ADMIN_EMAIL || 'admin@test.de',
                password: process.env.TEST_ADMIN_PASSWORD || 'test123',
                name: 'Test Admin',
                role: 'ADMIN',
            },
            employee: {
                email: process.env.TEST_EMPLOYEE_EMAIL || 'mitarbeiter@test.de',
                password: process.env.TEST_EMPLOYEE_PASSWORD || 'test123',
                name: 'Max Mustermann',
                role: 'EMPLOYEE',
            },
            teamlead: {
                email: process.env.TEST_TEAMLEAD_EMAIL || 'teamlead@test.de',
                password: process.env.TEST_TEAMLEAD_PASSWORD || 'test123',
                name: 'Test Teamlead',
                role: 'TEAMLEAD',
            },
            backup: {
                email: process.env.TEST_BACKUP_EMAIL || 'backup@test.de',
                password: process.env.TEST_BACKUP_PASSWORD || 'test123',
                name: 'Backup Mitarbeiter',
                role: 'EMPLOYEE',
            },
        })
    },

    // Test period
    testMonth: async ({}, use) => {
        await use(new Date().getMonth() + 1)
    },

    testYear: async ({}, use) => {
        await use(new Date().getFullYear())
    },
})

export { expect }

// Helper functions for DB operations in tests

/**
 * Reset test database to initial state
 */
export async function resetTestDatabase() {
    const client = getPrismaClient()
    await client.employeeSignature.deleteMany()
    await client.teamSubmission.deleteMany()
    await client.monthlySubmission.deleteMany()
    await client.auditLog.deleteMany()
    // Don't delete timesheets - they're needed for tests
}

/**
 * Create a test shift
 */
export async function createTestShift(data: {
    employeeId: string
    date: Date
    plannedStart: string
    plannedEnd: string
    backupEmployeeId?: string
    status?: string
    teamId?: string
    note?: string
}) {
    const client = getPrismaClient()
    return client.timesheet.create({
        data: {
            ...data,
            month: data.date.getMonth() + 1,
            year: data.date.getFullYear(),
            status: data.status || 'PLANNED',
            breakMinutes: 0,
        },
    })
}

/**
 * Get employee by email
 */
export async function getEmployeeByEmail(email: string) {
    const client = getPrismaClient()
    return client.user.findUnique({ where: { email } })
}

/**
 * Get shifts for employee
 */
export async function getShiftsForEmployee(employeeId: string, month?: number, year?: number) {
    const client = getPrismaClient()
    const where: Record<string, unknown> = { employeeId }
    if (month) where.month = month
    if (year) where.year = year
    return client.timesheet.findMany({ where, orderBy: { date: 'asc' } })
}

/**
 * Delete shift by ID
 */
export async function deleteShift(id: string) {
    const client = getPrismaClient()
    return client.timesheet.delete({ where: { id } })
}

/**
 * Update shift
 */
export async function updateShift(id: string, data: Record<string, unknown>) {
    const client = getPrismaClient()
    return client.timesheet.update({ where: { id }, data })
}
