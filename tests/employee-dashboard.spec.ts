import { test, expect } from './fixtures'

test.describe('Employee Dashboard', () => {
    // Use employee auth state
    test.use({ storageState: 'tests/.auth/employee.json' })

    test('Dashboard lädt Schichten korrekt', async ({ dashboardPage }) => {
        await dashboardPage.goto()

        // Sollte mindestens eine Schicht anzeigen
        const count = await dashboardPage.getShiftCount()
        expect(count).toBeGreaterThan(0)
    })

    test('Schicht bestätigen (CONFIRM) via API', async ({ page, prisma, testUsers }) => {
        await page.goto('/dashboard')

        // Finde eine nicht bestätigte Schicht
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const plannedShift = await prisma.timesheet.findFirst({
            where: {
                employeeId: employee!.id,
                status: 'PLANNED',
            },
        })

        if (!plannedShift) {
            test.skip()
            return
        }

        // Bestätige via API
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: plannedShift.id,
                action: 'CONFIRM',
            },
        })

        expect(response.ok()).toBeTruthy()

        // Verifiziere in DB
        const updatedShift = await prisma.timesheet.findUnique({
            where: { id: plannedShift.id },
        })

        expect(updatedShift?.status).toBe('CONFIRMED')
        expect(updatedShift?.actualStart).toBe(plannedShift.plannedStart)
        expect(updatedShift?.actualEnd).toBe(plannedShift.plannedEnd)

        // Reset für andere Tests
        await prisma.timesheet.update({
            where: { id: plannedShift.id },
            data: { status: 'PLANNED', actualStart: null, actualEnd: null },
        })
    })

    test('Schicht mit geänderten Ist-Zeiten speichern via API', async ({ page, prisma, testUsers }) => {
        await page.goto('/dashboard')

        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Finde eine Schicht zum Bearbeiten
        const shift = await prisma.timesheet.findFirst({
            where: { employeeId: employee!.id },
            orderBy: { date: 'asc' },
        })

        if (!shift) {
            test.skip()
            return
        }

        // Ändere Zeiten via API
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: shift.id,
                actualStart: '08:15',
                actualEnd: '16:30',
            },
        })

        expect(response.ok()).toBeTruthy()

        // Verifiziere in DB
        const updatedShift = await prisma.timesheet.findUnique({
            where: { id: shift.id },
        })

        expect(updatedShift?.actualStart).toBe('08:15')
        expect(updatedShift?.actualEnd).toBe('16:30')
        expect(updatedShift?.status).toBe('CHANGED')

        // Reset
        await prisma.timesheet.update({
            where: { id: shift.id },
            data: { status: 'PLANNED', actualStart: null, actualEnd: null },
        })
    })

    test('Krank melden (absenceType = SICK)', async ({ page, prisma, testUsers }) => {
        await page.goto('/dashboard')

        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Finde eine Schicht ohne Backup (um Backup-Logik zu vermeiden)
        const shift = await prisma.timesheet.findFirst({
            where: {
                employeeId: employee!.id,
                backupEmployeeId: null,
            },
        })

        if (!shift) {
            // Erstelle eine Test-Schicht ohne Backup
            const testDate = new Date()
            testDate.setDate(testDate.getDate() + 30)

            const newShift = await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: testDate,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    month: testDate.getMonth() + 1,
                    year: testDate.getFullYear(),
                    status: 'PLANNED',
                    breakMinutes: 0,
                },
            })

            // API-Call direkt
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: newShift.id,
                    absenceType: 'SICK',
                },
            })

            expect(response.ok()).toBeTruthy()

            const updated = await prisma.timesheet.findUnique({ where: { id: newShift.id } })
            expect(updated?.absenceType).toBe('SICK')

            // Cleanup
            await prisma.timesheet.delete({ where: { id: newShift.id } })
        } else {
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    absenceType: 'SICK',
                },
            })

            expect(response.ok()).toBeTruthy()

            const updated = await prisma.timesheet.findUnique({ where: { id: shift.id } })
            expect(updated?.absenceType).toBe('SICK')

            // Reset
            await prisma.timesheet.update({
                where: { id: shift.id },
                data: { absenceType: null },
            })
        }
    })

    test('Urlaub melden (absenceType = VACATION)', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Erstelle Test-Schicht
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 31)

        const newShift = await prisma.timesheet.create({
            data: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                breakMinutes: 0,
            },
        })

        // API-Call
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: newShift.id,
                absenceType: 'VACATION',
            },
        })

        expect(response.ok()).toBeTruthy()

        const updated = await prisma.timesheet.findUnique({ where: { id: newShift.id } })
        expect(updated?.absenceType).toBe('VACATION')

        // Cleanup
        await prisma.timesheet.delete({ where: { id: newShift.id } })
    })

    test('Schicht zurücksetzen (UNCONFIRM)', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Erstelle bestätigte Schicht
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 32)

        const confirmedShift = await prisma.timesheet.create({
            data: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                actualStart: '08:00',
                actualEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'CONFIRMED',
                breakMinutes: 0,
            },
        })

        // Unconfirm via API
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: confirmedShift.id,
                action: 'UNCONFIRM',
            },
        })

        expect(response.ok()).toBeTruthy()

        const updated = await prisma.timesheet.findUnique({ where: { id: confirmedShift.id } })
        expect(updated?.status).toBe('PLANNED')
        expect(updated?.actualStart).toBeNull()
        expect(updated?.actualEnd).toBeNull()

        // Cleanup
        await prisma.timesheet.delete({ where: { id: confirmedShift.id } })
    })

    test('Backup-Schichten API gibt potentielle Backups zurück', async ({ page, prisma, testUsers }) => {
        // Prüfe ob die API potentielle Backup-Schichten zurückgibt
        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

        // Prüfe ob Backup-Schichten existieren
        const potentialBackupShifts = await prisma.timesheet.findMany({
            where: {
                backupEmployeeId: backupEmployee!.id,
                absenceType: null,
            },
        })

        if (potentialBackupShifts.length === 0) {
            test.skip()
            return
        }

        // Login als Backup und hole Timesheets
        await page.goto('/login')
        await page.locator('input[type="email"]').fill(testUsers.backup.email)
        await page.locator('input[type="password"]').fill(testUsers.backup.password)
        await page.locator('button[type="submit"]').click()
        await page.waitForURL('**/dashboard')

        const currentMonth = new Date().getMonth() + 1
        const currentYear = new Date().getFullYear()

        const response = await page.request.get(`/api/timesheets?month=${currentMonth}&year=${currentYear}`)
        expect(response.ok()).toBeTruthy()

        const data = await response.json()
        expect(data.potentialBackupShifts).toBeDefined()
        expect(Array.isArray(data.potentialBackupShifts)).toBe(true)
    })
})
