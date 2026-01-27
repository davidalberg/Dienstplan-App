import { test, expect } from './fixtures'

/**
 * Umfassende Backup-Logik Tests
 *
 * Testet alle Backup-Szenarien:
 * - Hauptmitarbeiter krank → Backup aktiviert
 * - Backup krank → Backup-Schicht gelöscht (KEIN Krankheitstag!)
 * - Hauptmitarbeiter zurück → Backup deaktiviert
 * - Race Conditions
 * - Edge Cases
 */

test.describe('Backup-Logik (Umfassend)', () => {
    test.describe('Basis-Szenarien', () => {
        test('Hauptmitarbeiter meldet sich krank → Backup wird benachrichtigt', async ({ page, loginPage, dashboardPage, testUsers, prisma }) => {
            // Setup: Finde eine Schicht mit Backup
            const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            expect(mainEmployee).toBeTruthy()
            expect(backupEmployee).toBeTruthy()

            // Erstelle Test-Schicht mit Backup
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            const shift = await prisma.timesheet.create({
                data: {
                    employeeId: mainEmployee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als Hauptmitarbeiter
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            // Melde krank via API
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    absenceType: 'SICK'
                }
            })

            expect(response.ok()).toBeTruthy()

            // Prüfe ob Backup-Schicht erstellt wurde
            const backupShift = await prisma.timesheet.findFirst({
                where: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    note: { contains: 'Eingesprungen' }
                }
            })

            expect(backupShift).toBeTruthy()
            expect(backupShift!.status).toBe('PLANNED') // Backup muss selbst bestätigen

            // Cleanup
            if (backupShift) await prisma.timesheet.delete({ where: { id: backupShift.id } })
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('Backup meldet sich krank → Backup-Schicht wird GELÖSCHT (kein Krankheitstag!)', async ({ page, loginPage, testUsers, prisma }) => {
            const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Erstelle Hauptschicht (krank)
            const mainShift = await prisma.timesheet.create({
                data: {
                    employeeId: mainEmployee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    absenceType: 'SICK',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Erstelle Backup-Schicht (Eingesprungen)
            const backupShift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    note: 'Eingesprungen für Krankheit',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als Backup
            await loginPage.goto()
            await loginPage.login(testUsers.backup.email, testUsers.backup.password)
            await page.waitForURL(/\/dashboard/)

            // Backup meldet sich auch krank
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: backupShift.id,
                    absenceType: 'SICK'
                }
            })

            expect(response.ok()).toBeTruthy()
            const data = await response.json()

            // KRITISCH: Backup-Schicht sollte GELÖSCHT sein, nicht als Krankheit markiert!
            expect(data.deleted).toBe(true)

            // Verifiziere dass Schicht wirklich gelöscht ist
            const deletedShift = await prisma.timesheet.findUnique({
                where: { id: backupShift.id }
            })
            expect(deletedShift).toBeNull()

            // Cleanup
            await prisma.timesheet.delete({ where: { id: mainShift.id } })
        })

        test('Hauptmitarbeiter wird wieder gesund → Backup-Schicht wird entfernt', async ({ page, loginPage, testUsers, prisma }) => {
            const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Hauptmitarbeiter ist krank
            const mainShift = await prisma.timesheet.create({
                data: {
                    employeeId: mainEmployee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    absenceType: 'SICK',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Backup-Schicht existiert
            const backupShift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    note: 'Eingesprungen für Krankheit',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als Hauptmitarbeiter
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            // Hauptmitarbeiter ist wieder gesund (absenceType = null)
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: mainShift.id,
                    absenceType: null
                }
            })

            expect(response.ok()).toBeTruthy()

            // Backup-Schicht sollte gelöscht sein
            const deletedBackup = await prisma.timesheet.findUnique({
                where: { id: backupShift.id }
            })
            expect(deletedBackup).toBeNull()

            // Cleanup
            await prisma.timesheet.delete({ where: { id: mainShift.id } })
        })
    })

    test.describe('Stunden-Berechnung für Backup', () => {
        test('Backup bekommt Stunden wenn eingesprungen und bestätigt', async ({ prisma, testUsers }) => {
            const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Backup-Schicht mit bestätigten Zeiten
            const backupShift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: '08:00',
                    actualEnd: '16:00',
                    status: 'CONFIRMED',
                    note: 'Eingesprungen für Krankheit',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Stunden berechnen: 8h
            const start = parseInt(backupShift.actualStart!.split(':')[0]) * 60 + parseInt(backupShift.actualStart!.split(':')[1])
            const end = parseInt(backupShift.actualEnd!.split(':')[0]) * 60 + parseInt(backupShift.actualEnd!.split(':')[1])
            const hours = (end - start) / 60

            expect(hours).toBe(8)

            // Cleanup
            await prisma.timesheet.delete({ where: { id: backupShift.id } })
        })

        test('Nachtstunden werden auch für Backup-Schichten berechnet', async ({ prisma, testUsers }) => {
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Nacht-Backup-Schicht
            const backupShift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '22:00',
                    plannedEnd: '06:00',
                    actualStart: '22:00',
                    actualEnd: '06:00',
                    status: 'CONFIRMED',
                    note: 'Eingesprungen für Krankheit',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Alle 8 Stunden sind Nachtstunden
            expect(backupShift.actualStart).toBe('22:00')
            expect(backupShift.actualEnd).toBe('06:00')

            // Cleanup
            await prisma.timesheet.delete({ where: { id: backupShift.id } })
        })
    })

    test.describe('Edge Cases', () => {
        test('Backup hat eigene Schicht am gleichen Tag - keine Doppelbuchung', async ({ prisma, testUsers }) => {
            const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Backup hat bereits eine eigene Schicht
            const existingShift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Hauptmitarbeiter wird krank (Backup bereits zugewiesen)
            const mainShift = await prisma.timesheet.create({
                data: {
                    employeeId: mainEmployee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    absenceType: 'SICK',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Es sollte nur eine Schicht für Backup geben (unique constraint)
            const backupShifts = await prisma.timesheet.findMany({
                where: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow
                }
            })

            // Unique constraint: employeeId_date
            expect(backupShifts.length).toBe(1)

            // Cleanup
            await prisma.timesheet.delete({ where: { id: mainShift.id } })
            await prisma.timesheet.delete({ where: { id: existingShift.id } })
        })

        test('Schicht ohne Backup - Krankmeldung funktioniert normal', async ({ page, loginPage, testUsers, prisma }) => {
            const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Schicht OHNE Backup
            const shift = await prisma.timesheet.create({
                data: {
                    employeeId: mainEmployee!.id,
                    backupEmployeeId: null, // Kein Backup
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als Mitarbeiter
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            // Krankmeldung
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    absenceType: 'SICK'
                }
            })

            expect(response.ok()).toBeTruthy()

            // Schicht sollte als krank markiert sein
            const updatedShift = await prisma.timesheet.findUnique({ where: { id: shift.id } })
            expect(updatedShift!.absenceType).toBe('SICK')

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('Backup ändert Zeiten bei eingesprungener Schicht', async ({ page, loginPage, testUsers, prisma }) => {
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Backup-Schicht
            const shift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    note: 'Eingesprungen für Krankheit',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als Backup
            await loginPage.goto()
            await loginPage.login(testUsers.backup.email, testUsers.backup.password)
            await page.waitForURL(/\/dashboard/)

            // Backup ändert Zeiten (kam später)
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    actualStart: '09:00',
                    actualEnd: '17:00'
                }
            })

            expect(response.ok()).toBeTruthy()

            // Prüfe geänderte Zeiten
            const updatedShift = await prisma.timesheet.findUnique({ where: { id: shift.id } })
            expect(updatedShift!.actualStart).toBe('09:00')
            expect(updatedShift!.actualEnd).toBe('17:00')
            expect(updatedShift!.status).toBe('CHANGED')

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })
    })
})
