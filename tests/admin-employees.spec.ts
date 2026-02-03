import { test, expect } from './fixtures'

test.describe('Mitarbeiter-Verwaltung', () => {
    // Use admin auth state
    test.use({ storageState: 'tests/.auth/admin.json' })

    test('Mitarbeiter-Seite lädt korrekt', async ({ employeesPage }) => {
        await employeesPage.goto()

        // Create button should be visible
        await expect(employeesPage.createButton).toBeVisible()
    })

    test('Mitarbeiter erstellen', async ({ employeesPage, page, prisma }) => {
        await employeesPage.goto()

        const uniqueEmail = `test-${Date.now()}@test.de`

        // Create via API (more reliable than UI)
        const response = await page.request.post('/api/admin/employees', {
            data: {
                name: 'Neuer Testmitarbeiter',
                email: uniqueEmail,
                password: 'test123',
                employeeId: `EMP-${Date.now()}`,
                hourlyWage: 18.50,
            },
        })

        expect(response.ok()).toBeTruthy()

        // Verifiziere in DB
        const created = await prisma.user.findUnique({ where: { email: uniqueEmail } })
        expect(created).toBeTruthy()
        expect(created?.name).toBe('Neuer Testmitarbeiter')
        expect(created?.hourlyWage).toBe(18.50)

        // Cleanup
        await prisma.user.delete({ where: { email: uniqueEmail } })
    })

    test('Mitarbeiter bearbeiten', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const originalWage = employee?.hourlyWage

        // Update via API
        const response = await page.request.put('/api/admin/employees', {
            data: {
                id: employee!.id,
                hourlyWage: 20.00,
            },
        })

        expect(response.ok()).toBeTruthy()

        const updated = await prisma.user.findUnique({ where: { id: employee!.id } })
        expect(updated?.hourlyWage).toBe(20.00)

        // Reset
        await prisma.user.update({
            where: { id: employee!.id },
            data: { hourlyWage: originalWage },
        })
    })

    test('Urlaubstage werden korrekt angezeigt', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Erstelle Urlaubsschicht
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 50)

        const vacationShift = await prisma.timesheet.create({
            data: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                absenceType: 'VACATION',
                breakMinutes: 0,
            },
        })

        // API-Call für Mitarbeiter-Liste
        const response = await page.request.get('/api/admin/employees')
        expect(response.ok()).toBeTruthy()

        const data = await response.json()
        const employeeData = data.employees.find((e: any) => e.id === employee!.id)

        expect(employeeData.vacationDays).toBeGreaterThanOrEqual(1)

        // Cleanup
        await prisma.timesheet.delete({ where: { id: vacationShift.id } })
    })

    test('Krankheitstage werden korrekt angezeigt', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Erstelle Krankheitsschicht
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 51)

        const sickShift = await prisma.timesheet.create({
            data: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                absenceType: 'SICK',
                breakMinutes: 0,
            },
        })

        // API-Call für Mitarbeiter-Liste
        const response = await page.request.get('/api/admin/employees')
        expect(response.ok()).toBeTruthy()

        const data = await response.json()
        const employeeData = data.employees.find((e: any) => e.id === employee!.id)

        expect(employeeData.sickDays).toBeGreaterThanOrEqual(1)

        // Cleanup
        await prisma.timesheet.delete({ where: { id: sickShift.id } })
    })

    test('Mitarbeiter mit Timesheets kann nicht gelöscht werden', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Mitarbeiter hat Timesheets (aus Seed)
        const timesheetCount = await prisma.timesheet.count({ where: { employeeId: employee!.id } })

        // Skip wenn keine Timesheets existieren (Test-Seeding hat keine erstellt)
        if (timesheetCount === 0) {
            test.skip()
            return
        }

        // Löschversuch sollte fehlschlagen
        const response = await page.request.delete(`/api/admin/employees?id=${employee!.id}`)

        expect(response.status()).toBe(400)

        const data = await response.json()
        expect(data.error).toContain('Stundeneinträge')
    })

    test('Neuer Mitarbeiter ohne Timesheets kann gelöscht werden', async ({ page, prisma }) => {
        // Erstelle temporären Mitarbeiter
        const uniqueEmail = `delete-test-${Date.now()}@test.de`

        const response = await page.request.post('/api/admin/employees', {
            data: {
                name: 'Zum Löschen',
                email: uniqueEmail,
                password: 'test123',
            },
        })

        expect(response.ok()).toBeTruthy()

        const created = await prisma.user.findUnique({ where: { email: uniqueEmail } })
        expect(created).toBeTruthy()

        // Löschen sollte funktionieren
        const deleteResponse = await page.request.delete(`/api/admin/employees?id=${created!.id}`)
        expect(deleteResponse.ok()).toBeTruthy()

        // Verifiziere Löschung
        const deleted = await prisma.user.findUnique({ where: { email: uniqueEmail } })
        expect(deleted).toBeNull()
    })
})
