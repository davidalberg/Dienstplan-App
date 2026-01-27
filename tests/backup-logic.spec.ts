import { test, expect } from './fixtures'

/**
 * KRITISCHE TESTS: Backup-Logik
 *
 * Diese Tests verifizieren die kritische Geschäftslogik für Backup-Schichten:
 * 1. Hauptmitarbeiter meldet sich krank → Backup wird aktiviert
 * 2. Backup meldet sich krank → Backup-Schicht wird GELÖSCHT (kein Krankheitstag!)
 * 3. Hauptmitarbeiter kommt zurück → Backup-Schicht wird entfernt
 */
test.describe('Backup-Logik (KRITISCH)', () => {
    test.describe.configure({ mode: 'serial' }) // Tests müssen sequentiell laufen

    test('Hauptmitarbeiter meldet sich krank -> Backup-Schicht wird aktiviert', async ({
        page,
        prisma,
        testUsers,
        loginPage,
    }) => {
        // Login als Hauptmitarbeiter
        await loginPage.goto()
        await loginPage.login(testUsers.employee.email, testUsers.employee.password)
        await page.waitForURL('**/dashboard')

        // Hole die erste Schicht mit Backup
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

        const shifts = await prisma.timesheet.findMany({
            where: {
                employeeId: employee!.id,
                backupEmployeeId: backupEmployee!.id,
                absenceType: null, // Noch nicht krank
            },
            orderBy: { date: 'asc' },
            take: 1,
        })

        expect(shifts.length).toBeGreaterThan(0)
        const testShift = shifts[0]

        // Lösche eventuelle existierende Backup-Schichten für dieses Datum
        await prisma.timesheet.deleteMany({
            where: {
                employeeId: backupEmployee!.id,
                date: testShift.date,
                note: { contains: 'Eingesprungen' },
            },
        })

        // Markiere als krank via API
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: testShift.id,
                absenceType: 'SICK',
            },
        })

        expect(response.ok()).toBeTruthy()

        // Warte auf DB-Verarbeitung
        await page.waitForTimeout(500)

        // Verifiziere in DB: Backup-Schicht wurde erstellt
        const backupShift = await prisma.timesheet.findFirst({
            where: {
                employeeId: backupEmployee!.id,
                date: testShift.date,
                note: { contains: 'Eingesprungen' },
            },
        })

        expect(backupShift).toBeTruthy()
        expect(backupShift?.status).toBe('PLANNED')
        expect(backupShift?.note).toContain('Eingesprungen für Krankheit')

        // Cleanup: Reset absenceType
        await prisma.timesheet.update({
            where: { id: testShift.id },
            data: { absenceType: null },
        })
        if (backupShift) {
            await prisma.timesheet.delete({ where: { id: backupShift.id } })
        }
    })

    test('Backup meldet sich krank -> Backup-Schicht wird GELÖSCHT (kein Krankheitstag!)', async ({
        page,
        prisma,
        testUsers,
        loginPage,
    }) => {
        // Setup: Erstelle eine Backup-Schicht (wie vom System)
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        // Verwende ein Datum, das nicht mit anderen Tests kollidiert
        const testDate = new Date(today)
        testDate.setDate(testDate.getDate() + 15) // 15 Tage in der Zukunft

        // Lösche eventuelle existierende Schichten für dieses Datum
        await prisma.timesheet.deleteMany({
            where: {
                employeeId: backupEmployee!.id,
                date: testDate,
            },
        })

        // Erstelle Backup-Schicht mit "Eingesprungen" Note
        const backupShift = await prisma.timesheet.create({
            data: {
                employeeId: backupEmployee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                note: 'Eingesprungen für Krankheit',
                breakMinutes: 0,
            },
        })

        // Login als Backup-Mitarbeiter
        await loginPage.goto()
        await loginPage.login(testUsers.backup.email, testUsers.backup.password)
        await page.waitForURL('**/dashboard')

        // Finde die Backup-Schicht im Dashboard und markiere sie als krank
        // Da wir die genaue Position nicht kennen, machen wir den API-Call direkt
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: backupShift.id,
                absenceType: 'SICK',
            },
        })

        const result = await response.json()

        // KRITISCHER TEST: Backup-Schicht sollte GELÖSCHT sein
        expect(result.deleted).toBe(true)
        expect(result.message).toContain('Backup-Schicht wurde gelöscht')

        // Verifiziere in DB: Schicht existiert nicht mehr
        const deletedShift = await prisma.timesheet.findUnique({
            where: { id: backupShift.id },
        })

        expect(deletedShift).toBeNull()

        // WICHTIG: Backup sollte KEINEN Krankheitstag bekommen
        const backupSickShift = await prisma.timesheet.findFirst({
            where: {
                employeeId: backupEmployee!.id,
                date: testDate,
                absenceType: 'SICK',
            },
        })

        expect(backupSickShift).toBeNull()
    })

    test('Hauptmitarbeiter kommt zurück -> Backup-Schicht wird entfernt', async ({
        page,
        prisma,
        testUsers,
        loginPage,
    }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        // Verwende ein anderes Datum
        const testDate = new Date(today)
        testDate.setDate(testDate.getDate() + 20) // 20 Tage in der Zukunft

        // Lösche eventuelle existierende Schichten
        await prisma.timesheet.deleteMany({
            where: {
                date: testDate,
                employeeId: { in: [employee!.id, backupEmployee!.id] },
            },
        })

        // Erstelle Hauptschicht als SICK
        const mainShift = await prisma.timesheet.create({
            data: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                absenceType: 'SICK',
                backupEmployeeId: backupEmployee!.id,
                breakMinutes: 0,
            },
        })

        // Erstelle Backup-Schicht
        const backupShift = await prisma.timesheet.create({
            data: {
                employeeId: backupEmployee!.id,
                date: testDate,
                plannedStart: mainShift.plannedStart!,
                plannedEnd: mainShift.plannedEnd!,
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                note: 'Eingesprungen für Krankheit',
                breakMinutes: 0,
            },
        })

        // Login als Hauptmitarbeiter und entferne Krankheitsstatus
        await loginPage.goto()
        await loginPage.login(testUsers.employee.email, testUsers.employee.password)
        await page.waitForURL('**/dashboard')

        // API-Call: Hauptmitarbeiter ist wieder gesund
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: mainShift.id,
                absenceType: '', // Keine Abwesenheit mehr
            },
        })

        expect(response.ok()).toBeTruthy()

        await page.waitForTimeout(500)

        // Verifiziere: Backup-Schicht wurde gelöscht
        const deletedBackupShift = await prisma.timesheet.findUnique({
            where: { id: backupShift.id },
        })

        expect(deletedBackupShift).toBeNull()

        // Cleanup
        await prisma.timesheet.deleteMany({
            where: { id: mainShift.id },
        })
    })

    test('Backup-Schicht ohne "Eingesprungen" Note wird NICHT gelöscht bei Krankheit', async ({
        page,
        prisma,
        testUsers,
        loginPage,
    }) => {
        // Dieser Test verifiziert, dass normale Schichten (ohne "Eingesprungen")
        // bei Krankheit NICHT gelöscht werden

        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

        const testDate = new Date()
        testDate.setDate(testDate.getDate() + 25) // 25 Tage in der Zukunft
        testDate.setHours(0, 0, 0, 0)

        // Lösche eventuelle existierende Schichten
        await prisma.timesheet.deleteMany({
            where: {
                employeeId: backupEmployee!.id,
                date: testDate,
            },
        })

        // Erstelle normale Schicht (OHNE "Eingesprungen" Note)
        const normalShift = await prisma.timesheet.create({
            data: {
                employeeId: backupEmployee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                status: 'PLANNED',
                note: 'Normale Schicht', // KEINE "Eingesprungen" Note!
                breakMinutes: 0,
            },
        })

        // Login als Backup-Mitarbeiter
        await loginPage.goto()
        await loginPage.login(testUsers.backup.email, testUsers.backup.password)
        await page.waitForURL('**/dashboard')

        // Markiere als krank
        const response = await page.request.post('/api/timesheets', {
            data: {
                id: normalShift.id,
                absenceType: 'SICK',
            },
        })

        const result = await response.json()

        // Diese Schicht sollte NICHT gelöscht werden (normale Krankmeldung)
        expect(result.deleted).toBeFalsy()

        // Schicht sollte noch existieren, aber mit SICK status
        const updatedShift = await prisma.timesheet.findUnique({
            where: { id: normalShift.id },
        })

        expect(updatedShift).toBeTruthy()
        expect(updatedShift?.absenceType).toBe('SICK')

        // Cleanup
        await prisma.timesheet.delete({ where: { id: normalShift.id } })
    })
})
