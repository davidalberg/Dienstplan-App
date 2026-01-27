import { test, expect } from './fixtures'

test.describe('Admin Dienstplan-Editor', () => {
    // Use admin auth state
    test.use({ storageState: 'tests/.auth/admin.json' })

    test('Dienstplan-Editor lädt korrekt', async ({ schedulePage }) => {
        await schedulePage.goto()

        // Create button should be visible
        await expect(schedulePage.createButton).toBeVisible()
    })

    test('Einzelne Schicht erstellen via API', async ({ page, prisma, testUsers }) => {
        await page.goto('/admin/schedule')

        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Datum in der Zukunft (40 Tage) - verwende UTC konsistent
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 40)
        const dateStr = testDate.toISOString().split('T')[0]

        // Lösche eventuelle existierende Schicht - verwende Monat/Jahr statt exaktes Datum
        const month = testDate.getMonth() + 1
        const year = testDate.getFullYear()
        const day = testDate.getDate()

        await prisma.timesheet.deleteMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
                plannedStart: '09:00',
                plannedEnd: '17:00',
            },
        })

        const countBefore = await prisma.timesheet.count({ where: { employeeId: employee!.id } })

        // Create via API
        const response = await page.request.post('/api/admin/schedule', {
            data: {
                employeeId: employee!.id,
                date: dateStr,
                plannedStart: '09:00',
                plannedEnd: '17:00',
            },
        })

        expect(response.ok()).toBeTruthy()
        const apiResult = await response.json()

        // API gibt die erstellte Schicht zurück
        expect(apiResult.id).toBeTruthy()

        const countAfter = await prisma.timesheet.count({ where: { employeeId: employee!.id } })
        expect(countAfter).toBe(countBefore + 1)

        // Verifiziere Details direkt über die ID
        const newShift = await prisma.timesheet.findUnique({
            where: { id: apiResult.id },
        })

        expect(newShift).toBeTruthy()
        expect(newShift?.plannedStart).toBe('09:00')
        expect(newShift?.plannedEnd).toBe('17:00')

        // Cleanup
        if (newShift) {
            await prisma.timesheet.delete({ where: { id: newShift.id } })
        }
    })

    test('Schicht mit Wiederholung erstellen (Mo-Fr)', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Nächste Woche - berechne übernächsten Montag
        const startDate = new Date()
        const daysUntilMonday = (8 - startDate.getDay()) % 7 || 7
        startDate.setDate(startDate.getDate() + daysUntilMonday + 7)
        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + 4) // Freitag

        const startStr = startDate.toISOString().split('T')[0]
        const endStr = endDate.toISOString().split('T')[0]

        // Lösche eventuelle existierende Schichten im Zeitraum
        const startMonth = startDate.getMonth() + 1
        const startYear = startDate.getFullYear()

        await prisma.timesheet.deleteMany({
            where: {
                employeeId: employee!.id,
                month: startMonth,
                year: startYear,
                plannedStart: '08:00',
                plannedEnd: '16:00',
            },
        })

        const countBefore = await prisma.timesheet.count({ where: { employeeId: employee!.id } })

        // API-Call für Bulk-Erstellung
        const response = await page.request.post('/api/admin/schedule', {
            data: {
                bulk: true,
                employeeId: employee!.id,
                startDate: startStr,
                endDate: endStr,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                repeatDays: [1, 2, 3, 4, 5], // Mo-Fr
            },
        })

        expect(response.ok()).toBeTruthy()
        const result = await response.json()

        // Sollte 5 Schichten erstellt haben (oder weniger wenn manche schon existierten)
        expect(result.created).toBeGreaterThanOrEqual(4)
        expect(result.created).toBeLessThanOrEqual(5)

        const countAfter = await prisma.timesheet.count({ where: { employeeId: employee!.id } })
        expect(countAfter).toBeGreaterThanOrEqual(countBefore + 4)

        // Cleanup - lösche die erstellten Schichten über ihre IDs
        if (result.shifts && result.shifts.length > 0) {
            const shiftIds = result.shifts.map((s: any) => s.id)
            await prisma.timesheet.deleteMany({
                where: { id: { in: shiftIds } },
            })
        }
    })

    test('Schicht bearbeiten', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Erstelle Test-Schicht
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 45)

        const shift = await prisma.timesheet.create({
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

        // Update via API
        const response = await page.request.put('/api/admin/schedule', {
            data: {
                id: shift.id,
                plannedStart: '07:00',
                plannedEnd: '15:00',
            },
        })

        expect(response.ok()).toBeTruthy()

        const updated = await prisma.timesheet.findUnique({ where: { id: shift.id } })
        expect(updated?.plannedStart).toBe('07:00')
        expect(updated?.plannedEnd).toBe('15:00')

        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('Schicht löschen', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

        // Erstelle Test-Schicht
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 46)

        const shift = await prisma.timesheet.create({
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

        // Delete via API
        const response = await page.request.delete(`/api/admin/schedule?id=${shift.id}`)
        expect(response.ok()).toBeTruthy()

        // Verifiziere Löschung
        const deleted = await prisma.timesheet.findUnique({ where: { id: shift.id } })
        expect(deleted).toBeNull()
    })

    test('Schicht mit Backup erstellen', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 47)
        const dateStr = testDate.toISOString().split('T')[0]

        // Lösche eventuelle existierende Schicht
        const month = testDate.getMonth() + 1
        const year = testDate.getFullYear()

        await prisma.timesheet.deleteMany({
            where: {
                employeeId: employee!.id,
                month,
                year,
                plannedStart: '08:00',
                plannedEnd: '16:00',
            },
        })

        // Create via API
        const response = await page.request.post('/api/admin/schedule', {
            data: {
                employeeId: employee!.id,
                date: dateStr,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                backupEmployeeId: backupEmployee!.id,
            },
        })

        expect(response.ok()).toBeTruthy()
        const apiResult = await response.json()

        // API gibt die erstellte Schicht zurück
        expect(apiResult.id).toBeTruthy()

        const newShift = await prisma.timesheet.findUnique({
            where: { id: apiResult.id },
        })

        expect(newShift).toBeTruthy()
        expect(newShift?.backupEmployeeId).toBe(backupEmployee!.id)

        // Cleanup
        if (newShift) {
            await prisma.timesheet.delete({ where: { id: newShift.id } })
        }
    })
})
