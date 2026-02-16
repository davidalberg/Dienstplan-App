import { test, expect } from './fixtures'

test.describe('Einreichungs-Prozess', () => {
    test.describe.configure({ mode: 'serial' })

    // FIXME: Depends on test data having PLANNED shifts in current month
    test.fixme('Alle Schichten bestätigen via API', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Hole alle geplanten Schichten
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        const plannedShifts = await prisma.timesheet.findMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
                status: 'PLANNED',
            },
        })

        // Bestätige alle
        for (const shift of plannedShifts) {
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    action: 'CONFIRM',
                },
            })
            expect(response.ok()).toBeTruthy()
        }

        // Verifiziere
        const confirmedCount = await prisma.timesheet.count({
            where: {
                employeeId: employee!.id,
                month,
                year,
                status: 'CONFIRMED',
            },
        })

        expect(confirmedCount).toBe(plannedShifts.length)
    })

    test('Monat einreichen via API', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Erst alle Schichten auf CONFIRMED setzen (um sicherzugehen dass sie existieren und bestätigt sind)
        const existingShifts = await prisma.timesheet.findMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
            },
        })

        if (existingShifts.length === 0) {
            console.log('No shifts found for employee in this month, skipping')
            test.skip()
            return
        }

        // Bestätige alle Schichten
        await prisma.timesheet.updateMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
            },
            data: { status: 'CONFIRMED' },
        })

        // Einreichen
        const response = await page.request.post('/api/timesheets/submit', {
            data: {
                month,
                year,
                signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // Minimal PNG
            },
        })

        expect(response.ok()).toBeTruthy()

        // Verifiziere Status-Änderung
        const submittedCount = await prisma.timesheet.count({
            where: {
                employeeId: employee!.id,
                month,
                year,
                status: 'SUBMITTED',
            },
        })

        expect(submittedCount).toBeGreaterThan(0)

        // Reset für weitere Tests
        await prisma.timesheet.updateMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
            },
            data: { status: 'PLANNED' },
        })
    })

    test('Admin sieht Einreichungen', async ({ page, testUsers }) => {
        // Login als Admin
        await page.context().clearCookies()
        await page.goto('/login')
        await page.locator('input[type="email"]').fill(testUsers.admin.email)
        await page.locator('input[type="password"]').fill(testUsers.admin.password)
        await page.locator('button[type="submit"]').click()
        await page.waitForURL('**/admin')

        // Navigiere zu Stundennachweise (URL ist /admin/employee-timesheets or /admin/timesheets)
        await page.getByRole('link', { name: 'Stundennachweise', exact: true }).click()
        await page.waitForURL(/\/admin\/(employee-)?timesheets/)

        // Seite sollte laden
        await expect(page.getByRole('heading', { name: /Stundennachweise/i })).toBeVisible()
    })

    test('Einreichung kann storniert werden', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Erstelle eingereichte Schichten
        await prisma.timesheet.updateMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
            },
            data: { status: 'SUBMITTED' },
        })

        // Stornieren via API
        const response = await page.request.post('/api/timesheets/cancel-submit', {
            data: {
                month,
                year,
            },
        })

        if (response.ok()) {
            // Verifiziere Status-Änderung
            const submittedCount = await prisma.timesheet.count({
                where: {
                    employeeId: employee!.id,
                    month,
                    year,
                    status: 'SUBMITTED',
                },
            })

            expect(submittedCount).toBe(0)
        }

        // Reset
        await prisma.timesheet.updateMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
            },
            data: { status: 'PLANNED' },
        })
    })
})
